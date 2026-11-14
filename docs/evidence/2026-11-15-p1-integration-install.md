# P1 证据：fpk 集成构建并装进开发 VM（2026-11-15）

环境：开发 VM（UTM，ARM fnOS 1.2.1010），存储空间 `/vol2`（btrfs，volume-id 2）；上游 `b975dc3` + `patches/0002`～`0005`；`CINDY_WEB_BASE=/app/cindy/`；只打包 Pi + ripgrep。

## 构建

| 项 | 结果 |
|---|---|
| `scripts/build-host.sh arm64` | 成功；产物 `cindy-host-linux-arm64.tar.gz` 432MB，14,980 个文件 |
| 构建机上对产物跑 `lifecycle.e2e.mjs` | exit 0，2 项 PASS |
| `scripts/build-fpk.sh arm64` | 成功；`cindy-0.1.0-arm64.fpk` 404MB |

## 安装与运行（fnos-cli 0.6.2，profile `dev-vm`）

| 项 | 结果 |
|---|---|
| `app install-fpk … --volume-id 2 --dry-run --yes` | 通过 |
| `app install-fpk … --volume-id 2 --cancel-on-failure --yes` | 安装成功，状态 `starting` → `running`，约 20 秒 |
| 进程 | Host 与 Adapter 都以包用户 `cindy` 运行（非 root）；Host 常驻内存约 600MB |
| Host 监听 | `127.0.0.1` 随机端口（本次 40611） |
| Adapter | 监听 `/vol2/@appcenter/cindy/app.sock`，前缀 `/app/cindy` |
| 凭据密钥文件 | 首次启动生成于 `TRIM_PKGETC/credential.key` |

## 真实入口（ego-browser，飞牛 Web 桌面）

| 项 | 结果 |
|---|---|
| 桌面图标 | 两个：「Cindy」（窗口内 iframe）与「Cindy（新标签页）」 |
| 窗口内打开 | 原版 Cindy 界面，显示「环境初始化失败」（未登录 Cindy 账号，符合预期） |
| 新标签页打开 | 同上 |
| 请求是否留在前缀内 | 两种入口各 95 个请求，0 个越出 `/app/cindy/`，0 个外部来源 |
| `/app/cindy/health` | 200；`region=cn`；`harness` 只有 `pi`；`runtime.state=uninitialized`，`detail="no account database in this profile"`（已越过密钥环） |
| 已登录飞牛、请求被禁路由 `POST /app/cindy/control/stop` | 404（Adapter 白名单拦截） |
| 未登录飞牛、直接请求 `/app/cindy/`、`/health`、`/api/x` | 网关返回 `invalid token`（HTTP 200，非 Cindy 内容）；Adapter 日志中没有这些请求 |

## 发现

- 未登录 Cindy 时，每个打开的页面约每秒请求一次 `GET /events`，Host 返回 409 `owner_runtime_unavailable`，持续不断；Adapter 每次都记一行日志（20 秒内 20 行）。这是上游 Web shim 的重连行为，登录后 `/events` 为长连接，应不再出现。已记入 TODO，登录流程完成后复查。

## 未验证

- 登录 Cindy 账号及之后的一切（任务、流式、停止、权限确认）：需要网页首次登录（P1 下一步）和用户的 Cindy 账号。
- 重启 VM 后自动恢复、升级、卸载。
- 网关在 GET 和 SSE 请求上是否带 `Origin`（TODO 中的加固项）。
- x86 真机。
