# 回复草稿：PR #10429 的 Windows CI 失败（与本 PR 无关的偶发超时）

> 状态：**已发出**（经用户审阅）：https://github.com/makecindy/cindy/pull/10429#issuecomment-6888368946
> 发布位置：PR #10429 的普通评论。
> 不推送新 commit：我们不是上游成员，无法重跑 CI，请维护者重跑；推空 commit 会改动 PR 历史，不采用。
> 依据（2026-11-15 查询）：
> - 本 PR 最新 CI：run `43621055636`（head `813f482`），失败任务 `Windows unit tests (8/8)`（job `132526607605`）；`Windows unit tests` 是汇总任务，随分片失败。
> - 同一文件在无关 PR 上失败：#10607（分支 `fix/issue-10605`，只改 `packages/responses-chat-bridge`），run `43646670653` 的 `Windows unit tests (8/8)`，`beforeAll` 超过 10 秒。
> - `Host regressions (windows-latest)`（job `132526857241`）：`# tests 448 / pass 439 / fail 0 / skipped 9`，其中 `ok 307`、`ok 308` 为本 PR 两个用例的 `# SKIP credential key files rely on POSIX file permission bits`。

---

`813f482` 的 CI 中 `Windows unit tests (8/8)` 失败，和本 PR 的改动无关，麻烦维护者帮忙重跑一下：

- 失败的用例是 `packages/maker-remote-ssh/src/__tests__/remote-agent-installer.test.ts` 的 `probe and bootstrap agree on 'old full package' readiness`，用时 5139ms，超过默认的 5000ms 时限（`Test timed out in 5000ms`）。这个用例在测试里多次启动 Git Bash，文件的 `beforeAll` 注释也提到冷启动的 Windows runner 上 Git Bash 首次启动可能超过 5 秒。
- 本 PR 只改了 `apps/host/src/credentials/store.mjs`、它的测试和两份文档，没有涉及 `packages/maker-remote-ssh`。
- 同一个文件在无关的 #10607 上也失败过（只改 `packages/responses-chat-bridge`，`Windows unit tests (8/8)` 中该文件的 `beforeAll` 超过 10 秒）。

另外补上上次留下的「未执行的验证」：`Host regressions (windows-latest)` 已通过（448 个用例，439 pass，0 fail，9 skipped），本 PR 的两个用例在 Windows 上按预期跳过：

```text
ok 307 - a credential key file holding the keyring secret reads and writes the same v11 records # SKIP credential key files rely on POSIX file permission bits
ok 308 - an unusable credential key file fails with its cause, never falling back # SKIP credential key files rely on POSIX file permission bits
```
