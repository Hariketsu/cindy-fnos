# Cindy for fnOS：Agent 工作入口

本仓库把上游 [Cindy](https://github.com/makecindy/cindy) 的原版 Renderer 与无界面 Host 打包为飞牛 fnOS 原生应用。
开始前先读 [docs/architecture.md](docs/architecture.md)，了解当前进度读 [TODO.md](TODO.md)。

## 仓库边界

- 本仓库只包含飞牛适配：`adapter/`、`bridge/`、`fpk/`、`patches/`、`scripts/`、`tests/`、`docs/`。
- **不 fork、不复制上游源码。** 上游通过 `upstream.lock` 锁定的 commit 在构建时拉取。
- 修改上游行为的优先顺序：
  1. 在 Adapter 或 bridge 中处理（代理层改写、覆盖 `electronAPI` 方法）
  2. 给上游提 issue/PR
  3. 等待合入期间，才在 `patches/` 中加最小补丁

  每个补丁都要在文件头写明对应的上游 issue/PR 和删除条件。
- 不修改上游 Renderer 的界面代码。确实需要调整布局时，用独立的 CSS 覆盖，并说明原因。

## 安全底线

- 用户凭据、Token、API Key、飞牛账号密码、VM 的 IP 等本机信息不得写入任何会被 git 跟踪的文件。本机配置放在 `.env.local`（已被忽略）。
- Host 只监听 loopback；不得为图方便放宽 Adapter 的身份校验、CSP 或来源校验。
- Agent 以包用户运行，不使用 root，不加入额外的用户组。
- 未经用户明确同意，不执行：推送、发布 Release、提交上游 issue/PR、在用户的真实 NAS 上安装或修改任何东西、删除 VM 或快照。

## 开发与验证

环境分层与人工步骤见 [docs/development.md](docs/development.md)。

- **在哪个环境验证由用户决定。** 需要新环境，或要改变验证方式时，先说明理由并征得同意。
- 平台行为以飞牛 VM 中的实测为准，不以文档推测为准；实测结论写入 `docs/fnos-platform-notes.md`。
- 「代码存在」「单元测试通过」都不等于「功能可用」。只有在飞牛 VM 中通过真实入口走通的功能，才能在 README 中标为可用。
- 遇到需要用户操作的步骤（图形安装界面、账号登录、提供密钥），立即停下来告诉用户要做什么，不要猜测或绕过。
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

## Git

- 提交信息使用 Conventional Commits（`feat:`、`fix:`、`docs:`、`build:`、`test:`、`chore:`），正文写明原因。
- 完成一个可验证的小步骤就提交一次；不把无关改动混在同一个提交里。
- 本地提交可以自主进行；推送需要用户同意。
