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

## 搭建飞牛开发 VM（Apple Silicon Mac）

### 准备

1. 安装 UTM：`brew install --cask utm`，然后**手动打开一次** UTM，通过 Gatekeeper 的「仍要打开」确认。
   否则脚本控制 UTM 时会卡住，最终报 `AppleEvent timed out`。
2. 从飞牛官网下载 **ARM 版**镜像（页面最下方「支持苹果 M 芯片 / 华为鲲鹏」那一项）。
3. 「系统设置 → 隐私与安全性 → 本地网络」：给运行开发工具的终端、浏览器以及自动化浏览器（如 Ego Lite）打开开关。
   有些应用要先访问一次 VM 才会出现在这个列表里。
   否则连 VM 会立刻报 `No route to host`，虽然路由和 ARP 看起来都正常。
4. 第一次让脚本控制 UTM 时，macOS 会询问「是否允许终端控制 UTM」，点允许。

### 创建与安装

```bash
scripts/dev-vm/create-vm.sh ~/Downloads/fnos_*_arm_*.iso   # 创建 fnOS-dev
utmctl start fnOS-dev
scripts/dev-vm/serial-log.sh                               # 另开一个终端看启动日志
```

| 设置 | 值 | 为什么 |
|---|---|---|
| 后端 | QEMU + hvf 硬件加速，aarch64 | 接近原生速度 |
| 显卡 | **VGA** | 安装镜像的 X 配置写死 `Driver "fbdev"`，内核里没有 virtio-gpu 驱动。选 `virtio-gpu-pci` 或 `ramfb` 都会出现 `no screens found`，画面停在一行 `PCI: OF: of_root node is NULL` 上 |
| 网卡 | e1000，共享网络 | 社区教程的做法；共享网络只有 Mac 能访问，比桥接安全 |
| 磁盘 | 系统盘 64 GB + 数据盘 64 GB（都是动态分配）；数据盘上建 **btrfs** 存储空间 | 安装程序会把整块系统盘都给系统分区，没有数据盘就建不了存储空间，飞牛应用也就装不了 |
| 串口 | TCP，只监听 `127.0.0.1:4555` | 不用看 VM 画面也能读启动日志和 IP |

在 VM 窗口中完成图形安装：
- 最后一步「网络设置」会显示「未识别到可用网卡」，**可以忽略**。这只是安装环境的精简内核缺网卡驱动，装好的系统能正常联网。
- 点「确定」重启之前，先运行 `scripts/dev-vm/detach-iso.sh` 卸载 ISO，否则重启后会再次进入安装程序。

启动后，串口日志会打印 `fnOS Web UI can be directly accessed at: http://192.168.64.x:5666`。

### 初始化（人工）

在浏览器打开上面的地址：设置设备名和管理员账号，在数据盘上创建 btrfs 存储空间（选「基本」），开启 SSH。
VM 的地址、账号和密码写入 `.env.local`（已被 git 忽略）：

```bash
FNOS_VM_NAME=fnOS-dev
FNOS_VM_HOST=192.168.64.x
FNOS_VM_USER=...
FNOS_VM_PASSWORD=...
```

### 存储空间

开发 VM 只保留一个 **btrfs** 存储空间（`/vol2`，volume-id 2）。日常开发都装在这里。

最初还有一个 ext4 存储空间（64KB 簇）。它让 Host 产物膨胀到 24GB，严重拖慢迭代，已于 2026-11-13 删除。ext4 上的占用改用估算：`文件数 × 64KB 向上取整`。按这个方法估算原始产物约 20GB，和实测的 24GB 基本吻合，差额是目录本身占用的簇。

SSH 到 VM：`scripts/dev-vm/vm-ssh.sh '<命令>'`，传文件：`scripts/dev-vm/vm-ssh.sh --scp <本地文件> <远端路径>`（读取 `.env.local` 中的密码）。

### 管理设备：官方 fnos-cli

