# #10429 变基说明草稿

> 发在 https://github.com/makecindy/cindy/pull/10429 的总评论区，在强制推送变基后的分支之后。经用户审阅后发出。

---

已变基到 `main`（`fe0daea`），没有冲突；两个 commit 的 `git patch-id --stable` 与变基前一致（`5178520`→`5fbb1ad`、`813f482`→`e626da5`），内容没有变化。

变基后在 linux-arm64（Debian 12）上按 `main` 的锁文件重装依赖并重新验证：

```text
cd apps/host && node --import tsx --import ./src/loaders/register-raw.mjs --test src/credentials/*.test.mjs
结果：10 pass，0 fail
pnpm --filter @cindy/host test
结果：520 pass，0 fail
```

上一轮 `Windows unit tests (8/8)` 失败的 `packages/maker-remote-ssh` 用例（5139ms 超过 5000ms 时限）与本 PR 无关，这次推送会重新运行 CI。

另外，#10726（官方 Docker / NAS 部署）的分诊把本 PR 列为容器环境冷启动的前置条件，确认门见 #10437。
