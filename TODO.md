# TODO

> 本文回答：还有什么没完成？什么最重要？哪些决定暂缓？
> 完成一项就更新状态；阶段划分与验收标准见 [docs/plan.md](docs/plan.md)。

## 当前阶段：P0 · 环境与平台探针

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

- [ ] **Host 的打包形态**：存储空间的 64KB 簇使 Host 产物（约 29.8 万个文件）占用 24GB。候选方案：减少文件数量（把依赖打包成少量文件，或裁剪依赖）／改装到系统分区（`install_type=root`）／把运行时放进单个镜像文件。需要评估后与用户讨论
- [x] 产物瘦身：`scripts/prune-host.mjs` 裁剪 + `patches/0002` 依赖去重，文件数从 29.8 万降到约 3.4 万，ext4 估算约 3GB
- [ ] 用新补丁重新跑 `build-host.sh`，确认 0001 + 0002 + 裁剪的完整构建可用
- [ ] 补丁：从文件注入凭据密钥（Runtime 目前卡在「Unlock the system keyring」）
- [ ] 验证中国大陆账号需要的 `CINDY_HOST_REGION=cn`

## 下一阶段

- P1 MVP 应用包：Adapter、fpk、登录、真实任务、重启恢复、升级、卸载
- P2 飞牛原生整合：fnos-bridge、右键交给 Cindy、卸载向导、可读错误
- P3 x86 真机验收、CI 发布

## 上游事项

| 事项 | 状态 |
|---|---|
| 构建时可选 harness | 本地补丁 `patches/0001`；issue 已提交 [#10404](https://github.com/makecindy/cindy/issues/10404) |
| 依赖复制去重 | 本地补丁 `patches/0002`；issue 草稿待用户审阅 |
| 子路径部署（base path） | 未提 |
| 从文件注入凭据密钥 | 未提 |
| Web 首次登录 API | 未提 |
| Host 手机号登录 | 待实测 |
| Host 本地模式（无账号） | 未提 |

流程：先写 issue，再提关联 issue 的 PR；草稿放在 `docs/upstream/`，经用户审阅后提交。节奏还没定（逐项提交，还是 P0 结束后汇总）。

## 暂缓的决定

| 决定 | 暂缓原因 |
|---|---|
| 多用户（每个飞牛用户一个 Host） | 资源与复杂度翻倍；v1 只给管理员用 |
| 开机解锁口令（替代应用自管密钥） | v1 优先保证无人值守恢复 |
| 支持无账号的本地模式 | 依赖上游 Host 支持 |
| 上架飞牛官方应用中心 | 等版本稳定 |
| 仓库名称、公开时间 | 未讨论 |
