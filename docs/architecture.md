# 架构

> 本文回答：系统如何工作？为什么这样设计？做了哪些重要的技术取舍？
> 当架构或取舍发生变化时，必须同步更新本文。

## 1. 一句话

**Cindy 桌面版 = 前台 Renderer（React 界面）+ 后台 Electron 主进程。**
飞牛版保留前台不动，把后台换成 Cindy 官方的无界面 Host，再用一层 fnOS Adapter 接入飞牛的网关、窗口和原生能力。

```
           Cindy 桌面版（Electron）                       Cindy 飞牛版
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ 前台：Renderer（React 界面）          │ = │ 前台：同一份 Renderer                 │ ← 用户看到的
├──────────── preload / IPC ───────────┤   ├──────── shim / HTTP·SSE ─────────────┤
│ 后台：Electron 主进程                 │ → │ 后台：Cindy Host（Node，常驻 NAS）    │ ← 用户看不到的
└──────────────────────────────────────┘   └──────────────────────────────────────┘
```

## 2. 组件与请求路径

```
飞牛 Web 桌面
 ├─ [iframe 入口] Cindy            ─┐
 ├─ [url 入口]   Cindy（新标签页）  ├─► /app/cindy/... ─► 飞牛统一网关（校验 NAS 登录态，附加 X-Trim-* 请求头）
 └─ [打开方式]   交给 Cindy ?path=  ─┘                              │ Unix Socket：target/app.sock
                                                                    ▼
                                ┌──────────────── fnOS Adapter（本项目，Node，包用户）────────────────┐
                                │ 身份：只放行 X-Trim-Isadmin=true                                      │
                                │ 路由：去掉 /app/cindy 前缀（实测网关不剥离）                          │
                                │ 代理：改写 Host/Origin、注入 Host bearer、按飞牛窗口调整 iframe 策略 │
                                │ 页面：首次登录、未就绪页与错误页、文件交接页                          │
                                │ 注入：fnos-bridge.js（在 Cindy shim 之后加载）                        │
                                └──────────────────────────────┬───────────────────────────────────────┘
                                                               │ loopback
                                                               ▼
                                Cindy Host（上游 build.mjs 产物 + 必要补丁）
                                Renderer 静态资源 · Agent Runtime（Pi）· SQLite · Chromium
                                数据：$TRIM_PKGVAR      密钥：$TRIM_PKGETC/credential.key
```

| 组件 | 来源 | 职责 |
|---|---|---|
| Renderer | 上游 `apps/desktop/src/renderer`，不修改 | 全部界面与交互 |
| Web shim | 上游 `apps/web/shim.js` | 在浏览器中提供 `window.electronAPI`，转发到 Host |
| Cindy Host | 上游 `apps/host` | Agent Runtime、任务与消息、凭据、数据库 |
| fnOS Adapter | 本项目 `adapter/` | 飞牛网关 ↔ Host 的身份、路由与安全边界；Cindy 之外的页面 |
| fnos-bridge | 本项目 `bridge/` | 用飞牛 JS SDK 覆盖依赖 Electron 原生能力的 `electronAPI` 方法 |
| fpk 包 | 本项目 `fpk/` | manifest、生命周期脚本、入口、权限与资源声明 |

## 3. 核心设计：Electron 原生能力 → 飞牛原生能力

Renderer 中有一部分功能依赖 Electron 的系统能力，在 Web 版里显示为不可用。fnos-bridge 用飞牛开放 API 补上这些能力：

| 能力 | 桌面版 | 飞牛版 |
|---|---|---|
| 选择工作目录 | Electron `dialog` | `pickSharedFile({directory:true})`，选中后系统自动授予应用用户访问权限 |
| 打开文件 / 在文件夹中显示 | `shell.openPath` / `showItemInFolder` | `openFile` / `openFileManager` |
| 主题、语言 | 跟随操作系统 | `getPlatformConfig` + `$on('os/theme' / 'os/language')` |
| 窗口标题 | `BrowserWindow.setTitle` | `setTitle`，跟随当前任务名 |
| 路径展示 | 本地路径 | `convertPath`：`/vol1/1000/...` → 「我的文件/...」 |

如果当前环境不支持 JS SDK（系统版本低于 1.2.0401、在独立浏览器中打开、手机 App），则静默退回 shim 原本的行为。

## 4. 用户旅程

