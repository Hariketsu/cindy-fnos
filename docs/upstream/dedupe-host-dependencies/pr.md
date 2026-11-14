# PR 草稿：Host 构建复制依赖时，复用 Node 已能解析到的副本

> 状态：**已提交**（经用户审阅）：https://github.com/makecindy/cindy/pull/10419
> 更新：根据 Greptile 审查（P1）改为「完整复制后再去重」，追加 commit `c7f5210`；下面的正文是更新后的版本，已于 2026-11-14 经用户审阅后替换 PR 描述。验证数据均为实测（2026-11-13，linux-arm64，Debian 12，基于 `f58aada`）。
> 再次更新（2026-11-15，经用户审阅，已替换 PR 描述）：#10418 合入后变基到 `main` `b975dc3`，「怎么验证的」中的数据换成变基后的实测（pnpm 11.28.9）；「第一个 commit」一行保留 `f58aada` 上的旧数据并注明。
> 关联 issue：makecindy/cindy#10406（分诊机器人已表示方向接受，并给出实现与验收要求，本 PR 均已按要求处理）
> 分支：本地 `.upstream/cindy` 中的 `perf/host-dedupe-dependency-copies`，基于上游 `main`（`b975dc3`），2 个 commit，带 DCO 签名
> 模板：上游 `.github/PULL_REQUEST_TEMPLATE.md`

---

**标题**：`perf(host): 独立 Host 构建复制依赖时，复用 Node 已能解析到的副本`

## 这次改了什么

### 摘要

`build.mjs` 的 `copyPackage` 会把每个依赖复制到当前包自己的 `node_modules` 下，所以同一个包会在依赖树的每个分支里各复制一份。在 linux-arm64 产物中，一条 AWS SDK 依赖链下 `tslib` 被复制了 554 份，`@aws-sdk/core` 被复制了 119 份，整个产物约 29.8 万个文件。

本 PR **不改变复制过程**，而是在全部依赖复制完成后，根据完整的布局删除多余的副本：沿 Node 的模块查找路径向上，如果最近的同名副本是同一来源，这一份就是多余的。删除后，原来找到它的 import 会继续向上找到那份相同的副本，所以每个 import 解析到的包都不变；中间隔着不同版本时，这一份会被保留。产物的目录结构仍然对应 lockfile 的依赖图，不做提升（hoist）。

### 变更类型

- [x] `refactor` / `perf` 重构或性能优化

### 范围

- 关联 Issue / 需求：Closes #10406
- 本 PR 包含：
  - 新增 `apps/host/src/release-dependency-copies.mjs`：根据完整布局找出多余的副本（`redundantCopies`）。按分诊建议，向上查找时跳过 `node_modules` 和 `@scope` 目录（构建脚本从不在它们下面创建 `node_modules`），边界判断使用 `dir === root || dir.startsWith(root + path.sep)`；
  - `build.mjs`：`copyPackage` 保持原样；全部复制完成后删除多余副本，并把它们从 `runtime-dependencies.json` 中移除；
  - 新增单元测试 `apps/host/src/release-dependency-copies.test.mjs`。
- 明确不包含：提升（hoist）依赖；删除类型声明、source map 等文件；Host 运行时的任何改动。
- 用户可见变化：Host 发行包的文件数和体积显著减少，运行行为不变。
- 是否存在 breaking change：无。

### UI 变化

不涉及。

- 引用的设计规范：不涉及。

## 怎么验证的

### 自动验证

```text
cd apps/host && node --test src/release-dependency-copies.test.mjs
结果：3 pass，0 fail
pnpm --filter @cindy/host test
结果：449 pass，0 fail
```

测试价值（`release-dependency-copies.test.mjs`）
- 生产入口与可观察结果：`redundantCopies()`，即 `build.mjs` 决定删除哪些副本的唯一判断；可观察结果是被删除的副本列表。
- 规则依据：Node 的模块解析规则（逐级向上查找 `node_modules`），以及 `copyPackage` 原有的约定「Nested versions stay nested」。
- 现有覆盖为什么不够：`copyPackage` 是构建脚本内部的函数，没有测试。
- 最小失败输入与 tier：Greptile 指出的复制顺序问题（A → [X@2, B]，B → [C, X@1]，C → X@2）必须保留 C 自己的 X@2，此前「边复制边判断」的实现在这个输入上会选错版本；多层同来源副本必须全部删除；release 根目录以外的副本必须被忽略。unit tier，无 I/O。

