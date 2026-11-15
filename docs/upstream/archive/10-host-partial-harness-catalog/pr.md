# PR 草稿：模型目录只读取 runtime 注册了的 agent 的能力

> 状态：**已提交**（经用户审阅）：https://github.com/makecindy/cindy/pull/10642 。「手工验证」一节待带本分支的 fpk 装进 VM 后在 PR 中补充。
> 关联 issue：makecindy/cindy#10640
> 分支：本地 `.upstream/cindy` 中的 `fix/capabilities-unregistered-agents`，基于上游 `main`（`b975dc3`），1 个 commit，带 DCO 签名。
> 模板：上游 `.github/PULL_REQUEST_TEMPLATE.md`
> 验证数据均为实测（2026-11-15，构建机 linux-arm64，Debian 12，Node 22.22.3，pnpm 11.28.9）。

---

**标题**：`fix(desktop): 模型目录只读取 runtime 注册了的 agent 的能力`

## 这次改了什么

### 摘要

`loadLocalCapabilitiesSnapshot` 对 Claude Code、Codex、Pi 都请求能力，只容忍 Pi 未注册（#1468）。#10418 之后独立 Host 可以只打包部分 agent；只带 Pi 时 Claude Code 和 Codex 永远未注册，每次刷新都失败，网页端模型目录一直是「模型列表暂时无法更新」。

本 PR 先读取 runtime 注册了哪些 agent（`maker:list-available-agents`，`useAvailableAgents` 已把它作为权威来源），只对这些 agent 请求能力。列表里的 agent 仍保持 #1468 的原子失败语义；桌面版的列表总是包含核心 agent，行为不变。

### 变更类型

- [x] `fix` 缺陷修复

### 范围

- 关联 Issue / 需求：Closes #10640
- 本 PR 包含：
  - `apps/desktop/src/renderer/hooks/useAgentCapabilities.ts`：`loadLocalCapabilitiesSnapshot` 先调用 `listAvailableAgents()`，只对列表中的 agent 调用 `getCapabilities`；`MakerApiShape` 补上该方法的类型；
  - `apps/desktop/src/renderer/__tests__/agentCapabilitiesDeviceCache.test.ts`：新增「runtime 只注册了 Pi」用例；两个桩函数补上 `listAvailableAgents`（默认返回三个 agent，原有用例的输入不变）；
  - `apps/desktop/src/renderer/__tests__/remoteModelHooksDeviceOwnership.test.tsx`：三个桩补上 `listAvailableAgents`（默认三个 agent）。
- 明确不包含：
  - #1468 的 Pi 未注册容错（保留，处理「列表里有 Pi、读取时却未注册」的时序）；
  - 远程设备的能力读取（`fetchCapabilities` 走 device-link，不经过这里）；
  - Host 的 `/api/capabilities` 和网页 shim。
- 用户可见变化：只打包部分 agent 的独立 Host，网页端模型目录和模型选择器正常显示已打包 agent 的模型。桌面版无变化。
- 是否存在 breaking change：无。

### UI 变化

不涉及：只改变能力快照读取哪些 agent，没有界面、样式或文案改动。

- 引用的设计规范：不涉及：只改变模型能力快照读取哪些 agent 的数据逻辑和对应测试，没有视觉、交互或文案变化。

## 怎么验证的

### 自动验证

```text
cd apps/desktop && pnpm exec vitest run \
  src/renderer/__tests__/agentCapabilitiesDeviceCache.test.ts \
  src/renderer/__tests__/authContextSessionBoundary.test.tsx \
  src/renderer/__tests__/localCatalogSnapshot.test.ts \
  src/renderer/__tests__/remoteModelHooksDeviceOwnership.test.tsx \
  src/renderer/features/bots/__tests__/botModelChainDefaults.test.tsx \
  src/renderer/features/bots/__tests__/botStore.test.ts \
  src/renderer/hooks/__tests__/useProviders.test.tsx
结果：7 files passed，140 tests passed
（以上是所有经过 loadLocalCapabilitiesSnapshot / refreshLocalCatalogSnapshot 的测试文件）
（只保留新测试、换回 main 的 useAgentCapabilities.ts：agentCapabilitiesDeviceCache 1 failed / 33 passed，失败的是新用例）

NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter desktop run --if-present typecheck
结果：通过（exit 0）

pnpm check:test-hygiene
结果：PASS（341 files within baseline）

pnpm exec prettier（只看本 PR 改动的行）
结果：无格式差异（这几个文件在 main 上已有与本 PR 无关的格式差异，未顺带修改）
```

测试价值（`agentCapabilitiesDeviceCache.test.ts`，补充到现有文件）
- 生产入口与可观察结果：`refreshLocalCatalogSnapshot()`（设置页、模型选择器与启动预加载共用的目录刷新入口）；可观察结果是刷新是否成功、提交的 provider 快照，以及各 agent 的能力缓存。
- Bug／规则依据：#10640；`--harnesses` 允许只打包部分 agent（#10418）；#1468 规定核心 agent 失败要原子回滚。
- 现有覆盖缺口：现有用例都假定三个 agent 全部注册，「Pi 不可用」和「核心 agent 失败」两类用例覆盖的是读取失败，没有覆盖 runtime 根本没有注册某个 agent 的情况。
- 最小失败输入：runtime 只注册 `pi`。刷新必须成功、提交 provider 快照、只请求一次 `getCapabilities('pi')`，Claude Code / Codex 的缓存为空（修改前刷新失败）。
- tier：unit，复用文件内已有的 IPC 桩，无 I/O。
- 实测耗时：单独运行该文件约 2.2 秒（vitest Duration）。

另外两个测试文件只给已有的桩补上 `listAvailableAgents`，没有新增用例。其中 `remoteModelHooksDeviceOwnership.test.tsx` 第三个用例原本靠「临时 IPC 失败」走到失败分支，不补桩的话会因为缺少方法提前失败、名义上仍然通过，所以三个桩都补了。

### 手工验证

（待补）计划：在飞牛 fnOS 1.2.1010（linux-arm64）虚拟机中，用带本分支 renderer 的只打包 Pi 的 Host，确认新建任务页和「设置 → 模型供应商」正常显示 Pi 的模型，并能发送一条消息。

原因已在同一环境中确认：在已构建的 renderer 里临时放宽这处判断后，模型选择器立即正常显示（见 #10640 的截图）。

### 未执行的验证

- 桌面版 GUI：桌面的 `maker:list-available-agents` 与 `maker:get-capabilities` 读取同一个 Maker 的 agent 表，核心 agent 总在列表中，原子失败语义由原有用例覆盖；没有启动修改后的桌面版实测。
- `pnpm test:unit` 全量：只运行了上面列出的、所有经过这段代码的测试文件。

## 风险

### 风险分类

- [x] 无已知风险

### 影响与回滚

- 影响范围：本机能力快照的读取多一次 `maker:list-available-agents` IPC（每次目录刷新一次，本地调用）。`listAvailableAgents` 失败时整轮刷新失败并保留上一份快照，与能力读取失败的处理一致。
- 回滚 / 降级方式：回退本 commit 即可；无数据、协议或持久化变更。

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
  `docs/dev-rules/server-channel-review.md`）（每次本机目录刷新多 1 次本地 IPC，见「影响与回滚」）
