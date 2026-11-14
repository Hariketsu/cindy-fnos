# 回复草稿：PR #10419 变基到最新 main

> 状态：**草稿，待用户审阅**
> 发布位置：PR #10419 的普通评论（不是行内回复）。
> 同时强制推送变基后的分支到 fork（`perf/host-dedupe-dependency-copies`，`781fe8e`），并把 PR 描述「手工验证」一节的数据换成下文的新数据（见 `pr.md`）。

---

#10418 合入后本 PR 与 `main` 冲突，已变基到 `main`（`b975dc3`）。冲突只在 `apps/host/scripts/build.mjs` 的 import 行（两个 PR 各加了一行 import），两边都保留了；`git range-diff` 确认两个 commit 除这处上下文外没有变化。

变基后在 linux-arm64（Debian 12，pnpm 11.28.9）上重新验证：

```text
cd apps/host && node --test src/release-dependency-copies.test.mjs src/release-harnesses.test.mjs
结果：7 pass，0 fail
pnpm --filter @cindy/host test
结果：449 pass，0 fail
```

分别用 `main`（`b975dc3`）和本 PR 完整构建 Host 发行包（打包全部 harness），再逐条比较依赖解析：

| | 文件数 | 大小 |
|---|---|---|
| `main` | 297,990 | 3.6G |
| 本 PR | 32,743 | 2.2G |

```text
reference packages 4974, candidate packages 801, compared importers 801, removed copies 4173
dependency edges checked 1309 (unresolved in both: 61), differences 0
```

本 PR 的产物：`SHA256SUMS.json` 32,742 个文件全部一致；`runtime-dependencies.json` 741 条记录对应的目录全部存在。PR 描述中列出的 12 个包逐个动态导入，`main` 与本 PR 的结果完全一致（8 个成功；`@aws-sdk/client-bedrock-runtime`、`openai`、`@google/genai`、`@modelcontextprotocol/sdk` 两边都无法从根目录导入，当前 `main` 不再把它们作为根目录运行时依赖复制）。

另外发现一个与本 PR 无关的问题：当前 `main` 构建的 Host 发行包启动时报 `Cannot find module 'semver'`，`main` 和本 PR 的产物都一样，所以 `lifecycle.e2e.mjs` 在两者上都失败。手动把 `semver` 放进两个产物的 `node_modules` 后，`lifecycle.e2e.mjs` 在两者上都通过（各 2 项 PASS）。这个问题我会另开 issue。
