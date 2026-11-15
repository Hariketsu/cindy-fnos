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
3. [ ] **P1 验收**（需要用户提供 DeepSeek 临时 Key）：VM 现为中国大陆版、未登录，先重装成国际版并用 Apple 登录 → 配 DeepSeek → 飞牛窗口内真实任务（流式、停止、权限确认）→ 重启 VM 后保持登录 → 升级 → 卸载；另在 ext4 估算占用

Adapter 集成时要验证 / 加固（子代理 A 提出）：

- [ ] 真实网关在 GET 和 SSE 请求上是否带 Origin
- [ ] Host 意外退出后端口被他人占用时，bearer 可能发错对象：发送 `X-Cindy-Host-Instance`，409 时重读 endpoint
- [ ] 同一 NAS 其他端口的页面被视为同源（Origin 只比较主机名）

其他未决：

- [ ] Host 登录遇到「需绑定手机号／选择账号」时失败（`no refresh token`）：登录页已提示用户先在 Cindy 桌面版用同一方式登录并完成设置；上游 [#10599](https://github.com/makecindy/cindy/issues/10599)
- [ ] 升级路径：`fnos-cli app install-fpk` 对已安装应用报 10236「应用已存在」；应用中心「手动安装」升级需要人工在界面上试一次（见平台笔记）
- [ ] 非管理员账号能否读取应用目录里的 600 文件（管理员可以，见平台笔记 `trimacl`）

- [ ] 未登录 Cindy 时，每个打开的页面每秒请求一次 `/events`（409 `owner_runtime_unavailable`），Adapter 每次记一行日志。网页登录已实现，未登录时首页会转到 Adapter 登录页，待复查是否仍有页面在刷 `/events`；必要时在 Adapter 合并重复日志

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
| 依赖复制去重 | `0002` | [#10406](https://github.com/makecindy/cindy/issues/10406) | [#10419](https://github.com/makecindy/cindy/pull/10419) | #10418 合入后冲突，已变基到 `b975dc3` 并重新验证、回复（2026-11-15），等待复审 |
| 从文件读取凭据密钥 | `0003` | [#10417](https://github.com/makecindy/cindy/issues/10417) | [#10429](https://github.com/makecindy/cindy/pull/10429) | 触发维护者确认门（[#10437](https://github.com/makecindy/cindy/issues/10437)）；已按分析补 Windows 跳过（`813f482`）并回复，等待维护者 Approve。`813f482` 的 CI 中 Windows 分片 8/8 因无关用例（`maker-remote-ssh` 的 Git Bash 超时）偶发失败，请维护者重跑的回复草稿见 `docs/upstream/credential-key-file/ci-flake-reply.md` |
| Host 发行包缺 semver／picomatch | `0005` | [#10587](https://github.com/makecindy/cindy/issues/10587) | [#10589](https://github.com/makecindy/cindy/pull/10589) | 等待审查；分诊机器人在 #10587 建议采纳此修法。上游 main 的 Host 发行包启动即崩，`0005` 临时补上 |
| 网页端启动检查要求 Claude Code+Codex | `0006` | [#10597](https://github.com/makecindy/cindy/issues/10597) | [#10598](https://github.com/makecindy/cindy/pull/10598) | 已提交（2026-11-15）；只打包 Pi 时网页端卡在「环境初始化失败」 |
| Web 子路径部署 | `0004` | 草稿 `docs/upstream/web-base-path/issue.md` | — | issue 草稿待审阅；方向确认后再开 PR 分支 |
| Web 首次登录 API | — | [#10600](https://github.com/makecindy/cindy/issues/10600) | — | 已提交；过渡方案：Adapter 包装 CLI（国际版 Apple 已走通） |
| Host 登录结果非 ok 时失败 | — | [#10599](https://github.com/makecindy/cindy/issues/10599) | — | 已提交；中国大陆版微信登录因此失败 |
| Host 手机号／邮箱登录 | — | 并入 [#10600](https://github.com/makecindy/cindy/issues/10600) | — | cn 提供手机号、微信、Apple，global 提供邮箱、Apple、Google（`/api/auth/providers`）；`cindy-host login` 只支持社交登录，已在 #10600 中提出 |
| Host 本地模式（无账号） | — | [#10601](https://github.com/makecindy/cindy/issues/10601) | — | 已提交；网页端「跳过登录」无效 |

流程：先写 issue，再提关联 issue 的 PR；草稿放在 `docs/upstream/<主题>/`，经用户审阅后才提交。PR 分支在本地 `.upstream/cindy`，从用户的 fork `Hariketsu/cindy` 提交；本地补丁由 `.upstream/cindy` 的 `fnos-integration` 分支依次叠加 #10419、#10429、#10589、#10598 后导出（`0004` 只在本仓库维护），必须与 PR 代码一致。

## 暂缓的决定

| 决定 | 暂缓原因 |
|---|---|
| 多用户（每个飞牛用户一个 Host） | 资源与复杂度翻倍；v1 只给管理员用 |
| 开机解锁口令（替代应用自管密钥） | v1 优先保证无人值守恢复 |
| 支持无账号的本地模式 | 依赖上游 Host 支持（[#10601](https://github.com/makecindy/cindy/issues/10601)） |
| 上架飞牛官方应用中心 | 等版本稳定 |

## 已完成：P0 · 环境与平台探针

ARM 飞牛开发 VM（btrfs）与干净基线、官方 fnos-cli、OrbStack 构建机、平台探针（`tools/fnos-probe/`，结论见 [docs/fnos-platform-notes.md](docs/fnos-platform-notes.md)）、Host 在飞牛上启动、打包形态（文件树 + 去重 + 裁剪）。详见 git 历史与 [docs/plan.md](docs/plan.md)。
