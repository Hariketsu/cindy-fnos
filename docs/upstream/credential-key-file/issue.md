# Issue 草稿：无 Secret Service 的 Linux 环境下，Host 可从文件读取凭据密钥

> 状态：**草稿，待用户审阅**，未提交。
> 模板：上游 `.github/ISSUE_TEMPLATE/feature_request.yml`（功能建议）
> 上游基线：`makecindy/cindy@cc2dc0f`
> 本地补丁：`patches/0003-host-credential-key-file.patch`（实现与 VM 验证进行中，结果补齐后再请用户审阅）

---

**标题**：`feat(host): 无 Secret Service 的 Linux 环境下，允许从文件读取凭据密钥`

### 使用场景 / Use case

我正在把 Cindy 打包成飞牛 NAS（fnOS）的原生应用。

技术路线为：界面复用官方 Renderer，后台运行 `apps/host/scripts/build.mjs` 产出的独立 Host。

项目和开发进度公开在 [Hariketsu/cindy-fnos](https://github.com/Hariketsu/cindy-fnos)。相关 issue：#10404、#10406。

Host 作为常驻后台运行在没有桌面会话的 Linux 上：NAS 应用由系统以独立用户身份启动，没有登录会话，也没有 GNOME Keyring、KWallet 这类密钥环。同样的情况也出现在无图形界面的服务器、Docker 容器、Kubernetes，以及以系统服务方式开机自启的 Host 上。

### 当前问题 / Current limitation

Linux 上的 Host 通过 `secret-tool` 向 Secret Service 取得 OSCrypt 密钥（`apps/host/src/credentials/linux-keyring.mjs`），以便和 Electron safeStorage 的 `v11` 格式保持一致。没有 Secret Service 时，`createCredentialStore` 抛出 `CREDENTIAL_STORE_UNAVAILABLE`，Runtime 停在：

```json
"runtime": { "state": "error", "detail": "Unlock the system keyring before connecting Cindy Host." }
```

这时用户无法登录，Host 也无法使用。在飞牛 VM 上实测确认了这一点（[实测记录](https://github.com/Hariketsu/cindy-fnos/blob/main/docs/fnos-platform-notes.md#cindy-host-实测p0)）。`createCredentialStore` 已经支持注入 `keyPromise`，但没有任何配置能用上它。`docs/host/headless-runtime-plan.md` 也把无图形环境的凭据列为待解决的缺口。

### 期望方案 / Proposed solution

新增一个可选的环境变量 `CINDY_HOST_CREDENTIAL_KEY_FILE`，指向一个只有 Host 进程用户可读的文件：

- **不设置时，行为与现在完全一致**，仍然使用 Secret Service。
- 设置后，从文件读取的是原本存放在密钥环里的那个**密钥字符串**，之后沿用现有的 `deriveLinuxOsCryptKey` 推导与 `v11` 加密，**磁盘上的凭据格式完全不变**。所以把密钥环中的值导出到文件后，已有的凭据可以直接解密，不需要重新登录。
- 文件不存在、为空，或者对用户组、其他用户可读（`mode & 0o077`）时，抛出现有的 `CREDENTIAL_STORE_UNAVAILABLE` 并给出明确的错误信息；**不会退回明文存储，也不会悄悄改用密钥环**。
- 实现集中在 `createCredentialStore` 内部，`main.ts` 中各处调用都不用改。

「从文件读取机密」是各类服务器平台传递机密的通用方式，这个方案可以直接对接：

| 平台 | 机密以什么形式提供给进程 |
|---|---|
| systemd | `LoadCredential=`，文件位于 `$CREDENTIALS_DIRECTORY` |
| Docker / Swarm | `/run/secrets/<name>` |
| Kubernetes | Secret 挂载为文件 |
| NAS 应用 | 应用自己的配置目录（权限 0600） |

**安全取舍**：文件中的密钥只受文件权限保护，拿到 root 或物理磁盘的人可以解密凭据。这和 systemd、Docker 场景下机密文件的安全级别相同，强于没有加密，但弱于需要用户解锁的密钥环。所以它只作为显式开启的选项，默认行为不变。

如果方向可以接受，我可以提交 PR，包含对 `store.test.mjs` 的补充测试。

### 已考虑的替代方案 / Alternatives considered

- **在容器或 NAS 中运行一个无头的 Secret Service**（例如 `gnome-keyring-daemon` 配合 `dbus-run-session`）：需要额外安装依赖，开机时还要解锁，在 NAS 应用沙箱中很难做到可靠的无人值守。
- **直接从环境变量读取密钥**：容易出现在 `/proc/<pid>/environ`、进程列表和日志中，也容易被子进程继承（Host 会启动 Agent 子进程），比文件更容易泄露。
- **Chromium 的 `--password-store=basic` 方式（固定密钥）**：等同于明文，不符合 Host「不退回明文」的原则。
