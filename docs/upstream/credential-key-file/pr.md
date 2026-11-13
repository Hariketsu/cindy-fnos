# PR 草稿：无 Secret Service 的 Linux 环境下，Host 可从文件读取凭据密钥

> 状态：**草稿，待用户审阅**，未提交。验证数据均为实测（2026-11-13，linux-arm64，Debian 12）。
> 关联 issue：makecindy/cindy#10417（分诊机器人已表示方向接受，并给出实现与验收要求，本 PR 均已按要求处理）
> 分支：本地 `.upstream/cindy` 中的 `feat/host-credential-key-file`，基于上游 `main`（`65fb14e`），1 个 commit，带 DCO 签名
> 模板：上游 `.github/PULL_REQUEST_TEMPLATE.md`

---

**标题**：`feat(host): 无 Secret Service 的 Linux 环境下，允许从文件读取凭据密钥`

## 这次改了什么

### 摘要

在没有桌面会话的 Linux 上（服务器、容器、NAS 应用、系统服务），没有 Secret Service，`createCredentialStore` 会抛出 `CREDENTIAL_STORE_UNAVAILABLE`，Host 的 Runtime 停在「Unlock the system keyring before connecting Cindy Host.」，无法登录和使用。

本 PR 允许从一个只有属主可读写的文件中读取原本存放在密钥环中的密钥字符串：参数 `options.credentialKeyFile`，不传时读取环境变量 `CINDY_HOST_CREDENTIAL_KEY_FILE`。密钥推导沿用 `deriveLinuxOsCryptKey`，所以磁盘上的记录仍是 `v11` 格式，与密钥环推导出的密钥双向兼容。

### 变更类型

- [x] `feat` 新功能

### 范围

- 关联 Issue / 需求：Closes #10417
- 本 PR 包含（代码全部在 `apps/host/src/credentials/` 中）：
  - `store.mjs`：新增 `readCredentialKeyFile()`，要求目标是普通文件（`stat.isFile()`），且 `(mode & 0o077) === 0`；读取后去掉首尾空白，结果为空则拒绝。任何问题都抛出 `SafeStorageUnavailableError`（`CREDENTIAL_STORE_UNAVAILABLE`），并带上具体原因和文件路径。这条路径在密钥环的 `.catch` 之外，所以不会被改写成「Unlock the system keyring」；
  - `createCredentialStore` 支持 `options.credentialKeyFile`，默认读取 `CINDY_HOST_CREDENTIAL_KEY_FILE`；注入的 `keyPromise` 仍然优先；
  - `store.test.mjs`：补充用例；
  - 文档：`docs/dev-rules/credentials-and-local-storage.md` 的「Linux 凭证后端」补充这个选项、它的失败语义和安全级别；`docs/host/architecture-and-status.md` 的凭据存储结论同步补充一句。`docs/host/headless-runtime-plan.md` 中带日期的实施记录保持原样。
- 明确不包含：macOS 与 Windows 的凭据路径（不变）；密钥文件的生成与分发（由部署方负责）；`main.ts` 等调用方（不需要改动）。
- 与现有计划的关系：`docs/host/headless-runtime-plan.md` 记录「无人值守重启的密钥托管方式等待用户决定」。本 PR 不替项目决定默认的托管方式，只提供一个由部署方**显式开启**的机制；默认行为仍要求 Secret Service。
- 用户可见变化：未设置密钥文件时无任何变化；设置后，无密钥环的 Linux 环境中 Host 可以正常登录和使用。
- 是否存在 breaking change：无。

### UI 变化

不涉及。

- 引用的设计规范：不涉及。

## 怎么验证的

### 自动验证

```text
cd apps/host && node --import tsx --import ./src/loaders/register-raw.mjs --test src/credentials/*.test.mjs
结果：10 pass，0 fail
（保留新测试、撤回 store.mjs 的改动：8 pass，2 fail，两个新用例失败）
pnpm --filter @cindy/host test
结果：284 pass，0 fail
```

测试价值（`store.test.mjs`，补充到现有文件）
- 生产入口与可观察结果：`createCredentialStore()`（经 `createPreparedLinuxCredentialStore()`），即 Host 所有 Linux 凭据存储的唯一入口；可观察结果是已有 `v11` 记录能否被读出，以及失败时的错误类型、错误码和原因。
- 规则依据：#10417 的验收条件；`linux-keyring.mjs` 与本文件已有的约定「不可用时显式失败，不降级为明文」。
- 现有覆盖为什么不够：现有用例只注入 `keyPromise`，没有覆盖文件来源，也没有覆盖它的权限、类型和内容校验。
- 最小失败输入与 tier：
  - 文件内容为前后带空白的 `TEST_SECRET`：密钥环推导写入的记录必须能用文件读出，反之亦然；
  - 权限 0644、文件不存在、内容只有空白、路径是目录：都必须抛出 `SafeStorageUnavailableError`，带上对应原因，且不得出现「Unlock the system keyring」；
  - 已有的「Secret Service 不可用」用例补充断言：未配置密钥文件时，错误信息仍为「Unlock the system keyring」。

  unit tier，使用 `mkdtemp` 临时文件，无子进程；凭据测试文件约 0.3 秒。

### 手工验证

在 ARM 版飞牛 NAS（fnOS 1.2.1010，Debian 12，无 Secret Service）上运行 Host 发行包，内含本 PR 等价的改动，读取认证后的 `/health`：

| 情况 | Runtime |
|---|---|
| 未设置密钥文件 | `error`：「Unlock the system keyring before connecting Cindy Host.」，与现在相同 |
| 密钥文件权限 0600 | `uninitialized`：「no account database in this profile」，可以继续登录 |
| 密钥文件权限 0644 | `error`：报告权限过宽并提示 `chmod 600` |
| 文件不存在 | `error`：报告具体的 ENOENT |

### 未执行的验证

- 用真实桌面密钥环导出的密钥解密已有记录：单元测试用合成密钥验证了双向兼容，没有用真实的桌面 profile 测试。
- 在无密钥环环境中用真实账号完成登录和凭据写入：需要真实的 Cindy 账号，将在后续的端到端验收中进行。

## 风险

### 风险分类

- [x] 权限 / 安全 / 用户数据

### 影响与回滚

- 影响范围：只在设置了 `credentialKeyFile` 或 `CINDY_HOST_CREDENTIAL_KEY_FILE` 时生效；未设置时代码路径与现在相同。
- 安全取舍：文件中的密钥只受文件权限保护，拿到 root 或物理磁盘的人可以解密凭据。这与 systemd `LoadCredential=`、Docker Secrets 等服务器机密文件的安全级别相同，强于明文，弱于需要用户解锁的密钥环，所以只作为显式开启的选项。权限过宽、类型不对或内容为空时直接失败，不会退回明文或密钥环。
- 回滚 / 降级方式：回退本 commit 即可；已写入的记录仍是 `v11` 格式，可以用同一密钥通过密钥环继续读取。

### 提交前检查

- [x] 已 review 完整 diff
- [x] 每个 commit 都带 DCO 签名
- [x] UI 改动已在「UI 变化」注明引用的设计规范章节（不涉及）
- [x] 未提交凭证、令牌或授权文件
- [x] 已核对受影响的文档：已同步修订 `credentials-and-local-storage.md` 与 `architecture-and-status.md`；`headless-runtime-plan.md` 是带日期的实施记录，未改写
- [x] 已确认测试结果或说明未执行原因
- [x] 不涉及数据读取、通知刷新或常驻组件