### 手工验证

在 linux-arm64（Debian 12）上分别用 `main`（`b975dc3`）和本 PR 当前版本完整构建 Host 发行包，都打包全部四个 harness（「第一个 commit」一行是变基前在 `f58aada` 上的数据，仅作对照）：

| | 文件数 |
|---|---|
| `main` | 297,990 |
| 第一个 commit | 115,360 |
| **当前版本** | **32,743** |

**逐条比较依赖解析**：对当前版本中保留的每个包、它声明的每个依赖（`dependencies`、`optionalDependencies`、`peerDependencies`），分别在 `main` 的产物和本 PR 的产物中按 Node 的查找规则解析，比较解析到的包（名称、版本、`package.json` 的哈希）：

```text
reference packages 4974, candidate packages 801, compared importers 801, removed copies 4173
dependency edges checked 1309 (unresolved in both: 61), differences 0
```

第一个 commit 的产物同样是 0 处差异，说明 Greptile 指出的情况在当前依赖图中没有实际发生，但它在理论上成立，所以仍然按完整布局重新实现。比较脚本见 [release-resolution-check.mjs](https://github.com/Hariketsu/cindy-fnos/blob/main/tools/release-resolution-check.mjs)。

当前版本的其他验证：

- 对 `@aws-sdk/client-bedrock-runtime`、`openai`、`@google/genai`、`@modelcontextprotocol/sdk`、`@anthropic-ai/claude-agent-sdk`、`better-sqlite3`、`sharp`、`node-pty`、`exceljs`、`drizzle-orm`、`remark-gfm`、`playwright-core` 逐个做动态导入：后 8 个成功；前 4 个在 `main` 的产物中同样无法导入（这些包在当前 `main` 上不再作为根目录运行时依赖复制），两边结果完全一致。
- `CINDY_TEST_HOST_RELEASE=<构建目录> node apps/host/scripts/lifecycle.e2e.mjs`：当前 `main` 的产物缺少 `semver`，启动即退出（`main` 与本 PR 相同，与本 PR 无关，见 #10587）；手动补上 `semver` 后，`main` 与本 PR 的产物都是 exit 0，两项 PASS。
- `SHA256SUMS.json`：逐个文件校验全部一致。
- `runtime-dependencies.json`：741 条记录对应的目录全部存在。

### 未执行的验证

- macOS 与 Windows 平台的发行包构建：判断逻辑使用 `path` 处理路径，与平台无关，但没有在这两个平台上实际构建。
- 用真实账号跑完整的 Agent 任务：模块加载一致可以说明解析结果不变，但还没有做端到端的任务回归。

## 风险

### 风险分类

- [x] 其他：发行包中依赖副本的布局变化

### 影响与回滚

- 影响范围：只影响 `pnpm --filter @cindy/host build` 的产物布局。逐条比较依赖解析没有发现差异；如果某个包在运行时绕过 Node 的模块查找、直接按固定相对路径读取兄弟依赖，理论上仍可能受影响，导入测试和 `lifecycle.e2e` 没有发现这种情况。构建时会先完整复制再删除，构建机上临时多占约 1～2GB 磁盘空间。
- 回滚 / 降级方式：回退本 commit 即可，不涉及数据和协议。

### 提交前检查

- [x] 已 review 完整 diff
- [x] 每个 commit 都带 DCO 签名
- [x] UI 改动已在「UI 变化」注明引用的设计规范章节（不涉及）
- [x] 未提交凭证、令牌或授权文件
- [x] 已核对受影响的文档：`copyPackage` 的注释已同步更新
- [x] 已确认测试结果或说明未执行原因
- [x] 不涉及数据读取、通知刷新或常驻组件
