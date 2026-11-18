# TODO

> 本文回答：还有什么没完成？什么最重要？哪些决定暂缓？
> 完成一项就更新状态；阶段划分与验收标准见 [docs/plan.md](docs/plan.md)，最近一次交接见本机的 `handoff/`（不入库）。

## 当前阶段：P1 · MVP 应用包

已完成：

- [x] Adapter（`adapter/`）：网关 Unix Socket → Host；管理员校验、前缀剥离、Origin 自检后丢弃、bearer 注入、白名单、iframe 头、503/403 页、从 `host-endpoint.json` 发现端口；网页登录页与品牌图片路由。25 个测试（`node --test adapter/test/`）
- [x] Web 子路径（`patches/0004` + `CINDY_WEB_BASE=/app/cindy/`）：无头 Chromium 中原版界面在前缀下加载，113 个请求无一越出前缀
- [x] 凭据密钥文件（`patches/0003`）：VM 中 Runtime 越过密钥环，变为 `uninitialized`
- [x] 产物瘦身：`patches/0002`（完整复制后去重）+ `scripts/prune-host.mjs`

进行中 / 下一步（按顺序）：

1. [x] **集成构建并装进 VM**（2026-11-15）：fpk 装进 volume 2，飞牛桌面两个入口都打开原版界面（未登录状态），请求全部留在前缀内，见 [证据](docs/evidence/2026-11-15-p1-integration-install.md)
2. [x] **网页首次登录**（2026-11-15）：安装向导选择版本（中国大陆版：微信；国际版：Google、Apple）；Adapter 的 `/_fnos/login`（原版风格）运行 `cmd/main host-login <方式>`（停 Host → `cindy-host login --no-open` → 重启 Host），`/connect` 也转到登录页。国际版 Apple 登录成功进入主界面，见 [证据](docs/evidence/2026-11-15-p1-integration-install.md)；中国大陆版微信登录受上游限制失败（见「上游事项」）
3. [ ] **P1 验收**：2026-11-17 用 `upstream.lock`=`fe0daea` + 补丁 `0003`～`0007` 的 fpk 0.1.4（测试包去掉了 Adapter 登录，改用原版登录页）在开发 VM 上验收：网页 Apple 登录与登出后再登录、GLM 5.3 Flash 流式回复、权限确认、停止、DeepSeek 自带 Key、强制断电重启后自启并保持登录与凭据，均通过（证据待写入 `docs/evidence/`）。应用中心「手动安装 → 从电脑上传」从 0.1.4 升级到 0.1.5 通过，数据、凭据密钥、登录和供应商都保留。待做：卸载；`fnos-cli power reboot` 后 VM 黑屏 6 分钟以上未起来、强制断电后正常，原因未查明（Cindy 停止流程有 31 秒上限，基本排除），卸载前再复现一次
4. [ ] **自带 API Key 的供应商（DeepSeek）**：网页端「添加供应商」能列出 DeepSeek 预设，但保存调用的 `maker.createCustomProvider` 在 Host 与 shim 中都未实现，暂时只能用 Cindy 账号内置的模型（含 Cindy AI 提供的 DeepSeek V4）。已提功能建议 [#10644](https://github.com/makecindy/cindy/issues/10644)，分诊已认可方向并欢迎提 PR；选定 C 路线：先在 issue 下问维护者写通道走契约通道还是通用 IPC 通道，已发评论（2026-11-15，[链接](https://github.com/makecindy/cindy/issues/10644#issuecomment-6896283058)），等维护者答复

Adapter 集成时要验证 / 加固（子代理 A 提出）：

- [ ] 真实网关在 GET 和 SSE 请求上是否带 Origin
- [ ] Host 意外退出后端口被他人占用时，bearer 可能发错对象：发送 `X-Cindy-Host-Instance`，409 时重读 endpoint
- [ ] 同一 NAS 其他端口的页面被视为同源（Origin 只比较主机名）

其他未决：

- [ ] Host 登录遇到「需绑定手机号／选择账号」时失败（`no refresh token`）：登录页已提示用户先在 Cindy 桌面版用同一方式登录并完成设置。上游 [#10704](https://github.com/makecindy/cindy/pull/10704) 已让 CLI 报错说明缺哪一步（待 `upstream.lock` 前移）；在网页上完成绑定要靠 [#10600](https://github.com/makecindy/cindy/issues/10600)
- [ ] Adapter 的登录页（包装 `cindy-host login` CLI）与 #11048 的原版网页登录取舍：#11048 合入后，正式包是否去掉 `CINDY_FNOS_MAIN`、直接用原版登录页
- [ ] 只打包 Pi 时，账号默认模型（如 `claude-sonnet-4-6`）不属于已打包的 Agent，新输入框显示「模型信息暂不可用」，需手动换模型；页面还会请求未打包 Agent 的 `/api/capabilities`（404）。属于 #10640 同类问题，待决定是否提上游 issue
- [ ] 非管理员账号能否读取应用目录里的 600 文件（管理员可以，见平台笔记 `trimacl`）


- [ ] 应用图标：目前是 fnpack 默认图标；Cindy logo 属品牌素材，是否使用待用户决定
- [ ] 后端开放 API `trim.system.getPlatformConfig` 返回 403（不阻塞，前端接口可用）
- [ ] 重启后 SSH 公钥登录失效（优先级低，主要用 fnos-cli）
- [ ] `scripts/dev-vm/create-vm.sh` 尚未从零验证

## 下一阶段

- P2 飞牛原生整合：fnos-bridge（目录选择器、主题/语言、打开产物、标题、路径语义化）、右键交给 Cindy、卸载向导、可读错误、严格 CSP
- P3 x86 真机验收（用户的 NAS）、CI 发布（x86 + ARM）

## 上游事项

| 事项 | 本地补丁 | Issue | PR | 状态 |
|---|---|---|---|---|
| 构建时可选 harness | 已删除 | [#10404](https://github.com/makecindy/cindy/issues/10404) | [#10418](https://github.com/makecindy/cindy/pull/10418) | **已合入**（2026-11-13，`a54e488`）；`upstream.lock` 已移到 `b975dc3`，补丁已删除 |
| 依赖复制去重 | 已删除 | [#10406](https://github.com/makecindy/cindy/issues/10406) | [#10419](https://github.com/makecindy/cindy/pull/10419) | **已合入**（2026-11-15，`88941ba`）；lock 已移到 `fe0daea`，补丁已删除 |
| 从文件读取凭据密钥 | `0003` | [#10417](https://github.com/makecindy/cindy/issues/10417) | [#10429](https://github.com/makecindy/cindy/pull/10429) | 触发维护者确认门（[#10437](https://github.com/makecindy/cindy/issues/10437)，标签 `awaiting-discussion`），等待维护者 Approve。`Windows unit tests` 是必需检查，之前失败在无关的不稳定用例（`maker-remote-ssh` 5s 超时）；2026-11-17 变基到 `fe0daea` 并强制推送重跑 CI，PR 下已说明。#10726（官方 Docker/NAS 部署）的分诊把它列为前置 |
| Host 发行包缺 semver／picomatch | 已删除 | [#10587](https://github.com/makecindy/cindy/issues/10587) | [#10589](https://github.com/makecindy/cindy/pull/10589) | **已合入**（2026-11-15，`e1f4b6a`） |
| 网页端启动检查要求 Claude Code+Codex | 已删除 | [#10597](https://github.com/makecindy/cindy/issues/10597) | [#10598](https://github.com/makecindy/cindy/pull/10598) | **已合入**（2026-11-15，`6b0baae`） |
| Web 子路径部署 | `0004` | [#10614](https://github.com/makecindy/cindy/issues/10614) | [#11047](https://github.com/makecindy/cindy/pull/11047) | 2026-11-17 已提交（变基到 `fe0daea`，单提交 `25d5629`）；fnOS VM 上在 `/app/cindy/` 下验收通过 |
| Web 首次登录（第一阶段） | `0005` | [#10600](https://github.com/makecindy/cindy/issues/10600) | [#11048](https://github.com/makecindy/cindy/pull/11048) | 2026-11-17 已提交（单提交 `e6920ae`）：社交／同区域 SSO、登出保留配对、登录后进程内装配运行时；VM 首轮发现网页 shim 写死账号代次 1 导致模型目录卡在 `owner-pending`，已修。验证码登录、绑定留第二阶段，issue 保持打开。合入后 Adapter 可不再包装 CLI 登录（见下方待决） |
| Host 登录结果非 ok 时失败 | — | [#10599](https://github.com/makecindy/cindy/issues/10599) | [#10704](https://github.com/makecindy/cindy/pull/10704) | **已合入**（2026-11-16，`a3028c0`）；只改 Host，没有本地补丁。`upstream.lock` 前移过 `a3028c0` 后，CLI 报错才会说明缺哪一步；微信未绑定手机号的账号仍需先在桌面版完成绑定 |
| Host 手机号／邮箱登录 | — | 并入 [#10600](https://github.com/makecindy/cindy/issues/10600) | — | cn 提供手机号、微信、Apple，global 提供邮箱、Apple、Google（`/api/auth/providers`）；`cindy-host login` 只支持社交登录，已在 #10600 中提出 |
| Host 本地模式（无账号） | `0006`（待删） | [#10601](https://github.com/makecindy/cindy/issues/10601) | [#11049](https://github.com/makecindy/cindy/pull/11049) | 隐藏「跳过登录」的 #11049 **已合入**（2026-11-17，`cf427d2`），`upstream.lock` 前移过它后删除 `0006`；Host 本地模式本身仍未做（issue 11-16 有人复现，标 `readyForFix`） |
| 只打包部分 agent 时模型目录失败 | 已删除 | [#10640](https://github.com/makecindy/cindy/issues/10640) | [#10642](https://github.com/makecindy/cindy/pull/10642) | **已合入**（2026-11-15，`ae78647`）；`upstream.lock` 已移到 `ae78647`。PR 的手工验证未补，合入前未要求 |
| 模型选择器崩溃（`modelGroups.get` 返回 null） | 已删除 | [#10641](https://github.com/makecindy/cindy/issues/10641) | [#10643](https://github.com/makecindy/cindy/pull/10643) | **已合入**（2026-11-15，`dcecfa5`） |
| 网页端添加自带 Key 的供应商 | `0007` | [#10644](https://github.com/makecindy/cindy/issues/10644) | [#11050](https://github.com/makecindy/cindy/pull/11050) | 2026-11-17 已提交（`120186e` refactor + `10d381c` feat，只做 create 与 models-fetch）；VM 上 DeepSeek 添加、拉取模型、流式回复、重启后保持均通过。update／delete／disconnect 留待后续 PR |

2026-11-19：#11047、#11048、#11050 已变基到 `f9f9d4df90`，greptile 的审查意见全部修复；#11048 另按 main 的 CLI 行为补了 Device Link 登记。fork CI 已通过（#11048 有一个不稳定的 Windows 分片在重跑）；回复草稿在各自的 `docs/upstream/<序号>/review-reply.md`，等用户审阅后推送。本地补丁仍是 `fe0daea` 上的旧代码，lock 是否前移到 `f9f9d4df90` 待定。

流程：先写 issue，再提关联 issue 的 PR；草稿放在 `docs/upstream/<序号>-<主题>/`（已合入或关闭的移到 `archive/`），经用户审阅后才提交。PR 分支在本地 `.upstream/cindy`，从用户的 fork `Hariketsu/cindy` 提交；本地补丁由 `.upstream/cindy` 的集成分支从 `upstream.lock` 的 commit 起按补丁编号依次合入 #10429（`0003`）、#11047（`0004`）、#11048（`0005`）、#11049（`0006`）、#11050（`0007`），逐段导出每个合并提交，必须与 PR 代码一致。几个 PR 都改了网页 shim，合并时的冲突解法写在集成分支的合并提交里；任何一个 PR 合入后，其余的变基并重新导出。

## 暂缓的决定

| 决定 | 暂缓原因 |
|---|---|
| 多用户（每个飞牛用户一个 Host） | 资源与复杂度翻倍；v1 只给管理员用 |
| 开机解锁口令（替代应用自管密钥） | v1 优先保证无人值守恢复 |
| 支持无账号的本地模式 | 依赖上游 Host 支持（[#10601](https://github.com/makecindy/cindy/issues/10601)） |
| 上架飞牛官方应用中心 | 等版本稳定 |

## 已完成：P0 · 环境与平台探针

ARM 飞牛开发 VM（btrfs）与干净基线、官方 fnos-cli、OrbStack 构建机、平台探针（`tools/fnos-probe/`，结论见 [docs/fnos-platform-notes.md](docs/fnos-platform-notes.md)）、Host 在飞牛上启动、打包形态（文件树 + 去重 + 裁剪）。详见 git 历史与 [docs/plan.md](docs/plan.md)。
