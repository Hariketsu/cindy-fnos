# PR 草稿：Host 发行包补上 semver 与 picomatch

> 状态：**已提交**（经用户审阅）：https://github.com/makecindy/cindy/pull/10589
> 关联 issue：makecindy/cindy#10587
> 分支：本地 `.upstream/cindy` 中的 `fix/host-release-runtime-requires`，基于上游 `main`（`b975dc3`），1 个 commit（`dd865d3`），带 DCO 签名。
> 模板：上游 `.github/PULL_REQUEST_TEMPLATE.md`
> 验证数据均为实测（2026-11-15，linux-arm64，Debian 12，Node 22.22.3，pnpm 11.28.9）。

---

**标题**：`fix(host): 独立 Host 发行包补上 semver 与 picomatch`

## 这次改了什么

### 摘要

4ee0876 之后，Host 与桌面共用 `piPackageStoreCore.ts` 和 `pi-package-compatibility.ts`，这两个模块通过 `createRequire(import.meta.url)` 在运行时加载 `picomatch` 和 `semver`。Host 的构建只复制 esbuild 能看到的 import，运行时加载的包看不到，所以两者都没有进入发行包：Host 启动即退出（`Cannot find module 'semver'`），`picomatch` 则会在用到 Pi 扩展的文件匹配时报错。

`build.mjs` 中已有一处专门列出「通过 `createRequire` 加载」的运行时包（`node-machine-id`、`node-pty`、`sharp`）。本 PR 把这两个包按同样的方式加入，从声明它们的 Desktop 依赖中解析。这正是 `docs/dev-rules/architecture-invariants.md` §5「给共用主体新增依赖或端口，两个启动器都要接」所说的 Host 一侧接线。

### 变更类型

- [x] `fix` 缺陷修复

### 范围

- 关联 Issue / 需求：Closes #10587
- 本 PR 包含：`apps/host/scripts/build.mjs` 新增两行 `packages.set(...)` 及注释。
- 明确不包含：
  - 改动 Desktop 中 `createRequire('semver')` / `createRequire('picomatch')` 的写法（Desktop 有三处这样加载 `semver`，属于既有约定）；
  - 构建时自动检查 bundle 中运行时 `createRequire` 的包是否都已复制（可以作为后续改进单独讨论）。
- 用户可见变化：用 `main` 构建的独立 Host 发行包可以正常启动。
- 是否存在 breaking change：无。

### UI 变化

不涉及。

- 引用的设计规范：不涉及。

## 怎么验证的

### 自动验证

```text
pnpm --filter @cindy/host test
结果：446 pass，0 fail
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @cindy/host typecheck
结果：exit 0（与 ci.yml 使用相同的堆上限；默认堆上限下 tsc 在本机内存不足退出，与本改动无关）
```

本 PR 没有新增测试。改动在构建脚本中，`build.mjs` 没有单元测试；能观察到这个缺陷的真实入口是构建出的发行包，已有的 `apps/host/scripts/lifecycle.e2e.mjs` 正好覆盖（见手工验证）。

### 手工验证

在 linux-arm64（Debian 12）上，用 `main`（`b975dc3`）和本 PR 分别完整构建 Host 发行包（`pnpm --filter @cindy/host build --output <dir>`，打包全部 harness）：

| | `main` | 本 PR |
|---|---|---|
| `CINDY_TEST_HOST_RELEASE=<dir> node apps/host/scripts/lifecycle.e2e.mjs` | 失败：`Host exited before listening`，`Cannot find module 'semver'` | exit 0，2 项 PASS |
| 根目录 `node_modules/semver` | 不存在 | 7.8.5 |
| 根目录 `node_modules/picomatch` | 不存在 | 4.0.5 |

本 PR 的产物中，另外检查了：

- 以 `bin/host.mjs` 为基准用 `createRequire` 加载（与 bundle 中的写法一致）：`semver.satisfies('1.2.3', '^1.0.0')` 为 `true`，`picomatch('*.js')('a.js')` 为 `true`；
- `runtime-dependencies.json` 包含 `node_modules/semver`（7.8.5）和 `node_modules/picomatch`（4.0.5），4193 条记录对应的目录全部存在；
- `SHA256SUMS.json`：297,946 个文件逐个校验全部一致；
- 逐个检查 `bin/host.mjs` 中所有 `createRequire(import.meta.url)("…")` 加载的包（`node-machine-id`、`semver`、`picomatch`），都已在发行包根目录。

### 未执行的验证

- macOS 与 Windows 平台的发行包构建：改动与平台无关，但没有在这两个平台上实际构建。
- 在 Host 中实际安装 Pi 扩展、走到 `picomatch` 的文件匹配路径：只验证了包能从 `bin/host.mjs` 的位置加载并正常调用。

## 风险

### 风险分类

- [x] 无已知风险

### 影响与回滚

- 影响范围：只影响 `pnpm --filter @cindy/host build` 的产物，多复制两个纯 JS 包；Desktop 的代码与打包不变。
- 回滚 / 降级方式：回退本 commit 即可，不涉及数据和协议。

### 提交前检查

- [x] 已 review 完整 diff
- [x] 每个 commit 都带 DCO 签名（`git commit -s`，见 [DCO](../DCO)）
- [x] UI 改动已在「UI 变化」注明引用的设计规范章节（不涉及 UI 则跳过）
- [x] 未提交凭证、令牌或授权文件
- [x] 已核对受影响的文档，行为变化涉及的旧结论已同步修订（不涉及则无需修改文档）
- [x] 已确认测试结果或说明未执行原因
- [x] 涉及数据读取、通知后刷新、界面频繁写入或常驻组件时，已在「怎么验证的」写明：每个用户动作
  和每次通知触发几次 list/扫描/IPC/写事务（读远程数据再写远程调用次数和回包字节），以及隐藏或
  卸载后是否停止（见 `docs/dev-rules/engineering-conventions.md` §8；远程读取同时见
  `docs/dev-rules/server-channel-review.md`）（不涉及）
