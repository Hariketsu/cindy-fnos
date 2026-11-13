# Issue 草稿：Host 构建时可选择打包哪些 harness

> 状态：**草稿，待用户审阅**，未提交。
> 模板：上游 `.github/ISSUE_TEMPLATE/feature_request.yml`（功能建议）
> 上游基线：`makecindy/cindy@cc2dc0f`

---

**标题**：`feat(host): 构建独立 Host 时可选择打包哪些 Agent harness`

### 使用场景 / Use case

我们在把 Cindy Host 打包成飞牛 NAS（fnOS）的原生应用，界面复用官方 Renderer，后台运行 `apps/host/scripts/build.mjs` 产出的独立 Host。项目和开发进度公开在 [Hariketsu/cindy-fnos](https://github.com/Hariketsu/cindy-fnos)，架构见 [docs/architecture.md](https://github.com/Hariketsu/cindy-fnos/blob/main/docs/architecture.md)。
这个发行版只提供 Pi 一个 Agent，不内置 Claude Code 和 Codex。这是产品取舍：NAS 用户主要通过 API Key 使用模型，而且安装包体积对 NAS 应用影响很大。

### 当前问题 / Current limitation

`build.mjs` 把四个 harness 写死为必须打包：

```js
for (const name of ['claude-code-bin', 'codex-package-bin', 'pi-bin', 'ripgrep-bin']) {
```

不需要某个 Agent 的发行版，只能修改构建脚本，或者先打包再手动删除。后者会让 `SHA256SUMS.json` 和实际文件对不上。
在 linux-arm64 上，`claude-code-bin` 约 326MB，`codex-package-bin` 约 459MB，两者合计约 785MB。

Host 运行时本身已经能正确处理缺少的 harness：只打包 Pi 和 ripgrep 时，Host 能正常启动，`/health` 报告 `harness: { "claude-code": false, "codex": false, "pi": true }`。

### 期望方案 / Proposed solution

构建时通过环境变量 `CINDY_HOST_HARNESSES`（逗号分隔）选择要打包的 harness：

- 不设置时打包全部四个，行为与现在完全一致；
- 出现未知名称时直接报错，避免拼写错误导致漏打包；
- 把实际打包的列表写进 `release.json` 的 `harnesses` 字段，便于发行版和排障时核对。

改动集中在 `apps/host/scripts/build.mjs`，约 10 行。我们已经在 fnOS 的构建中使用这个改动（[patches/0001-host-build-selectable-harnesses.patch](https://github.com/Hariketsu/cindy-fnos/blob/main/patches/0001-host-build-selectable-harnesses.patch)），并在 ARM 飞牛上验证过 Host 启动和 harness 状态（[实测记录](https://github.com/Hariketsu/cindy-fnos/blob/main/docs/fnos-platform-notes.md#cindy-host-实测p0)）。如果方向可以接受，我们可以提交 PR。

### 已考虑的替代方案 / Alternatives considered

- **打包后删除目录**：会让 `SHA256SUMS.json` 与实际文件不一致，破坏发行目录的完整性校验。
- **命令行参数（如 `--harness pi-bin`）**：也可以，和现有的 `--output`、`--web-dir` 风格更一致；如果维护者更倾向这种方式，我们可以改成参数。
- **在发行版中保留全部 harness**：安装包会多出约 785MB，对 NAS 应用不合适。
