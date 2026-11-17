# feat(host): 支持网页首次登录与退出后重新登录

## 这次改了什么

### 摘要

独立 Host 无账号启动后，已配对浏览器可以通过原登录页完成社交登录或同区域企业 SSO，登录成功后直接装配账号运行时，无需停止或重启 Host。退出及账号过期后保留浏览器配对，通过账号状态事件回到登录页。

### 变更类型

- [x] `feat` 新功能
- [ ] `fix` 缺陷修复
- [ ] `refactor` / `perf` 重构或性能优化
- [ ] `docs` / `test` / `chore` 文档、测试或工程维护
- [ ] 其他：

### 范围

- 关联 Issue / 需求：关联 https://github.com/makecindy/cindy/issues/10600（第一阶段；验证码与绑定留待后续，本 PR 合入后 issue 保持打开）
- 本 PR 包含：Host 登录服务复用 `CindyAuthClient`、`reduceAuthFlow`、Desktop 参数校验及托管回调轮询；社交／同区域 SSO、选择账号、SSO 追加验证；认证 controller 写权限；Web shim 转发；安全存储与 `ensureRuntime`；登出保留配对；未登录 SSE 的账号事件通道。
- 明确不包含：手机／邮箱验证码及绑定（Turnstile）、跨区域 SSO、多账号切换、本地模式（#10601）、子路径（#10614）、Electron 客户端浏览器授权交接。
- 用户可见变化：登录页显示真实可用的社交入口及 SSO；浏览器打开授权页，原页面等待结果；退出后不再跳到 `/connect`。
- 是否存在 breaking change：无；新增接口仅供配套网页 shim 使用，普通 Desktop 启动流程不变。

### UI 变化

沿用原 renderer 登录页，未修改组件、布局、颜色或文案。Light／Dark 实机截图待补，未以复用样式冒充已验证。

- 引用的设计规范：`DESIGN.md` §1（复用既有组件与语义 token）、§7、`login-flow.md`（原登录页状态与浏览器授权等待／取消交互）。本次只接宿主能力，未新增视觉元素。

## 怎么验证的

### 自动验证

在 Linux 构建机使用 main 锁文件安装依赖，验证源码 `579662be38`；最终单提交 `947fb154f5823673d8f51f7a2ccd8698eddb3b20` 与该源码的 tree 均为 `beed0863b01c674bbe1aa32cf3313b76ea79d3a2`，`git diff 579662be38 HEAD` 为空。以下耗时为协调器报告的秒级计时（0s 表示不足一秒）：

```text
cd apps/host && node --import tsx --import ./src/loaders/register-raw.mjs --test src/auth/login.test.mjs
结果：12/12，通过，1s

cd apps/host && node --import tsx --import ./src/loaders/register-raw.mjs --test src/server.test.mjs
结果：27/27，通过，0s

cd apps/host && node --import tsx --import ./src/loaders/register-raw.mjs --test src/web-shim.test.mjs
结果：24/24，通过，0s

pnpm --filter @cindy/host test
结果：535/535，通过，42s

NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @cindy/host typecheck
结果：PASS，40s

pnpm check:dev-docs
结果：11/11，通过，1s

pnpm check:test-hygiene
结果：PASS，336 files within baseline，27s
```

最终 HEAD `947fb154f5` 已由协调器在 Linux 构建机补跑：maker-shared 契约测试 118 个文件、2521/2521 通过（4s）；maker-shared typecheck PASS。

本机已做 JS 语法检查与 `git diff --check`；工作树无 node_modules，按任务要求不安装依赖、不运行构建或全套测试。

测试价值（均通过生产入口，unit；单文件实测耗时见上）：

- `auth/login.test.mjs`：原 CLI 测试未覆盖网页状态机。最小输入为一个 Google 授权、两账号兑换结果、迟到回调及一个 SSO 追加验证；验证显示状态、令牌不出 Host、controller 争用、取消后的零凭证提交、SSO 真实动作及无认证上下文拒绝。
- `server.test.mjs`：真实 HTTP 入口验证无 owner 时可调用认证接口、caller 不信请求体、退出不清 Cookie；一个未就绪订阅分别接收历史与实时 owner 事件，必须过滤，只保留账号事件；就绪后正常事件与确认通道恢复，失效后重新过滤。同步调整原先要求账号退出撤销配对的断言。
- `web-shim.test.mjs`：执行实际打包 shim，最小动作是读取登录态、发起 SSO discovery、退出；验证真实路径／参数、弹窗拦截、唯一 SSO 异步自动启动复用预留标签页、账号过期事件投影及无 `/connect` 跳转；真实 server + shim + protocol=2 经解码器验证隐藏事件间隙不会破坏游标，200 条隐藏事件不导致重连，只在可见性边界或隐藏后出现账号事件时重连。

