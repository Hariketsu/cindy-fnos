# TODO

> 本文回答：还有什么没完成？什么最重要？哪些决定暂缓？
> 完成一项就更新状态；阶段划分与验收标准见 [docs/plan.md](docs/plan.md)。

## 已完成：P0 · 环境与平台探针

- [x] 在 UTM 中安装 ARM 飞牛 VM（镜像 1.2.0701），已加数据盘并创建存储空间
- [x] 搭建过程整理成 `scripts/dev-vm/` 与 docs/development.md（`create-vm.sh` 尚未从零验证）
- [x] 安装并授权官方 fnos-cli（随仓库提供，profile `dev-vm`）
- [x] 用 fnos-cli 做只读环境探测；关机克隆干净基线 `fnOS-baseline`（2026-11-13，未开机使用过）
- [ ] 查明重启后 SSH 公钥登录失效的原因（优先级低，主要改用 fnos-cli）
- [x] 平台探针 fpk（`tools/fnos-probe/`）：网关前缀、请求头、iframe sandbox/同源、SSE、JS SDK、打开方式入口
- [x] 探针结论写入 `docs/fnos-platform-notes.md`
- [ ] 查明后端 `trim.system.getPlatformConfig` 返回 403 的原因（不阻塞：前端接口可用）
- [x] 在 OrbStack 中构建 linux-arm64 Host（只带 Pi），在 VM 中启动并检查 `/health`（`scripts/build-host.sh` 已端到端验证；Runtime 卡在密钥环，符合预期）

## P0 遗留，进入 P1 前要定

- [x] **Host 的打包形态**：决定 fpk 中直接放文件树，配合依赖去重和裁剪（约 3.4 万个文件、1GB）；开发装在 btrfs 存储空间上
- [x] 产物瘦身：`scripts/prune-host.mjs` 裁剪 + `patches/0002` 依赖去重，文件数从 29.8 万降到约 3.4 万，ext4 估算约 3GB
- [x] 用新补丁重新跑 `build-host.sh`，确认 0001 + 0002 + 裁剪的完整构建可用（34,370 个文件，ext4 估算 2.94GB；模块加载与 `/health` 正常）
- [x] 补丁：从文件注入凭据密钥（`patches/0003`，`CINDY_HOST_CREDENTIAL_KEY_FILE`；VM 中 Runtime 从「Unlock the system keyring」变为 `uninitialized`）
- [x] 写 `docs/upstream/credential-key-file/issue.md` 草稿，待用户审阅
- [x] 区域：默认 `CINDY_HOST_REGION=cn`（用户决定；P1 验收时实测登录）

## 当前阶段：P1 · MVP 应用包

- [ ] Adapter（`adapter/`）：网关 Unix Socket → Host；管理员校验、前缀剥离、Host/Origin 改写、bearer 注入、接口白名单、iframe 策略、错误页 ← 子代理 A
- [ ] Web 子路径：shim 补丁（`patches/0004`）+ Renderer `--base` 构建 + 根路径排查 ← 子代理 B
- [ ] fpk 打包：manifest、包用户、`cmd/main`（启动 Host + Adapter、生成密钥文件、`CINDY_HOST_REGION=cn`）、iframe 与新标签页入口
- [ ] 网页首次登录（包装 `cindy-host login`）
- [ ] P1 验收（需要用户：Cindy 账号、DeepSeek 临时 Key）

## 下一阶段

- P2 飞牛原生整合：fnos-bridge、右键交给 Cindy、卸载向导、可读错误
- P3 x86 真机验收、CI 发布

## 上游事项

| 事项 | 状态 |
|---|---|
| 构建时可选 harness | 本地补丁 `patches/0001`；issue [#10404](https://github.com/makecindy/cindy/issues/10404)，PR [#10418](https://github.com/makecindy/cindy/pull/10418) 待审 |
| 依赖复制去重 | 本地补丁 `patches/0002`；issue [#10406](https://github.com/makecindy/cindy/issues/10406)，PR [#10419](https://github.com/makecindy/cindy/pull/10419) 待审 |
| 子路径部署（base path） | 未提 |
| 从文件注入凭据密钥 | 本地补丁 `patches/0003`；issue [#10417](https://github.com/makecindy/cindy/issues/10417) 待分诊 |
| Web 首次登录 API | 未提 |
| Host 手机号登录 | 待实测 |
| Host 本地模式（无账号） | 未提 |

流程：先写 issue，再提关联 issue 的 PR；草稿放在 `docs/upstream/`，经用户审阅后提交。PR 分支在本地 `.upstream/cindy`，从用户的 fork `Hariketsu/cindy` 提交。

## 暂缓的决定

| 决定 | 暂缓原因 |
|---|---|
| 多用户（每个飞牛用户一个 Host） | 资源与复杂度翻倍；v1 只给管理员用 |
| 开机解锁口令（替代应用自管密钥） | v1 优先保证无人值守恢复 |
| 支持无账号的本地模式 | 依赖上游 Host 支持 |
| 上架飞牛官方应用中心 | 等版本稳定 |
| 仓库名称、公开时间 | 未讨论 |
