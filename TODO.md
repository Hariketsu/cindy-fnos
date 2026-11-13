# TODO

> 本文回答：还有什么没完成？什么最重要？哪些决定暂缓？
> 完成一项就更新状态；阶段划分与验收标准见 [docs/plan.md](docs/plan.md)。

## 当前阶段：P0 · 环境与平台探针

- [x] 在 UTM 中安装 ARM 飞牛 VM（镜像 1.2.0701），已加数据盘并创建存储空间
- [x] 搭建过程整理成 `scripts/dev-vm/` 与 docs/development.md（`create-vm.sh` 尚未从零验证）
- [x] 安装并授权官方 fnos-cli（随仓库提供，profile `dev-vm`）
- [x] 用 fnos-cli 做只读环境探测；关机克隆干净基线 `fnOS-baseline`（2026-11-13，未开机使用过）
- [ ] 查明重启后 SSH 公钥登录失效的原因（优先级低，主要改用 fnos-cli）
- [ ] 平台探针 fpk：网关前缀、请求头、iframe sandbox/同源、SSE 缓冲、`micro_app`/JS SDK、`fileTypes` 行为
- [ ] 探针结论写入 `docs/fnos-platform-notes.md`
- [ ] 在 OrbStack 中构建 linux-arm64 Host（只带 Pi），在 VM 中启动并检查 `/health`

## 下一阶段

- P1 MVP 应用包：Adapter、fpk、登录、真实任务、重启恢复、升级、卸载
- P2 飞牛原生整合：fnos-bridge、右键交给 Cindy、卸载向导、可读错误
- P3 x86 真机验收、CI 发布

## 上游事项

| 事项 | 状态 |
|---|---|
| 子路径部署（base path） | 未提 |
| 从文件注入凭据密钥 | 未提 |
| 构建时可选 harness | 未提 |
| Web 首次登录 API | 未提 |
| Host 手机号登录 | 待实测 |
| Host 本地模式（无账号） | 未提 |

提交 issue/PR 的节奏还没定（逐项提交，还是 P0 结束后汇总成一份「服务器 / NAS 部署需求」）。

## 暂缓的决定

| 决定 | 暂缓原因 |
|---|---|
| 多用户（每个飞牛用户一个 Host） | 资源与复杂度翻倍；v1 只给管理员用 |
| 开机解锁口令（替代应用自管密钥） | v1 优先保证无人值守恢复 |
| 支持无账号的本地模式 | 依赖上游 Host 支持 |
| 上架飞牛官方应用中心 | 等版本稳定 |
| 仓库名称、公开时间 | 未讨论 |
