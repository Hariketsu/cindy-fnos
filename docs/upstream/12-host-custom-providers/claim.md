# #10644 认领评论草稿

> 发在 https://github.com/makecindy/cindy/issues/10644 下。经用户审阅后发出。
> 之前的路线提问（route-question.md）没有得到答复；这里按分诊给出的方案推进。

---

我按上面分诊的方案来做，先提第一个 PR，只覆盖「添加供应商」走通所需的两条通道：

- 在 `packages/maker-shared/src/hostChannelContract.ts` 增加 `maker:provider:custom:create` 与 `maker:provider:models-fetch`，在 `apps/host/src/service.mjs` 接入路由；两者都要求已认证的控制端（`context.caller`），否则返回 403。
- Host 不另写一套供应商逻辑：像 `apps/host/src/agent/auth-service.ts` 复用 `registerMakerAuthHandlers` 那样，在 Host 内注册 Desktop 的 `registerProviderHandlers`，只暴露这两条通道，校验、并发排队和回滚都沿用 Desktop 的实现。密钥与请求头写入 Host 现有的加密凭据存储。
- `update`／`delete`／`disconnect` 留到后续 PR。

验收按上面列出的完成条件：在 fnOS（linux-arm64）上用网页端添加 DeepSeek 预设、拉取模型、选中并完成一轮流式对话。

之前我在评论里问过写通道走哪条路，这里就按分诊的方案 A 推进；如果维护者另有考虑，请直接指出。
