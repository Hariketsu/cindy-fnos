# PR 草稿：Host 构建时可选择打包哪些 harness

> 状态：**草稿，待用户审阅**，未提交。验证结果中标「待补」的部分，会在构建机空闲后补上实测数据。
> 关联 issue：makecindy/cindy#10404（分诊机器人已表示方向接受，并给出实现建议，本 PR 按建议实现）
> 分支：本地 `.upstream/cindy` 中的 `feat/host-selectable-harnesses`，基于上游 `main`（`f58aada`），1 个 commit，带 DCO 签名
> 模板：上游 `.github/PULL_REQUEST_TEMPLATE.md`

---

**标题**：`feat(host): 构建独立 Host 时可选择打包哪些 Agent harness`

## 这次改了什么

### 摘要

`apps/host/scripts/build.mjs` 新增 `--harnesses` 选项（逗号分隔），也可以用环境变量 `CINDY_HOST_HARNESSES` 指定，命令行参数优先。两者都不设置时，仍然打包全部四个 harness，和现在完全一致。

这样，只提供部分 Agent 的发行版（例如只提供 Pi 的飞牛 NAS 应用）不再需要修改构建脚本，也不需要在构建后删除目录导致 `SHA256SUMS.json` 失效。

### 变更类型

- [x] `feat` 新功能

### 范围

- 关联 Issue / 需求：Closes #10404
- 本 PR 包含：
  - 新增 `apps/host/src/release-harnesses.mjs`：harness 选择逻辑，包括合法名称、优先级、未知名称和空选择时的报错、Pi 缺少 ripgrep 时的提示；
  - `build.mjs` 解析 `--harnesses`，在任何构建工作开始前完成选择并校验，按选择结果复制 harness，并把列表写入 `release.json` 的 `harnesses` 字段（同时进入 `__CINDY_HOST_RELEASE__`）；
  - 新增单元测试 `apps/host/src/release-harnesses.test.mjs`。
- 明确不包含：Host 运行时的任何改动（运行时本来就能正确处理缺少的 harness）；Desktop 的打包流程。
- 用户可见变化：无（只影响构建 Host 发行包的开发者）。
- 是否存在 breaking change：无。不传参数时行为不变。

### UI 变化

不涉及。

- 引用的设计规范：不涉及。

## 怎么验证的

### 自动验证

```text
cd apps/host && node --test src/release-harnesses.test.mjs
结果：4 pass，0 fail
pnpm --filter @cindy/host test
结果：待补
```

测试价值（`release-harnesses.test.mjs`）
- 生产入口与可观察结果：`selectReleaseHarnesses()`，即 `build.mjs` 决定打包哪些 harness 的唯一入口；可观察结果是选中的列表、报错信息和警告。
- 规则依据：#10404 中约定的行为（默认全部打包、命令行优先于环境变量、未知名称立即失败、Pi 需要 ripgrep）。
- 现有覆盖为什么不够：`build.mjs` 之前没有选择逻辑，也没有相关测试。
- 最小失败输入与 tier：`{ option: 'pi-bin,pi' }` 必须报 `Unknown harness: pi`；`{ option: 'pi-bin, ripgrep-bin', env: { CINDY_HOST_HARNESSES: 'claude-code-bin' } }` 必须选中 Pi 和 ripgrep。unit tier，无 I/O，耗时约 1ms。

### 手工验证

在 linux-arm64（Debian 12）上用本分支完整构建 Host 发行包（待补实测）：

1. 不传参数：`resources/harnesses/` 下包含全部四项，`release.json` 的 `harnesses` 为全部四项。
2. `--harnesses pi-bin,ripgrep-bin`：只包含这两项，`release.json` 与之一致，`SHA256SUMS.json` 中没有其他 harness 的条目。
3. 只设置 `CINDY_HOST_HARNESSES=pi-bin,ripgrep-bin`：结果同 2。
4. `--harnesses pi-bin`：构建继续，并打印缺少 ripgrep 的警告。
5. `--harnesses pi`：在开始构建前立即失败。
6. 用第 2 步的产物启动 Host：`/health` 报告 `harness: { "claude-code": false, "codex": false, "pi": true }`。

### 未执行的验证

- macOS 与 Windows 平台的发行包构建：改动只涉及选择要复制哪些目录，与平台无关，但没有在这两个平台上实际构建。

## 风险

### 风险分类

- [x] 无已知风险

### 影响与回滚

- 影响范围：只影响 `pnpm --filter @cindy/host build`。不传参数时行为不变。
- 回滚 / 降级方式：回退本 commit 即可，不涉及数据和协议。

### 提交前检查

- [x] 已 review 完整 diff
- [x] 每个 commit 都带 DCO 签名
- [x] UI 改动已在「UI 变化」注明引用的设计规范章节（不涉及）
- [x] 未提交凭证、令牌或授权文件
- [x] 已核对受影响的文档：构建命令只在 `build.mjs` 的用法提示中出现，已同步更新
- [ ] 已确认测试结果或说明未执行原因（待补完整测试结果）
- [x] 不涉及数据读取、通知刷新或常驻组件
