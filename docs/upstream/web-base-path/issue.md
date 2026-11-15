# Issue 草稿：网页端支持部署在反向代理的子路径下

> 状态：**已提交**（经用户审阅）：https://github.com/makecindy/cindy/issues/10614
> 模板：`.github/ISSUE_TEMPLATE/feature_request.yml`（功能建议），标题前缀 `feat: `。
> 对应本地补丁 `patches/0004-web-base-path.patch`。本地补丁目前只在本仓库维护，issue 确认方向后再在 `.upstream/cindy` 开 PR 分支。
> 代码位置按上游 `main` `b975dc3` 核对（2026-11-15）。已搜索上游 issue，没有找到子路径、base path、反向代理部署相关的现有 issue。
> 不附截图：问题是请求路径，截图说明不了什么。

**标题**：`feat(web): 网页端支持部署在反向代理的子路径下`

---

### 使用场景 / Use case

在 NAS 或服务器上运行独立 Host 时，常见做法是让反向代理把 Cindy 放在已有站点的某个路径下，而不是单独占一个端口或域名。例如：

- NAS 的应用网关把每个应用挂在 `/app/<名称>/` 下（我们在飞牛 fnOS 上打包 Host，浏览器访问的是 `http://<NAS>/app/cindy/`）
- Nginx/Caddy 的 `location /cindy/ { proxy_pass http://127.0.0.1:<Host 端口>/; }`

### 当前问题 / Current limitation

网页端只能在站点根路径下工作。`apps/web/shim.js` 请求 Host 时用的都是从根开始的绝对路径：

| 位置（`b975dc3`） | 路径 |
|---|---|
| `apps/web/shim.js:128` `rpc` → `requestHost` | `/api/...` |
| `apps/web/shim.js:302` | `/chat` |
| `apps/web/shim.js:1012`、`1014` 事件流 | `/events`、`/api/auth/state` |
| `apps/web/shim.js:733` `authLogout` | 跳转到 `/connect` |

页面在 `/cindy/` 下打开时，这些请求都会离开前缀（`/cindy/api/...` 变成 `/api/...`），被代理交给别的服务或直接 404，界面无法使用。

Renderer 自己的静态资源可以在构建时用 `vite build --base /cindy/` 解决，不需要改代码。Host 返回的 `index.html` 里注入的 `<script src="/shim.js">`（`apps/host/src/server.mjs:69`）也是根路径，但这是 HTML 里的一处固定文本，代理可以在转发时改写（Nginx 的 `sub_filter` 等）。真正需要上游改动的是 shim 里由代码拼出来的这些路径。

### 期望方案 / Proposed solution

shim 读取一个可选的路径前缀 `window.__CINDY_BASE__`，拼在上表这些路径的前面：

```js
const base = String(window.__CINDY_BASE__ ?? '').replace(/\/+$/, '');
// requestHost: fetch(`${base}${path}`, ...)
// /chat、/events 和 logout 跳转同理
```

- 由提供页面的代理在 shim 加载之前设置，例如 `<script>window.__CINDY_BASE__="/cindy/";</script>`；末尾的 `/` 会被忽略。
- 不设置或为空时，所有路径与现在完全相同，直接访问 Host 的用户不受影响。
- Host 本身不需要知道前缀：代理去掉前缀后转发，Host 收到的仍是根路径请求。
- 加一个 `apps/host/src/web-shim.test.mjs` 用例：设置前缀后，Host 请求、事件流和退出跳转都带前缀。

我们在飞牛 fnOS 上用这个改动（加上 `vite build --base /app/cindy/`，以及由我们的代理注入 `__CINDY_BASE__` 并改写 `shim.js` 的 script 标签）实际运行：原版网页端在 `/app/cindy/` 下加载，登录后进入主界面，无头 Chromium 记录到的 113 个请求全部留在前缀内。

如果方向可以，我来提 PR。

### 已考虑的替代方案 / Alternatives considered

- **代理层改写响应里的路径**：这些路径是 shim 在运行时拼出来的，不在 HTML 里，代理没办法可靠地改写。
- **shim 根据 `location.pathname` 或自身 `<script>` 的地址推算前缀**：不需要任何配置，但 Renderer 使用 hash 路由，页面路径和部署前缀的关系依赖部署方式，推算容易出错；显式设置更可预测。
- **Host 增加前缀配置，由 Host 自己处理带前缀的请求并注入前缀**：改动面更大（路由、`/connect` 配对页、`browser-open.mjs` 打开的地址都要跟着改），而代理去掉前缀后转发已经足够。如果维护者更希望由 Host 统一处理，也可以按这个方向做。
