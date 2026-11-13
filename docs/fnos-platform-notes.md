# 飞牛平台行为实测记录

> 本文记录飞牛平台的**实测**行为，补充官方文档没写清楚的部分。Adapter 等设计以本文为准。
> 每条结论都注明测试环境；平台升级后，需要用 `tools/fnos-probe/` 重新验证。

## 测试环境

| 项 | 值 |
|---|---|
| 设备 | UTM 中的 ARM 飞牛 VM（`fnOS-dev`），HTTP 访问 `192.168.64.x:5666` |
| 系统 | 1.2.1010（用安装镜像 1.2.0701 安装后，手动升级） |
| 浏览器 | Ego Lite（Chromium 156），从飞牛 Web 桌面打开 |
| 探针 | `tools/fnos-probe/`（cindyprobe 0.1.0）；后端为 Python 标准库，通过 Unix Socket 接入统一网关 |
| 日期 | 2026-11-13 |

## 统一网关

| 问题 | 实测结果 | 对 Cindy 的影响 |
|---|---|---|
| 是否剥离 `/app/<name>` 前缀 | **不剥离**。应用收到的原始路径就是 `/app/cindyprobe/api/echo` | Adapter 需要自己去掉前缀，再转给 Host |
| 不带末尾斜杠的 `/app/<name>` | 能正常到达应用（200） | 页面里的资源必须用绝对路径；相对路径的解析基准会不一样 |
| 前缀以外的路径（如 `/api/echo`） | 由飞牛自己处理（返回飞牛的 404 页面），不会转发给应用 | 所有请求都必须带前缀 |
| 转发的请求头 | `Host: 192.168.64.x`（**没有端口**）、`X-Forwarded-Proto`、`X-Trim-Userid`、`X-Trim-Username`、`X-Trim-Isadmin`、`Referer`；POST 请求带 `Origin: http://192.168.64.x:5666`（**有端口**） | Host 和 Origin 的端口不一致。Cindy Host 的 loopback/Origin 校验通不过，所以 Adapter 必须改写这两个头 |
| 飞牛登录 Cookie | **不会转发**给应用；应用只能看到 `language` 和自己设置的 Cookie | 网关已经完成身份校验，应用不接触飞牛会话，这一点很好 |
| 应用自己设置的 Cookie（`Path=/app/<name>`） | 能写入，后续请求会带回来 | 可以用 Cookie 维持 Adapter 自己的会话 |
| 响应头 | 原样透传，包括 `X-Frame-Options`、`Content-Security-Policy`、自定义头；网关是 nginx | Adapter 设置的 CSP、iframe 策略都会生效 |
| SSE | **不缓冲**：每秒一个事件，客户端也是每秒收到一个；空闲 70 秒后连接仍然正常 | Cindy 的 SSE 事件流可以直接使用（Host 每 15 秒发一次心跳，远低于 70 秒） |
| Socket 文件 | 应用以默认 umask 创建，权限为 `0755`，网关能正常连接 | 不需要特别处理 |

## iframe 窗口

| 问题 | 实测结果 | 对 Cindy 的影响 |
|---|---|---|
| sandbox 属性 | **没有**。iframe 只设置了 `src` 和 `style` | — |
| 与飞牛桌面是否同源 | **同源**：应用页面可以读取 `window.top.location`，也能访问飞牛桌面的 DOM | **安全风险**：如果 Cindy 页面里执行了恶意脚本，它就能以当前用户的身份操作整个飞牛桌面。Agent 生成的内容必须继续在上游的沙箱中渲染，Adapter 也要设置严格的 CSP。见 architecture.md 的安全边界 |
| HTTP 下的安全上下文 | `isSecureContext=false`，因此没有 `crypto.randomUUID` 和 `navigator.clipboard` | Cindy 的 shim 已经为这两个功能提供了替代实现。HTTPS（5667 端口）还没有测试 |
| localStorage、BroadcastChannel | 都可以使用 | — |

## 入口

