# 适配计划

> 最近更新：2026-11-17 · 上游基线：`makecindy/cindy@fe0daea`
>
> 本文记录**做什么、按什么顺序做、每一步怎样才算完成**。系统如何工作见 [architecture.md](architecture.md)，
> 开发与验证环境见 [development.md](development.md)，当前进度见根目录 [TODO.md](../TODO.md)。

## 1. 目标

在飞牛桌面点开 Cindy，看到的就是 Cindy 桌面版的原版界面，Agent 常驻在 NAS 上运行。
本项目是 Cindy 的第三方 fnOS 平台移植，不是另一个 Agent，也不是简化版 WebUI。

## 2. 已确定的决策

| 议题 | 决定 | 原因 |
|---|---|---|
| UI 路线 | 复用 Cindy 原版 Renderer + 无界面 Cindy Host | 界面像素级一致且由用户浏览器渲染；不选 Electron + 远程画面（输入法、清晰度、延迟都会打折扣） |
| 上游关系 | 上游优先：不 fork，锁定 commit；缺的能力先写 issue、再提关联 issue 的 PR（都先经用户审阅），等待期间才用 `patches/` 小补丁 | 降低长期跟进成本，让功能随上游完善 |
| 账号 | 贴合官方，使用 Cindy 账号登录（Host 的官方用法） | 账号承载远程访问、手机遥控、模型共享等核心价值 |
| 开发期模型 | 使用 Cindy 账号提供的模型（Cindy AI，已用 GLM 5.3 Flash 走通）；自带 Key 的 DeepSeek 供应商待上游 Host 支持后再接入（[#10644](https://github.com/makecindy/cindy/issues/10644)） | 原计划用用户的临时 DeepSeek Key 以不消耗 Cindy 额度，但网页端保存自定义供应商需要的 Host 接口尚不存在（2026-11-15） |
| 内置 Agent | **只内置 Pi**（另带 ripgrep 工具），不内置 Claude Code、Codex | 用户要求；也能减小包体积 |
| Chromium | 内置 | 浏览器自动化与插件沙箱需要 |
| 凭据密钥 | 应用自管：安装时生成，存于 `etc/`（0600，仅包用户可读） | 飞牛没有 Secret Service；NAS 重启后能自动恢复 |
| 用户模型 | v1 仅管理员可用，共用一个 Cindy 账号 | Host 一个进程只服务一个账号 |
| 账号区域 | 默认中国大陆版（`CINDY_HOST_REGION=cn`） | 飞牛 OS 的用户主要在中国大陆 |
| 飞牛整合（v1） | 目录选择器、跟随主题/语言、在飞牛中打开产物、新标签页入口、默认工作区共享目录、窗口标题 + 路径语义化、卸载向导 + 可读错误、右键文件「交给 Cindy」 | 用飞牛原生能力替代 Electron 原生能力，这是「飞牛原生应用」感觉的来源 |
| 目标架构 | 发布 x86（用户的 NAS）与 ARM（开发用的 VM，同时覆盖 ARM 用户） | 开发环境是 Apple Silicon 上的 ARM 飞牛 |
| 开源 | 开源到 GitHub | — |

## 3. 需要上游配合的事项

每项都先写 issue，再提 PR 并在 PR 中关联 issue；草稿放在 `docs/upstream/<序号>-<主题>/`，经用户审阅后才提交（流程见 AGENTS.md「向上游 Cindy 贡献」）。等待合入期间，用 `patches/` 中的补丁过渡。每项在 [TODO.md](../TODO.md) 中跟踪状态。

| 事项 | 现状 | 需要 |
|---|---|---|
| 子路径部署 | Shim 写死根路径（`/api`、`/events`、`/chat`、`/connect`） | 可配置 base path（Renderer 资源用 `vite build --base` 解决）；[#10614](https://github.com/makecindy/cindy/issues/10614)，PR [#11047](https://github.com/makecindy/cindy/pull/11047) |
| 无 Secret Service 的凭据 | Linux 只能用 `secret-tool` | 从文件注入密钥；[#10429](https://github.com/makecindy/cindy/pull/10429) 等维护者确认 |
| 可选 harness | 已合入（[#10418](https://github.com/makecindy/cindy/pull/10418)），连带的启动检查（[#10598](https://github.com/makecindy/cindy/pull/10598)）、模型目录（[#10642](https://github.com/makecindy/cindy/pull/10642)）也已合入 | — |
| Host 发行包可启动 | 已合入（[#10589](https://github.com/makecindy/cindy/pull/10589)） | — |
| Web 首次登录 | 只能用 `cindy-host login` CLI，且只支持社交登录 | 浏览器内登录（[#10600](https://github.com/makecindy/cindy/issues/10600)，第一阶段 PR [#11048](https://github.com/makecindy/cindy/pull/11048)）；在此之前由 Adapter 包装 CLI。中国大陆版微信登录另受 [#10599](https://github.com/makecindy/cindy/issues/10599) 影响 |
| 网页端模型选择器 | 已合入（[#10643](https://github.com/makecindy/cindy/pull/10643)） | — |
| 自定义模型供应商 | 网页端无法保存（Host 无写入接口） | [#10644](https://github.com/makecindy/cindy/issues/10644)，第一个 PR [#11050](https://github.com/makecindy/cindy/pull/11050)（create 与 models-fetch） |
| Host 本地模式（无账号） | Host 拒绝在无账号时启动 Runtime | [#10601](https://github.com/makecindy/cindy/issues/10601)，作为后续可选能力；网页端死入口已由 [#11049](https://github.com/makecindy/cindy/pull/11049) 隐藏 |

`X-Frame-Options`、Host 头校验这类问题由 Adapter 的反向代理处理（这是反向代理的正常职责），不需要上游改动。

## 4. 阶段

每个阶段都有明确的验收标准；验收通过并记录证据后才进入下一阶段。

### P0 · 环境与平台探针

先回答「飞牛平台的实际行为是什么」，再写正式代码。

1. 在 Mac 上用 UTM 安装 ARM 飞牛 VM，存一份干净基线（用户与 Claude 协作，见 development.md）。
2. 环境探测：系统版本是否 ≥ 1.2.0401（开放 API 的要求）、`appcenter-cli`/`fnpack` 能否使用、SSH 可用性。
3. **平台探针应用**：一个只有几十行代码的 fpk，实测文档没写清的行为：
   - 网关是否剥离 `/app/{name}` 前缀，具体转发了哪些请求头
   - iframe 的 sandbox 属性、与飞牛桌面是否同源
   - SSE 是否被网关缓冲，长连接的超时时间
   - `micro_app=true` 对页面加载的影响，JS SDK 各方法在 VM 中是否可用
   - `fileTypes` 是否支持通配、文件夹、多选，入口在菜单中的位置
4. 在 OrbStack Linux 容器中构建 linux-arm64 Host（只带 Pi），装进 VM 手动运行，验证 Host 能在飞牛上启动。

**验收**：探针结论写入 `docs/fnos-platform-notes.md`；Host 在飞牛 VM 中启动后 `/health` 正常。

**结果（2026-11-13）**：通过。另外发现了一个新约束：存储空间的 64KB 簇让原样的 Host 产物膨胀到 24GB，Host 的打包形态要在 P1 之前确定（见 TODO.md）。

### P1 · MVP 应用包

- fpk 结构：manifest、包用户、`data-share: cindy/workspace`、`cmd/main`、iframe 与 url 双入口（仅管理员）。
- Adapter：管理员校验、前缀适配、代理改写、首次登录页、未就绪页与错误页。
- 数据：profile 放在 `var/`，密钥放在 `etc/`；升级时保留。

**验收**（在干净基线上）：安装 → 登录 Cindy 账号 → 用 Cindy 账号提供的模型在飞牛窗口中完成一轮真实任务（流式回复、停止、权限确认）→ 重启 VM 后自动恢复 → 升级 → 卸载。（原计划的「配置 DeepSeek」改为等上游支持自定义供应商后再验，见第 2 节「开发期模型」。）另外，**必须把安装包装到 ext4（64KB 簇）存储空间上**，记录实际占用，确认在可接受范围内（目标待定，建议 1GB 以内）。

### P2 · 飞牛原生整合

- `fnos-bridge.js`：目录选择器、主题/语言、打开产物、`setTitle`、`convertPath`。
- 右键文件「交给 Cindy」与交接页。
- 卸载向导、`TRIM_TEMP_LOGFILE` 可读错误。

**验收**：[architecture.md](architecture.md) 中的「用户旅程」全部走通，并附截图。

### P3 · 真机验收与发布

- 构建 x86 包，在用户的 x86 NAS 上验收（何时安装、怎样安装由用户决定）。
- GitHub Actions：拉取锁定的 commit → 打补丁 → 构建 → `fnpack build` → Release（x86 + ARM）。
- README 中的功能可用性清单按实测结果更新。

**验收**：x86 真机通过 P1 和 P2 的全部验收项；从 Release 下载的安装包能直接安装。

### 后续路线

多用户（每个飞牛用户一个 Host）、开机解锁口令选项、Host 本地模式（待上游支持）、
`usr-local-linker` 暴露 CLI、`showFileDetails` / `openAppSetting`、上架飞牛应用中心。

## 5. 风险

| 风险 | 对策 |
|---|---|
| 上游变化快，接口频繁变动 | 锁定 commit；适配集中在代理层和 bridge 层；定期升级基线并跑冒烟测试 |
| Host 功能缺口（插件执行、定时任务等仍在从 Electron 拆出） | 如实标注功能范围；不自行补实现，跟随上游 |
| 同源 iframe：Cindy 页面与飞牛桌面同源 | P0 探针核查；Adapter 设置严格 CSP |
| Agent 在 NAS 上的权限 | 包用户运行，不用 root，不加入 docker 等用户组；只能访问工作区和管理员授权的目录 |
| 自管密钥：拿到 root 或磁盘就能解密 | 在安装向导与 README 中写明；后续提供解锁口令选项 |
| ARM VM 与 x86 真机的差异 | 平台行为在 VM 中验证，涉及架构的部分（二进制、性能）在真机上验收 |
