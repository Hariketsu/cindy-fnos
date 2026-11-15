# #10644 评论草稿：实现前确认写入通道走哪条路

> 状态：已经用户审阅，2026-11-15 发出：https://github.com/makecindy/cindy/issues/10644#issuecomment-6896283058
> 代码位置按上游 `main` `ae78647` 核对（2026-11-15）。
> 背景：分诊回复认可方向、欢迎提 PR，建议在 `hostChannelContract.ts` 与 `service.mjs` 中接入。核对代码时发现 Host 另有一套通用 IPC 通道，且注明暂不接写操作，所以动手前先问维护者。

---

感谢分诊。我准备来实现，动手前想先确认一个方向问题。

核对 `ae78647` 时注意到 Host 现在有两种接入方式：

1. **契约通道**：`packages/maker-shared/src/hostChannelContract.ts` 中的 `HOST_CONTRACT_CHANNELS`，加上 `apps/host/src/service.mjs` 里的路由。分诊建议走这条。
2. **通用 IPC 通道**：`POST /api/ipc/<channel>`（`packages/maker-shared/src/hostIpcRegistry.ts` + `apps/host/src/ipc-route.mjs`），调用方、Host 实例、契约指纹、owner、参数的准入集中处理。但注释写明目前只开放读：
   - `hostIpcRegistry.ts`：「Reads only in batch 1a; writes need ordering and no-replay rules first.」
   - 同文件头部：写通道注册前，处理函数要先加上下文（caller audience、ingress owner stamp、AbortSignal）。
   - `ipc-route.mjs`：「Add a handler context before binding writes or long reads.」

`maker:provider:custom:create/update/delete/disconnect` 是写操作，`maker:provider:models-fetch` 是会向外发请求的长读。想请教：

- **A.** 先按分诊建议走契约通道：在 `service.mjs` 中校验 `context.caller`，处理函数复用 Desktop 的 `registerProviderHandlers`（它不直接依赖 Electron，Host 只绑定这几个通道，注入 Host 侧依赖），换号检查、凭据暂存与回滚都沿用原逻辑；以后通用通道支持写时再迁移。
- **B.** 先为通用通道补上写操作需要的处理函数上下文和规则，再把这几个通道注册进去。

如果是 B，写操作的顺序和防重放规则是否已有设计，或希望由谁来定？

范围上我打算拆成两个 PR：先做 `create` 与 `models-fetch`，满足分诊列出的完成条件（fnOS linux-arm64 上用 DeepSeek 预设添加、拉取模型、流式对话）；`update/delete/disconnect` 随后单独提。

另外，关于分诊提到的 shim 兜底：`AddProviderWizard.tsx` 会捕获 `fetchProviderModels` 的任何异常并按失败处理，所以把兜底的 `null` 改成 `HOST_CHANNEL_UNSUPPORTED`，向导上的显示不会变化。我打算不单独提 PR，在接通 `models-fetch` 时一并处理（通道注册后，这个方法不再走兜底）。这样可以吗？
