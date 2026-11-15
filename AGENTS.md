# Cindy for fnOS：Agent 工作入口

本仓库把上游 [Cindy](https://github.com/makecindy/cindy) 的原版 Renderer 与无界面 Host 打包为飞牛 fnOS 原生应用。
开始前先读本机最新的交接文档（`handoff/`，不入库）、[TODO.md](TODO.md) 和 [docs/architecture.md](docs/architecture.md)。

本机环境与个人约定见 @AGENTS.local.md（不入库；新维护者参照 [AGENTS.local.example.md](AGENTS.local.example.md) 自建）。

## 仓库边界

- 本仓库只包含飞牛适配：`adapter/`、`bridge/`、`fpk/`、`patches/`、`scripts/`、`tests/`、`docs/`。
- **不长期维护上游代码的分叉，也不复制上游源码。** 上游通过 `upstream.lock` 锁定的 commit 在构建时拉取。给上游提 PR 用的 fork 只承载 PR 分支。
- 修改上游行为的优先顺序：
  1. 在 Adapter 或 bridge 中处理（代理层改写、覆盖 `electronAPI` 方法）
  2. 给上游提 issue/PR
  3. 等待合入期间，才在 `patches/` 中加最小补丁

  每个补丁都要在文件头写明对应的上游 issue/PR 和删除条件。
- 不修改上游 Renderer 的界面代码。确实需要调整布局时，用独立的 CSS 覆盖，并说明原因。

## 向上游 Cindy 贡献

1. **先 issue，后 PR。** 每个准备提交给上游的改动，都先写好 issue；PR 正文里关联这个 issue（「关联 Issue / 需求」一栏）。
2. **先给用户过目。** issue 和 PR 的完整草稿先写进 `docs/upstream/<序号>-<主题>/`（如 `docs/upstream/12-host-custom-providers/issue.md`、`pr.md`），由用户审阅确认后才能提交。序号两位数，按新建顺序递增，不复用。提交 issue 和 PR 都属于对外操作，必须得到用户的明确同意。
3. **遵循 Cindy 社区规范**（以锁定 commit 的上游仓库为准，改动前重新核对）：
   - issue 使用上游 `.github/ISSUE_TEMPLATE/` 中对应的模板。功能建议填「使用场景 / 当前问题 / 期望方案 / 已考虑的替代方案」；缺陷填「问题描述 / 环境 / 复现步骤 / 日志与截图」。
   - PR 标题格式是 `<type>(<scope>): <简短描述>`，正文完整填写 `.github/PULL_REQUEST_TEMPLATE.md` 的各节：改了什么、范围、UI 变化、怎么验证的（附实际命令和结果）、未执行的验证、风险与回滚、提交前检查。
   - 每个 commit 都带 DCO 签名（`git commit -s`），一个 PR 只解决一个问题，并遵守上游 `CONTRIBUTING.md` 与相关专题规则（如测试价值门槛）。
4. **截图要说清来源。** issue/PR 里的截图如果包含本项目自己的页面或文案（例如 Adapter 的登录页、我们写的提示），必须在截图旁写明哪些是本项目加的、哪些是上游原样，避免维护者把它当成 Cindy 的界面。截图草稿放在对应的 `docs/upstream/<序号>-<主题>/` 目录。
5. 对审查意见的回复同样先写草稿（如 `docs/upstream/<序号>-<主题>/review-reply.md`），经用户审阅后再发出。
6. PR 分支放在被忽略的 `.upstream/cindy` 中（`origin` 指向上游，`fork` 指向贡献者的 fork），基于上游最新的 `main`。本地补丁 `patches/0001-…` 必须与 PR 代码一致：把各 PR 分支叠加到一个集成分支上再导出，并确认所有补丁能按顺序应用到 `upstream.lock` 中的 commit。
7. 声称「行为不变」之类的结论要有可复现的证据（例如依赖去重用 `tools/release-resolution-check.mjs` 逐条比较解析结果），不能只靠抽样。
8. issue/PR 合入或关闭后，删除 `patches/` 中对应的补丁，把对应的 `docs/upstream/<序号>-<主题>/` 移到 `docs/upstream/archive/`（保留序号），同步更新 `docs/plan.md` 和 `TODO.md` 的「上游事项」。

## 安全底线

- **公开前先审计。** 推送到公开仓库之前，检查新增的文件**和完整历史**（包括 commit 信息）中有没有内网 IP、主机名、密码、token、本机路径。设计讨论记录这类私人材料放在被忽略的 `ref/`，本机信息放在 `.env.local` 和 `AGENTS.local.md`。拿不准的地方先问用户。

- 用户凭据、Token、API Key、飞牛账号密码、VM 的 IP 等本机信息不得写入任何会被 git 跟踪的文件。本机配置放在 `.env.local`（已被忽略）。
- `.env.example` 是 `.env.local` 的模板，会入库：只写字段名、说明和占位值，不写真实值。新增本机配置字段时，先改 `.env.example`，再请用户把真实值填进 `.env.local`。
- Host 只监听 loopback；不得为图方便放宽 Adapter 的身份校验、CSP 或来源校验。
- Agent 以包用户运行，不使用 root，不加入额外的用户组。
- 未经用户明确同意，不执行：推送、发布 Release、提交上游 issue/PR、在用户的真实 NAS 上安装或修改任何东西、删除 VM 或快照。

## 开发与验证

环境分层与人工步骤见 [docs/development.md](docs/development.md)。

- **在哪个环境验证由用户决定。** 需要新环境，或要改变验证方式时，先说明理由并征得同意。
- 平台行为以飞牛 VM 中的实测为准，不以文档推测为准；实测结论写入 `docs/fnos-platform-notes.md`。
- **已经测过、有记录的结论直接引用，不要重复测量。** 尤其不要为了复测而往 ext4 存储空间或用户文件区解压 Host 产物（会占用约 24GB，见平台笔记）。
- 「代码存在」「单元测试通过」都不等于「功能可用」。只有在飞牛 VM 中通过真实入口走通的功能，才能在 README 中标为可用。
- 遇到需要用户操作的步骤（图形安装界面、账号登录、提供密钥），立即停下来告诉用户要做什么，不要猜测或绕过。
- 被权限检查拦下的操作（例如删除 VM、下载并执行未知二进制）不要绕过，说明原因后交给用户处理。
- 磁盘空间有限：大量写入前先看剩余空间；在 VM 里删除大量文件后执行 `sudo fstrim -av`（见 [docs/development.md](docs/development.md)「磁盘空间」）。
- 阶段验收的证据写入 `docs/evidence/`，包括哪些项没有验证。

### 操作飞牛设备

- 用仓库内的官方 skill `fnos-cli`（`.agents/skills/fnos-cli/`，版本记录在 `skills-lock.json`）管理飞牛：安装 fpk、启停应用、查日志、看存储。使用前先读它的 `SKILL.md`。
- 开发 VM 使用 profile `dev-vm`；访问 VM 的明文 HTTP 需要加 `--allow-insecure-http`：
  `.agents/skills/fnos-cli/scripts/fnos-cli --profile dev-vm --allow-insecure-http <命令>`
- 授权由用户在浏览器中完成，Agent 只接收用户主动发来的一次性 code，不复述也不保存。真机使用单独的 profile，并且要经用户同意。
- 写操作（安装、卸载、存储、网络）先用 `--dry-run` 预检；存储类写操作必须先征得用户同意。
- 升级 skill 是显式操作：用 `npx skills` 更新，在同一个提交里更新 `skills-lock.json`，并说明原因。

## 文档维护

改动导致下列内容过时时，在同一次提交中更新对应文档：

| 文档 | 读者 | 何时更新 |
|---|---|---|
| `README.md` | 首次接触项目的潜在用户 | 功能可用性、安装方式、系统要求变化时。只讲价值、效果、上手方式和延伸阅读，技术细节放到 `docs/` |
| `docs/architecture.md` | 想了解系统的人 | 组件、请求路径、取舍或安全边界变化时 |
| `docs/plan.md` | 项目参与者 | 决策、阶段范围或验收标准变化时 |
| `TODO.md` | 项目参与者 | 每完成一项、发现新问题或暂缓一个决定时 |
| `AGENTS.md` | Agent | 工作规则变化时 |

`AGENTS.md` 中的规则写成通用的原则：说明适用于什么情况、要怎么做，不针对某一次具体的问题。

`docs/` 下的指南（如 `development.md`）只写任何贡献者都适用的做法。带日期的实测写进 `docs/fnos-platform-notes.md` 或 `docs/evidence/`；维护者本机的状态和排查经过写进 `AGENTS.local.md` 或交接文档。

## 交接

- 会话结束前，或上下文快用完时，写 `handoff/handoff-<YYYY-MM-DD>-<主题>.md`：当前状态、环境、下一步（附命令）、已知的坑、用户偏好。长期结论放在 `docs/`，交接文档只写「接手要点」。`handoff/` 已被 git 忽略：交接文档会写到本机环境和维护者偏好，不进入公开仓库。
- 新会话先读最新的交接文档，再读 TODO.md。
- 工作中得到的经验和用户偏好，写进 `AGENTS.md`（适用于所有维护者）或 `AGENTS.local.md`（本机和个人），不写进某个 Agent 工具私有的记忆：换一个工具或维护者，就看不到那里的内容。

## Git

- 提交信息使用 Conventional Commits（`feat:`、`fix:`、`docs:`、`build:`、`test:`、`chore:`）。标题说明改了什么，正文写给日后读代码的人：为什么改、做了哪些取舍。只写与改动本身有关的事实，不写改动的过程和作者的环境。
- 完成一个可验证的小步骤就提交一次；不把无关改动混在同一个提交里。
- 本地提交可以自主进行；推送需要用户同意。