### 手工验证

未执行真实账号手工验证。待实机验收路径：隔离 profile 无账号启动 → 配对 → 社交／SSO 登录 → `/health` ready → 退出 → 无需配对重新登录。

读写开销（代码推导，非实测）：首次获取登录页一次 providers 请求（并发合并）；社交授权不重复获取 providers；SSO discovery 每次一个请求。Host 托管回调轮询沿用 1 秒、30 秒后 2 秒退避及 5 分钟期限。网页只在浏览器授权等待时每秒串行读取 Host 登录态，完成／失败／取消／离页停止；每次状态读取不访问认证服务器。成功时一次 `getMe`、一次加密 session 写入，随后初始化原有运行时。账号状态通知复用同一 SSE，无新增常驻云轮询。账号就绪／未就绪的可见性边界可能新增一次 SSE 重连及一次账号状态读取；仅隐藏事件不增加重连。回包字节未测。

### 未执行的验证

真实账号登录／重新登录、Light／Dark 目检、macOS／Windows／Linux 端到端、弹窗拦截环境及完整 CI 未验证。Linux Host 及 maker-shared 测试与类型检查均已通过；无本机真实凭证读取或模型调用。

## 风险

### 风险分类

- [ ] 无已知风险
- [ ] SQLite / migration
- [ ] system prompt
- [x] 协议兼容
- [x] 权限 / 安全 / 用户数据
- [ ] 存量插件兼容（批准状态 / 指纹 / manifest 校验 / 安装布局 / 包格式）
- [ ] 原生层 / fingerprint / OTA
- [x] 跨平台差异
- [ ] 其他：

### 影响与回滚

- 影响范围：实验性独立 Host 网页认证。配对仍是当前进程内 12 小时 controller 授权；账号退出／过期不再撤销它，Host 重启仍需重新配对。登录展示状态是 Host 全局唯一，其他已配对管理员也能看到账号选择列表等进行中状态；`getLoginState` 不返回 authorizeUrl、ticket、pollSecret 或 verifier（回归断言覆盖）。账号登录写操作只接受传输认证的 caller，PKCE verifier、pollSecret、登录／验证 ticket 不返回浏览器；凭证使用现有系统加密存储，提交前验证身份与 profile 租约。预先取得的租约显式传给 `ensureRuntime`；提交前失败直接释放，交给运行时后由统一 `disposeOwnerRuntime` 在 finally 中释放并置空，登出与失效均走该路径。启动与网页登录共用 `activateAccountRuntime`，CLI 与网页登录共用 session 持久化函数。运行期 owner 固定，拒绝切到另一账号。
- SSE 放宽：允许无 owner 的已配对浏览器连接 `/events`。未就绪、暂停、退出期间历史和实时事件只放行 `auth_changed`，定向确认同样受就绪门约束；登录成功清空历史；可见性改变或隐藏后出现账号事件时，正常结束 SSE 并复用已有重连、`initial` 快照握手及账号状态重读，重新挂接确认通道，避免过滤后的序号缺口。未就绪重连不重放 owner 历史，隐藏事件本身不引发重连，不新增协议帧；旧客户端只看到已有握手及正常 EOF，Mobile／Device Link 协议未修改。测试覆盖过滤与恢复，这项放宽不放开账号业务接口。
- 跨平台：沿用原 credential store 与 Host 运行时，浏览器弹窗／系统 keyring 行为仍需实机验收。服务端返回需要手机／邮箱绑定时明确失败，不伪造登录完成。
- 回滚 / 降级方式：回退本提交后恢复 CLI 登录方式；已存 session 使用既有格式（含 Host device identity），不变更数据库 migration 或删除用户资料。旧网页不会获得新增登录能力。
- 存量插件影响：无；未修改插件契约、批准状态或装入逻辑。

### 提交前检查

- [x] 已 review 完整 diff
- [x] 每个 commit 都带 DCO 签名（`git commit -s`）
- [x] UI 改动已在「UI 变化」注明引用的设计规范章节
- [x] 未提交凭证、令牌或授权文件
- [x] 已核对受影响的文档，行为变化涉及的旧结论已同步修订
- [x] 已确认测试结果或说明未执行原因
- [x] 已在「怎么验证的」写明新增请求／轮询次数及停止条件，字节未实测
