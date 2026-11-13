# 本机环境与个人约定（模板）

> 复制为 `AGENTS.local.md`（已被 git 忽略）后填写。AGENTS.md 会引用它。
> 只写与你的机器和你个人有关的信息；密码等机密放在 `.env.local`。

## 维护者

- GitHub 账号、交流语言：
- 对外操作（推送、issue、PR、评论）的确认方式：
- 真实飞牛 NAS 的架构（x86 / ARM）以及何时可以在上面测试：
- 默认区域（`CINDY_HOST_REGION`）：

## 本机

- 系统、芯片、内存、可用磁盘：
- 已安装的工具（UTM、OrbStack、浏览器自动化工具等）：

## 开发 VM 与构建机

| 名称 | 说明 |
|---|---|
| 开发 VM | 飞牛版本、存储空间（建议 btrfs）、volume-id；连接信息写在 `.env.local` |
| 干净基线 | |
| fnos-cli profile | |
| 构建机 | 见 `scripts/build-host.sh` |

## 上游协作

- 上游 PR 工作区（`.upstream/cindy`）的 remote 与分支：