在 Mac 上用飞牛官方的 [fnos-cli](https://github.com/fnnas-labs/fnos-cli-skill) 管理 VM（以后也用它管理真机）：安装 fpk、启停应用、查看日志与存储。
授权方式是 OAuth：CLI 给出链接，用户在浏览器登录飞牛并同意，再把一次性 code 交回 CLI。不需要 SSH 密码或 sudo。

skill 已经随仓库一起提供（`.agents/skills/fnos-cli/`），首次运行会下载固定版本的二进制并校验 SHA256：

```bash
F=.agents/skills/fnos-cli/scripts/fnos-cli
$F --profile dev-vm --host 192.168.64.x --port 5666 --scheme http --allow-insecure-http \
   login --authorize-only --agent-name '<你的 agent 名>'   # 在浏览器打开返回的链接并授权
$F --profile dev-vm --host 192.168.64.x --port 5666 --scheme http --allow-insecure-http login --code '<code>'
$F --profile dev-vm --allow-insecure-http storage pools  # 只读验证
```

不建议用 SSH 跑 `appcenter-cli`：它要 root 权限，普通管理员直接运行会报 `rpcbroker: permission denied`。
另外，飞牛账号默认没有家目录，要做 SSH 公钥登录得先用 sudo 建 `/home/<user>/.ssh`（重启后公钥登录失效的原因还没查明）。

### 构建 Cindy Host

```bash
scripts/build-host.sh arm64     # 开发 VM 用；真机用 amd64
```

脚本会在 OrbStack 中创建 Debian 12 机器 `cindy-build-<arch>`（可用 `CINDY_BUILD_MACHINE` 指定已有机器），安装上游锁定的 Node 和 pnpm，拉取 `upstream.lock` 中的 commit，打上 `patches/` 里的补丁，再依次构建 Renderer 和 Host（只打包 Pi 和 ripgrep），产物输出到 `build/host/cindy-host-linux-<arch>.tar.gz`。

- 用 Debian 12：飞牛基于 Debian 12（glibc 2.36），而产物里的原生模块是在构建机上编译的。
- 首次运行时 `pnpm install` 要下载全部 harness，大约 20 分钟。
- Host 构建需要 Playwright 的 Chromium，脚本用同版本的 `playwright-core` CLI 安装。
- 不要把产物解压到存储空间或用户文件区来测试：前者 64KB 的簇会让占用膨胀到 24GB，后者没有可执行权限（见 [fnos-platform-notes.md](fnos-platform-notes.md)）。

### 打包 fpk 并装进 VM

飞牛经网关把应用放在 `/app/cindy/` 下，打包用的 Host 必须带上这个前缀构建：

```bash
CINDY_WEB_BASE=/app/cindy/ scripts/build-host.sh arm64      # 已有构建机时加 CINDY_BUILD_MACHINE=<名字>
CINDY_FNOS_VERSION=<版本> scripts/build-fpk.sh arm64          # 输出 build/fpk/cindy-<版本>-arm64.fpk

F() { .agents/skills/fnos-cli/scripts/fnos-cli --profile dev-vm --allow-insecure-http "$@"; }
F app install-fpk build/fpk/cindy-<版本>-arm64.fpk --volume-id 2 \
  --custom-parameters '[{"key":"wizard_region","value":"global"}]' --dry-run --yes   # 先预检，再去掉 --dry-run
```

- `--custom-parameters` 代替安装向导里的版本选择（`cn` 或 `global`）。
- 已安装时 `install-fpk` 会报 10236「应用已存在」，要先 `F app uninstall cindy --yes`。卸载后数据目录仍会保留，干净重装还要用 sudo 删除 `@appdata`、`@appconf`、`@apphome`、`@appshare`、`@appmeta` 下的 `cindy`（见平台笔记），然后执行 `sudo fstrim -av`。

### 磁盘空间

开发环境很占空间，Mac 上至少要留 **40GB**：

| 占用 | 大小 |
|---|---|
| 飞牛开发 VM（`fnOS-dev`，动态磁盘） | 约 7GB 起，随写入增长 |
| 干净基线（`fnOS-baseline`） | 约 8GB |
| OrbStack 构建机（依赖与 harness 缓存） | 约 11GB |
| Host 产物压缩包 | 约 0.8GB／每个架构 |

- **VM 的磁盘文件只会增长，不会自动缩小。** 在 VM 里删除大量文件后，要执行 `sudo fstrim -av`，把空闲块还给 Mac（UTM 已启用 discard）。2026-11-13 曾因往存储空间解压 Host 产物，把 VM 撑到 35GB，fstrim 之后回到 6.9GB。
- `scripts/build-host.sh` 在可用空间少于 10GB 时会拒绝运行。

### 干净基线

初始化完成后关机，在 UTM 中克隆一份基线。当前基线是 `fnOS-baseline-btrfs`（2026-11-13，只有 btrfs 存储空间、没有第三方应用）。

UTM 的界面没有快照功能，所以「基线」就是用克隆得到的一台独立 VM。平时**不要开机**。需要在干净设备上验收时，右键基线选「运行时不保存更改」，关机后所有改动都会丢弃；也可以从基线再克隆一台临时 VM，用完删掉。APFS 上的克隆是写时复制，只有改动过的部分才占新空间。每次阶段验收前，从基线克隆出新的 VM 来测试。

### 本项目使用的 VM

| 项 | 值 |
|---|---|
| 镜像 | `fnos_Mainland-PE_arm_1.2.0701_armsr_2881.iso`（系统 1.2.0701，满足开放 API 要求的 ≥ 1.2.0401） |
| 系统 | Debian 12 内核，飞牛 v1.2.0701，aarch64 |
| 资源 | 4 核 / 8 GB / 系统盘 64 GB + 数据盘 64 GB |

> `create-vm.sh` 是根据实际搭建过程整理出来的，**还没有从零完整跑过一遍**。下一位使用者跑通后，请删除这条提示。

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