1. **安装**：在应用中心安装。向导提示需要 Cindy 账号，并说明 Agent 能在授权目录内读写文件、执行命令。安装时生成凭据密钥，创建 `cindy/workspace` 共享目录。
2. **首次打开**：Host 报告未登录时，Adapter 把首页（以及退出登录后的 `/connect`）转到自己的登录页 `/_fnos/login`。用户点「使用微信登录」后，Adapter 运行 `cmd/main host-login`：先停止 Host（上游 `cindy-host login` 要求 Host 未运行），再运行 `cindy-host login --method=wechat --no-open`，把授权链接交给页面，用户在新标签页里用微信扫码；授权经中国大陆版的托管回调完成，Host 重启后页面自动进入 Cindy。登录期间 `status` 仍报告运行中，取消或失败也会重启 Host。目前只支持微信：上游 Host 尚未实现手机号登录（见 TODO「上游事项」）。
3. **日常使用**：窗口里就是原版 Cindy。默认工作区是 `cindy/workspace`；选择其他目录时弹出飞牛原生选择器；Agent 的产物可以一键在飞牛文件管理器中打开。
4. **右键文件**：「打开方式 → 交给 Cindy」进入交接页，可选择新建任务或加入当前任务、选择工作目录。需要授权时调用 `authorizeUserFile`。入口可以在飞牛应用设置里关闭，交接页也提供「记住选择」。
5. **异常**：启动失败的原因会显示在应用中心（`TRIM_TEMP_LOGFILE`）；运行中出错时，窗口内显示可读的错误页，而不是白屏。
6. **卸载**：向导询问是否保留任务数据、凭据和工作区。

## 5. 重要取舍

| 取舍 | 选择 | 放弃了什么 / 代价 |
|---|---|---|
| Renderer + Host，而不是 Electron + 远程画面（Xpra） | 界面由用户浏览器原生渲染，NAS 负载低，适配移动端 | Host 尚未实现的后台功能暂时不可用，需要等上游从 Electron 中拆出 |
| 反向代理 Adapter，而不是修改 Host 的安全校验 | Host 保持只监听 loopback 的安全边界，上游代码改动最少 | 多一个进程、多一跳代理 |
| 上游优先，而不是 fork | 长期能跟随上游更新 | 部分能力要等上游合入 |
| 应用自管凭据密钥，而不是系统密钥环 | NAS 重启后可以无人值守恢复 | 拿到 root 或磁盘就能解密 |
| 仅管理员、单账号 | 安全边界简单清晰 | 家庭其他成员暂时不能各用各的 |
| 只内置 Pi | 包更小，依赖更少 | 不能直接使用 Claude Code / Codex |

## 6. 为什么 Host 的功能比桌面版少

Cindy 最初是纯桌面产品，业务逻辑大量直接调用 Electron API。上游 2026-11-04 的分析显示，桌面主进程中有 485 个文件直接 `import 'electron'`，Agent 装配入口 `getMaker()` 的 177 个直接依赖里，有 118 个在 6 层引用之内会碰到 Electron。
上游正在把这些依赖改成注入式装配，每拆出一块，Host 就多一块能力。本项目**不参与这项重构**，只跟随上游的进度。
详见上游的 `docs/host/architecture-and-status.md` 与 `docs/host/maker-assembly-extraction-plan.md`。

## 7. 安全边界

- 飞牛网关只校验「已登录 NAS」；Adapter 再校验「是管理员」；Host bearer 只保存在服务端，不暴露给浏览器。登录页和登录接口经过同样的管理员与 Origin 校验；授权链接只含 PKCE challenge 和 `client_state`（哈希），取回授权码用的 `pollSecret` 留在 `cindy-host login` 进程内。
- **实测：存储空间带 `trimacl` 挂载，飞牛管理员组可以读取应用目录中 600 权限的文件**（凭据密钥、Host API token；见平台笔记）。这与「Cindy 只对管理员开放」的信任边界一致，但文件权限只能挡住非管理员。
- Agent 以包用户身份运行，不用 root，不加入额外的用户组；只能访问 `cindy/workspace` 和管理员授权的目录。
- **实测：Cindy 页面与飞牛桌面同源，iframe 也没有 sandbox**（见 [fnos-platform-notes.md](fnos-platform-notes.md)）。Cindy 页面中的脚本可以访问飞牛桌面，相当于拿到了当前用户的飞牛会话。因此 Adapter 必须设置严格的 CSP，Agent 生成的 HTML 必须继续使用上游的沙箱渲染，不能放宽。
- 凭据与 API Key 只以加密形式保存在应用数据目录中，不进入日志、仓库或前端。