| 入口类型 | 实测结果 |
|---|---|
| `iframe`（桌面图标） | 正常打开；窗口标题可以用 `setTitle` 修改 |
| `url`（新标签页） | 在浏览器新标签页打开同一个网关 URL；**不在 iframe 中，JS SDK 的宿主能力不可用**（见下文） |
| `fileTypes` + `noDisplay`（打开方式） | 不出现在桌面上；在文件管理器中右键 →「打开方式」子菜单里显示入口标题。点击后在新窗口打开，URL 附加 `?path=/vol1/1000/.../hello.txt`（URL 编码的绝对路径） |

还没有测试：`fileTypes` 能否用通配符、能否匹配文件夹、多选文件时的行为、`control.accessPerm` 的界面效果、飞牛手机 App 中的表现。

## JS SDK（`@trimjs/web-app` 0.6.0，manifest 中设置了 `micro_app=true`）

| 方法 | iframe 入口 | 新标签页入口 |
|---|---|---|
| `isWeb` / `isStandaloneWeb` | `true` / `false` | `true` / `false`（**和 iframe 中的值一样，没法用它判断宿主能力是否可用**） |
| `ready()` | ok | ok |
| `getPlatformConfig()` | ok：主题、语言、系统版本、日期格式 | 报错：`Host bridge is not available outside iframe or app runtime` |
| `setTitle()` | ok，窗口标题随之改变 | 报同样的错 |
| `pickSharedFile()` | ok：在飞牛窗口内弹出原生的「选择文件夹」对话框（可以新建文件夹）；返回 `{code:0, data:["/vol1/1000/cindy-workspace-test"]}`。后端随后用 `getSharedAccessibleFolders` 能查到这个路径 | 未测 |
| `openFileManager('/vol1')` | ok：打开飞牛文件管理器窗口，并定位到该路径 | 未测 |
| `getHostCapabilities()` | `{runtime:"unknown"}` | 同左 |
| `getHostSnapshot()`（文档未列出） | 不存在（`is not a function`） | — |
| `getSessionCredentials()`（文档未列出） | `NOT_SUPPORTED` | 同左 |

结论：fnos-bridge 应该以「`window.top !== window` 且 `getPlatformConfig()` 调用成功」作为启用飞牛原生能力的条件，不能只看 `isStandaloneWeb`。

## 后端开放 API（`/var/run/trim_open_gateway_apiscope.socket` + `TRIM_API_TOKEN`）

| 接口 | 结果 |
|---|---|
| `trim.file.convertPath` | ok：`/vol1/1000` → 「存储空间 1/cindy-fnos 的文件」；`/vol1/@appshare/<app>` → 「存储空间 1/应用文件/<app>」 |
| `trim.file.getSharedAccessibleFolders` | ok |
| `trim.system.getPlatformConfig` | **403 Forbidden（code 200003）**。resource 中声明了这个 scope，安装时也通过 fnos-cli `--api-scope` 授予了，仍然被拒绝。原因不明，待查；前端的 `getPlatformConfig` 可以替代 |

## 运行环境

| 项 | 值 |
|---|---|
| 运行身份 | 包用户（uid 995，组 991，附加组 992），不是 root |
| 路径 | `TRIM_APPDEST=/vol1/@appcenter/<app>`、`TRIM_PKGVAR=/vol1/@appdata/<app>`、`TRIM_PKGETC=/vol1/@appconf/<app>`、`TRIM_PKGHOME=/vol1/@apphome/<app>`、`TRIM_PKGTMP=/vol1/@apptemp/<app>`，全部可写 |
| 共享目录 | `/vol1/@appshare/<app>/...`；目录权限是 `drwx------`，属主为包用户，管理员也要用 sudo 才能直接读取 |
| 系统自带 | `/usr/bin/python3`（3.11）、git、curl、docker；**没有 Node.js** |
| `TRIM_SYS_ARCH` | `arm` |
| `TRIM_DATA_ACCESSIBLE_PATHS` | 启动时读取；之后通过 pickSharedFile 新增的授权**不会**更新到正在运行的进程的环境变量里，要用后端 API 查询 |

## 尚未验证

- HTTPS（5667）下的行为与安全上下文
- WebSocket（Cindy 的 Web 端目前只用 HTTP 和 SSE）
- `pickUserFile` / `authorizeUserFile`
- 主题/语言事件 `$on('os/theme' | 'os/language')`
- 更长时间（10 分钟以上）的 SSE 空闲
- 应用升级、卸载的生命周期
- x86 真机上的差异
