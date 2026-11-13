# Issue 草稿：Host 构建复制依赖时去掉 Node 不会用到的重复副本

> 状态：**草稿，待用户审阅**，未提交。
> 模板：上游 `.github/ISSUE_TEMPLATE/feature_request.yml`（功能建议）
> 上游基线：`makecindy/cindy@cc2dc0f`
> 本地补丁：`patches/0002-host-build-dedupe-dependency-copies.patch`

---

**标题**：`perf(host): 独立 Host 构建复制依赖时，复用 Node 已能解析到的副本`

### 使用场景 / Use case

我正在把 Cindy 打包成飞牛 NAS（fnOS）的原生应用，后台运行 `apps/host/scripts/build.mjs` 产出的独立 Host。项目和开发进度公开在 [Hariketsu/cindy-fnos](https://github.com/Hariketsu/cindy-fnos)。相关 issue：#10404。

NAS 上安装的应用对**文件数量**很敏感。飞牛的 ext4 存储空间使用 64KB 的簇（bigalloc），每个文件至少占用 64KB。Host 产物有约 29.8 万个文件，表面大小只有约 2GB，但解压到 ext4 存储空间后实际占用约 24GB（[实测记录](https://github.com/Hariketsu/cindy-fnos/blob/main/docs/fnos-platform-notes.md#存储与文件系统)）。其他使用大簇文件系统的服务器部署也会遇到同样的问题，安装、升级、卸载时处理这么多文件也很慢。

### 当前问题 / Current limitation

`copyPackage` 会把每个依赖复制到当前包**自己的** `node_modules` 下，只有遇到循环依赖时才复用祖先里的副本。所以同一个包会在依赖树的每个分支里被完整复制一遍。

以 linux-arm64 产物为例：在 `@earendil-works/pi-ai` → `@aws-sdk/client-bedrock-runtime` → `@aws-sdk/credential-provider-node` 这一条依赖链下，`tslib` 被复制了 554 份，`@aws-sdk/core` 被复制了 119 份。整个产物的 29.8 万个文件里，`pi-ai` 及其依赖就占了 25 万个。

但其中绝大多数副本 Node 永远不会加载：Node 解析裸模块名时，会从导入方所在的包开始，逐级向上查找 `node_modules`。只要上层已经有同一来源的副本，下层这份就是多余的。

### 期望方案 / Proposed solution

在 `copyPackage` 复制之前，沿着 Node 的查找路径向上检查：

- 如果**最近**一个同名副本就是同一来源（`copying` 中记录的 source 相同），直接复用，不再复制；
- 如果中间隔着一个**不同版本**的同名包，它会遮蔽上层的副本，这时仍然在本地复制，行为与现在相同。

这样每个 import 解析到的包与现在完全相同，`Conflicting runtime dependency` 检查也保留；同时不做提升（hoist），产物的目录结构仍然对应 lockfile 的依赖图。改动约 10 行：

```js
for (let dir = path.dirname(parent); dir.startsWith(staging); dir = path.dirname(dir)) {
  if (path.basename(dir) === 'node_modules') continue;
  const candidate = path.join(dir, 'node_modules', manifest.name);
  if (!copying.has(candidate)) continue;
  if (copying.get(candidate) === source) return;
  break;
}
```

在 `cc2dc0f` 的 linux-arm64 构建上实测：

| | 文件数 | 表面大小 |
|---|---|---|
| 现在 | 297,738 | 1958MiB |
| 加上这个改动 | 115,309 | 1542MiB |

验证：去重后的产物能正常启动，`/health` 正常；对 `@aws-sdk/client-bedrock-runtime`、`openai`、`@google/genai`、`@modelcontextprotocol/sdk`、`@anthropic-ai/claude-agent-sdk`、`better-sqlite3`、`sharp`、`node-pty`、`exceljs`、`drizzle-orm`、`remark-gfm`、`playwright-core` 逐个做动态导入，结果与去重前完全一致。如果方向可以接受，我可以提交 PR。

### 已考虑的替代方案 / Alternatives considered

- **安装后把重复文件改成硬链接**：能省磁盘空间，但文件数不变，而且要求所有分发和解压环节都保留硬链接，比较脆弱。
- **提升（hoist）到顶层 `node_modules`**：能去掉更多副本，但会改变产物的目录结构，和现在「保留 lockfile 实际依赖图」的设计不一致，风险也更大。
- **发行方自行裁剪**：我们在 fnOS 发行版中还额外删除了类型声明、source map 等运行时不用的文件，这一部分适合留给发行方处理；但重复副本是构建方式本身造成的，在上游解决更合适，所有 Linux 服务器部署都会受益。
