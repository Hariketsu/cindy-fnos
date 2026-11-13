# PR 草稿：Host 构建复制依赖时，复用 Node 已能解析到的副本

> 状态：**已提交**（经用户审阅）：https://github.com/makecindy/cindy/pull/10419验证数据均为实测（2026-11-13，linux-arm64，Debian 12，基于 `f58aada`）。
> 关联 issue：makecindy/cindy#10406（分诊机器人已表示方向接受，并给出实现与验收要求，本 PR 均已按要求处理）
> 分支：本地 `.upstream/cindy` 中的 `perf/host-dedupe-dependency-copies`，基于上游 `main`（`f58aada`），1 个 commit，带 DCO 签名
> 模板：上游 `.github/PULL_REQUEST_TEMPLATE.md`

---

**标题**：`perf(host): 独立 Host 构建复制依赖时，复用 Node 已能解析到的副本`

## 这次改了什么

### 摘要

`build.mjs` 的 `copyPackage` 会把每个依赖复制到当前包自己的 `node_modules` 下，所以同一个包会在依赖树的每个分支里各复制一份。在 linux-arm64 产物中，一条 AWS SDK 依赖链下 `tslib` 被复制了 554 份，`@aws-sdk/core` 被复制了 119 份，整个产物约 29.8 万个文件。

本 PR 在复制前沿着 Node 的模块解析路径向上查找：最近的同名副本如果是同一来源，就直接复用，不再复制；中间如果隔着一个不同版本，仍然在本地复制。每个 import 解析到的包都与现在相同，产物的目录结构仍然对应 lockfile 的依赖图，不做提升（hoist）。

### 变更类型

- [x] `refactor` / `perf` 重构或性能优化

### 范围

- 关联 Issue / 需求：Closes #10406
- 本 PR 包含：
  - 新增 `apps/host/src/release-dependency-copies.mjs`：判断某个副本是否多余（`resolvesToExistingCopy`）；
  - `build.mjs` 的 `copyPackage` 在复制前调用它；按分诊建议，向上查找时跳过 `node_modules` 和 `@scope` 目录（构建脚本从不在它们下面创建 `node_modules`），边界判断使用 `dir === root || dir.startsWith(root + path.sep)`，原有的循环依赖检查保持不变；
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
结果：285 pass，0 fail
```

测试价值（`release-dependency-copies.test.mjs`）
- 生产入口与可观察结果：`resolvesToExistingCopy()`，即 `copyPackage` 决定是否跳过复制的唯一判断；可观察结果是「复用」或「本地复制」。
- 规则依据：Node 的模块解析规则（逐级向上查找 `node_modules`），以及 `copyPackage` 原有的约定「Nested versions stay nested」。
- 现有覆盖为什么不够：`copyPackage` 是构建脚本内部的函数，没有测试。
- 最小失败输入与 tier：上层是 `tslib@2`、中间是 `tslib@1` 时，必须返回「本地复制」（否则会把 `tslib@2` 错误地交给本应使用 `tslib@1` 的包）；release 根目录以外的副本必须被忽略。unit tier，无 I/O。

### 手工验证

在 linux-arm64（Debian 12）上分别用 `main`（`f58aada`）和本分支完整构建 Host 发行包，两者都打包全部四个 harness：

| | 文件数 | 表面大小 |
|---|---|---|
| `main` | 297,789 | 2743MiB |
| 本分支 | 115,360 | 2326MiB |

两份产物都能启动，`/health` 中四个 harness 均为可用。对 `@aws-sdk/client-bedrock-runtime`、`openai`、`@google/genai`、`@modelcontextprotocol/sdk`、`@anthropic-ai/claude-agent-sdk`、`better-sqlite3`、`sharp`、`node-pty`、`exceljs`、`drizzle-orm`、`remark-gfm`、`playwright-core` 逐个做动态导入，两份产物都是 12 个全部成功。


另外按 #10406 分诊意见中的验收要求，对构建产物运行了上游的进程级验收与清单检查：

```text
CINDY_TEST_HOST_RELEASE=<构建目录> node apps/host/scripts/lifecycle.e2e.mjs
结果：exit 0
PASS: installed Host start, duplicate exclusion, authenticated managed stop, signal shutdown and restart
PASS: background Host survives launcher exit; replacement launcher attaches to the same process and instance
```

- `SHA256SUMS.json`：对产物中每个文件重新计算 SHA256，全部一致。
- `runtime-dependencies.json`：`main` 有 4189 条，本分支为 1724 条；每条记录对应的目录都存在、版本与 `package.json` 一致，产物中也没有未被记录的包。
- 同样的检查在 `main` 的构建产物上也全部通过，作为对照。

### 未执行的验证

- macOS 与 Windows 平台的发行包构建：判断逻辑使用 `path` 处理路径，与平台无关，但没有在这两个平台上实际构建。
- 用真实账号跑完整的 Agent 任务：模块加载一致可以说明解析结果不变，但还没有做端到端的任务回归。

## 风险

### 风险分类

- [x] 其他：发行包中依赖副本的布局变化

### 影响与回滚

- 影响范围：只影响 `pnpm --filter @cindy/host build` 的产物布局。如果某个包在运行时通过自身路径以外的方式定位兄弟依赖，理论上可能受影响；逐个导入的验证没有发现这种情况。
- 回滚 / 降级方式：回退本 commit 即可，不涉及数据和协议。

### 提交前检查

- [x] 已 review 完整 diff
- [x] 每个 commit 都带 DCO 签名
- [x] UI 改动已在「UI 变化」注明引用的设计规范章节（不涉及）
- [x] 未提交凭证、令牌或授权文件
- [x] 已核对受影响的文档：`copyPackage` 的注释已同步更新
- [x] 已确认测试结果或说明未执行原因
- [x] 不涉及数据读取、通知刷新或常驻组件
