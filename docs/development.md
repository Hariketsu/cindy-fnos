# 开发与验证

> 本文回答：在哪里开发、在哪里构建、在哪里验证、哪些步骤需要人工参与。

## 环境分层

```
L0  Mac 本机（秒级）     Adapter 单元测试 + 模拟网关（伪造 X-Trim-* 请求头与 /app/cindy 前缀）
        ↓
构建  OrbStack Linux 容器   Host 产物：linux-arm64（原生）/ linux-amd64（Rosetta）→ fnpack → .fpk
        ↓
L1  Mac 上的飞牛 ARM VM（分钟级，主力环境）
    scp .fpk → appcenter-cli install-fpk → 浏览器自动化走完用户旅程
    阶段验收前先恢复到「干净基线」
        ↓
L2  用户的 x86 飞牛 NAS    里程碑验收；何时安装、怎样安装由用户决定
```

为什么 Host 必须在 Linux 中构建：上游的 `build.mjs` 会把**当前运行的 node 二进制**、平台相关的原生模块和 harness 按 `linux-<arch>` 拷进产物，在 macOS 上构建只能得到 darwin 版本。

为什么在飞牛中验证而不是普通 Linux：网关、iframe、JS SDK、包用户权限、生命周期脚本这些行为只有飞牛上才有。

## 飞牛开发 VM

| 项 | 值 |
|---|---|
| 虚拟化 | UTM（Apple Virtualization / QEMU 硬件加速，ARM64 guest） |
| 镜像 | `fnos_Mainland-PE_arm_1.2.0701_armsr_2881.iso`（系统版本 1.2.0701，满足开放 API 要求的 ≥ 1.2.0401） |
| 资源 | 4 核 / 8 GB 内存 / 64 GB 动态磁盘（实际占用按写入量增长） |
| 基线 | 初始化完成并开启 SSH 后，关机克隆一份 `fnOS-baseline` |

VM 的 IP、账号等本机信息不写入仓库，保存在被忽略的 `.env.local` 中。

## 需要人工参与的步骤

| 步骤 | 原因 |
|---|---|
| 飞牛安装界面与首次初始化（设备名、管理员账号、存储空间） | 图形界面；涉及用户自己的账号 |
| 注册并登录 Cindy 账号（手机号） | 身份验证需要本人操作 |
| 提供 DeepSeek 临时 API Key | 用户的凭据 |
| 在真实 NAS 上安装 | 设备上有真实数据 |
| 阶段验收抽查 | 用户最终确认体验 |

其他步骤（构建、安装 fpk、浏览器自动化验证、截图与日志）由 Agent 完成，并在交付时附上证据。

## 验收证据

每个阶段的验收结果记录在 `docs/evidence/<阶段>.md`：执行了什么、在哪个环境、结果如何（附截图或日志摘录），以及哪些项没有验证。没有证据的项不算通过。
