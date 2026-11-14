# Issue 草稿：独立 Host 的网页端「跳过登录」无效

> 状态：**已提交**（经用户审阅）：https://github.com/makecindy/cindy/issues/10601
> 模板：`.github/ISSUE_TEMPLATE/feature_request.yml`（功能建议）。
> 依赖：网页端要先越过启动检查才能看到登录页，见 `docs/upstream/web-env-check/`。

**标题**：`feat(host): 独立 Host 支持不登录 Cindy 账号使用（本地模式）`

---

### 使用场景 / Use case

桌面版登录页提供「跳过登录」：「无需 Cindy 账号，数据保存在本机。云模型、跨设备与市场服务不可用。」用户可以只用自己的模型 API Key 使用 Cindy。

在 NAS、家用服务器上运行独立 Host 的用户，同样有不注册 Cindy 账号、只用自己的 API Key 的需求，而且这类设备上的数据本来就只在本机。

### 当前问题 / Current limitation

独立 Host 的网页端会显示同一个登录页，「跳过登录」按钮也在，但点击（并同意服务条款）后没有任何变化：

- `apps/web/shim.js` 中 `authEnterLocal` 只是重新读取登录状态：`'authEnterLocal': () => routes['authInitialize']()`；注释写明「The browser cannot create a local identity」；
- 桌面版的 `authEnterLocal` 对应 `auth:enter-local` → `authManager.enterLocalMode()`，Host 没有对应实现；
- 未登录时 Host 的 `/health` 为 `runtime.state=uninitialized`、`detail="no account database in this profile"`，没有可以进入的本地 profile。

实测：独立 Host `b975dc3`，飞牛 fnOS 虚拟机，浏览器访问（2026-11-15）。

### 期望方案 / Proposed solution

Host 支持与桌面版一致的本地模式：

- 在网页端选择「跳过登录」后，Host 建立并打开本地 owner 的数据库，`runtime` 进入就绪状态，用户可以配置自己的模型供应商并使用 Agent；
- 本地模式下不可用的能力（云模型、跨设备、市场）与桌面版保持一致；
- 之后登录 Cindy 账号时，本地数据的处理方式与桌面版一致。

如果维护者认为独立 Host 暂不适合提供本地模式，也希望网页端隐藏「跳过登录」，或在点击后给出明确提示，而不是没有反应。

### 已考虑的替代方案 / Alternatives considered

- **在 Host 外部伪造本地身份**：需要了解并复刻 owner、数据库初始化和凭据布局，与上游实现强耦合，不可取。
- **只隐藏按钮**：能避免困惑，但没有满足不注册账号使用的需求。
