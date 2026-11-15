# PR 草稿：CLI 登录结果不是 ok 时说明缺哪一步

> 状态：已经用户审阅，2026-11-15 提交为 https://github.com/makecindy/cindy/pull/10704 ；2026-11-16 合入（`a3028c0`）
> 关联 issue：https://github.com/makecindy/cindy/issues/10599 （分诊回复给出的修法与本 PR 一致）
> 分支：本地 `.upstream/cindy` 中的 `fix/host-login-outcomes`，基于上游 `main`（`961954be9c`），1 个 commit（`4a40115fda`），带 DCO 签名。
> 与 fnOS 适配的关系：Adapter 的登录页已经提示「先在 Cindy 桌面版用同一方式登录并完成设置」；本 PR 合入后，CLI 自己就能给出准确原因。只改 Host，不需要本地补丁过渡。

PR 标题：

```
fix(host): say which sign-in step is missing when the login outcome is not ok
```

---

## 这次改了什么

### 摘要

`cindy-host login` 把授权码兑换的结果当成令牌对，只检查了 `refreshToken`。但 `exchangeAuthorizationCode` 返回的是 `LoginOutcome`，只有 `ok` 带令牌；`binding_required`、`select_account`、`sso_verification_required` 都会落到同一句「authorization exchange returned no refresh token」，看不出该做什么。中国大陆版微信账号未绑定手机号时，第一次在 Host 上登录就会遇到。

现在按结果分别说明：

- `binding_required`：账号需要先绑定手机号（或邮箱），请先用同一方式在 Cindy 桌面版登录并完成绑定，再运行 `cindy-host login`；
- `select_account`：这次登录对应多个 Cindy 账号，CLI 暂不支持选择；
- `sso_verification_required`：需要额外的验证码，CLI 暂不支持；
- 其他未知结果：报出状态名。

报错只说明缺哪一步，不包含结果里的 ticket 和脱敏目标。结果不是 `ok` 时不写入任何凭据（与原来一致）。

### 变更类型

- [ ] `feat` 新功能
- [x] `fix` 缺陷修复
- [ ] `refactor` / `perf` 重构或性能优化
- [ ] `docs` / `test` / `chore` 文档、测试或工程维护
- [ ] 其他：

### 范围

- 关联 Issue / 需求：Closes #10599
- 本 PR 包含：`apps/host/src/auth/login.mjs` 按 `LoginOutcome.status` 分支报错；`login.test.mjs` 用一条表驱动用例覆盖三种非 ok 结果，替换原来「没有 refresh token」的用例；`login.loopback.test.mjs` 两处假数据补上 `status: 'ok'`，与真实返回形状一致。
- 明确不包含：在 CLI 中完成绑定、选择账号或 SSO 验证（分诊回复中划给 #10600 的网页端登录）；`ok` 结果中 `accountToken` 等字段的处理（未改变）。
- 用户可见变化：`cindy-host login` 遇到上述三种结果时，报错从「no refresh token」改为说明缺少的步骤。
- 是否存在 breaking change：无

### UI 变化

不涉及（只改 Host 命令行的报错文字）。

- 引用的设计规范：不涉及

## 怎么验证的

### 自动验证

在 linux-arm64（Debian 12，Node 与 pnpm 按仓库锁定版本）上，`main` `961954be9c` 加本 PR：

```text
pnpm --filter @cindy/host test
结果：509 项，509 通过，0 失败（58 秒）

NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @cindy/host run typecheck
结果：退出 0

pnpm check:test-hygiene
结果：[test-hygiene] PASS (340 files within baseline)
```

修复前先红：只撤回 `login.mjs` 的改动、保留新测试，`login.test.mjs` 的新用例失败，实际报错为 `authorization exchange returned no refresh token`；恢复改动后通过。

测试价值（`apps/host/src/auth/login.test.mjs`）

- 生产入口与可观察结果：`runHostLogin`（`cindy-host login` 调用的入口）；兑换返回非 ok 结果时抛出的报错说明缺少的步骤，不含 ticket 和脱敏目标，凭据存储没有写入。
- Bug／规则依据：#10599。
- 现有覆盖缺口：原用例只模拟了缺 `refreshToken` 的令牌对，这个形状 `loginOutcomeSchema` 不会返回；三种真实的非 ok 结果没有覆盖。
- 最小失败输入：`exchangeAuthorizationCode` 返回 `{ status: 'binding_required', bindType: 'phone', bindTicket: '…' }`。
- tier：unit；纯函数分支，假客户端注入，不需要网络。
- 实测耗时：`node --import tsx --import ./src/loaders/register-raw.mjs --test src/auth/login.test.mjs` 约 0.3 秒。

`apps/host/src/auth/login.loopback.test.mjs` 只把两处假返回补上 `status: 'ok'`，没有新增用例；单独运行约 4.3 秒（文件本身起真实 loopback 服务，与本 PR 无关）。

### 手工验证

未执行，见下一节。

### 未执行的验证

- 没有用真实的「未绑定手机号的微信账号」重新登录验证新报错。#10599 里的原始报错是在 fnOS 虚拟机上用中国大陆版微信登录实测得到的；本 PR 改动的是兑换结果之后的分支，由单测覆盖。

## 风险

### 风险分类

- [x] 无已知风险
- [ ] SQLite / migration
- [ ] system prompt
- [ ] 协议兼容
- [ ] 权限 / 安全 / 用户数据
- [ ] 存量插件兼容（批准状态 / 指纹 / manifest 校验 / 安装布局 / 包格式）
- [ ] 原生层 / fingerprint / OTA
- [ ] 跨平台差异
- [ ] 其他：

### 影响与回滚

- 影响范围：只有 `cindy-host login` 兑换结果非 ok 时的报错文字；ok 路径与凭据写入不变。
- 回滚 / 降级方式：revert 本 commit。

### 提交前检查

- [x] 已 review 完整 diff
- [x] 每个 commit 都带 DCO 签名（`git commit -s`，见 [DCO](../DCO)）
- [x] UI 改动已在「UI 变化」注明引用的设计规范章节（不涉及 UI 则跳过）
- [x] 未提交凭证、令牌或授权文件
- [x] 已核对受影响的文档，行为变化涉及的旧结论已同步修订（不涉及则无需修改文档）
- [x] 已确认测试结果或说明未执行原因
- [x] 涉及数据读取、通知后刷新、界面频繁写入或常驻组件时，已在「怎么验证的」写明：每个用户动作和每次通知触发几次 list/扫描/IPC/写事务（不涉及）
