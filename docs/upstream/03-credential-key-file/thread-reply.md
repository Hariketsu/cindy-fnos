# PR #10429 审查讨论回复草稿：Windows 测试失败

> 状态：已经用户审阅，2026-11-16 回复到 Greptile 的讨论（https://github.com/makecindy/cindy/pull/10429#discussion_r4579236114 ），并已 Resolve。
> 背景：修复（`813f482`）和说明当时写在 PR 总评论区，没有回在这条讨论下，讨论一直未解决。
> 同时处理 #10419：那条讨论（`PRRT_kwDOTgdRUs63JeWi`）下已有我们的修复说明，2026-11-16 已 Resolve，没有再回复。

---

已在 813f482 中处理：密钥文件只用于 Linux，检查依赖 POSIX 权限位，而 Windows 上 `chmod` 只能切换只读，`stat.mode` 不反映属主权限。所以这两个用例在 Windows 上跳过（`skip` 写明原因），Linux 和 macOS 照常运行。之后 Windows 分片里这两个用例显示为跳过；分片 8/8 仍失败的是无关的 `maker-remote-ssh` 用例（Git Bash 超时），详见 PR 下的评论。
