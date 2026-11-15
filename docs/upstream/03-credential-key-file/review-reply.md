# 回复草稿：PR #10429 的 Windows 测试问题（#10437 分析中的技术阻断点）

> 状态：**已发出**（经用户审阅）：https://github.com/makecindy/cindy/pull/10429#issuecomment-6881428424
> 发布位置：PR #10429 的普通评论。#10437 是维护者确认用的 issue，不在那里回复，以免分散讨论。
> 同时推送新 commit `813f482`（`test(host): skip credential key file cases on Windows`）到 fork 的 `feat/host-credential-key-file`。不变基：PR 目前与 `main` 没有冲突。

---

关于 #10437 分析中提到的 Windows 测试问题：已在 813f482 中处理。

两个新增用例（读写互通、不可用的密钥文件）在 Windows 上会失败，原因与功能无关：Windows 的 `chmod` 只能切换只读位，可写文件的 `stat().mode` 总是 `0o666`，所以用例创建的 `0600` 文件也会被判为「对组或其他用户开放」。密钥文件本来就只是 Linux 的凭据来源（`createCredentialStore` 只在 `platform === 'linux'` 时读取它），所以这两个用例在 Windows 上跳过，并写明原因，写法与 `learn-capture.test.mjs` 中已有的 `skip: process.platform === 'win32' && '<原因>'` 一致。Linux 和 macOS 上照常运行。

验证（linux-arm64，Debian 12，`main` `b975dc3` 加上本 PR 的两个 commit）：

```text
cd apps/host && node --import tsx --import ./src/loaders/register-raw.mjs --test src/credentials/*.test.mjs
结果：10 pass，0 fail
pnpm --filter @cindy/host test
结果：448 pass，0 fail
```

未执行的验证：手头没有 Windows 环境，Windows 上的跳过效果要等 CI 确认。
