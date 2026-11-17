# #10600 认领评论草稿

> 发在 https://github.com/makecindy/cindy/issues/10600 下。经用户审阅后发出。

---

我来做第一阶段，按上面分诊的建议拆分，PR 只覆盖：

- Host 侧认证服务：复用 `@cindy/auth-client` 的 `CindyAuthClient`／`reduceAuthFlow` 与现有托管回调轮询，提供登录状态读取与登录动作派发，只支持社交／SSO 登录；写操作要求已认证的控制端（`context.caller`）。
- `apps/web/shim.js` 接入这些通道，不再固定返回 `{ step: 'entry' }`。
- 登出只注销账号、保留 `cindy_host_web` 配对，回到登录页，不再跳转 `/connect`。
- 未登录冷启动后登录成功，在进程内调用 `ensureRuntime(ownerId)` 装配运行时，不需要重启；运行中切换到另一个账号仍不支持。

不在这个 PR 里：手机号／邮箱验证码（`LoginCaptchaOverlay` 的 `<webview>`）、多账号切换、本地模式（#10601）、子路径部署（#10614，单独的 PR）。

如果方向上有不同意见，请直接在这里指出。
