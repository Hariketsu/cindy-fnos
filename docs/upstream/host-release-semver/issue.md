# Issue 草稿：Host 发行包缺少 semver 和 picomatch，启动即退出

> 状态：**草稿，待用户审阅**
> 模板：`.github/ISSUE_TEMPLATE/bug_report.yml`（缺陷报告）。
> 是否附带 PR 由用户决定。修法推荐方案 C（在 `build.mjs` 中显式列出），已在构建机原型验证，待用户确认。

**标题**：`bug: 独立 Host 发行包缺少 semver 和 picomatch，启动时 Cannot find module 'semver'`

---

### 问题描述 / What happened

用当前 `main` 构建的独立 Host 发行包，启动时立即退出：

```text
Error: Cannot find module 'semver'
Require stack:
- <release>/bin/host.mjs
```

期望：发行包能正常启动，`apps/host/scripts/lifecycle.e2e.mjs` 通过。

原因：4ee0876 让 Host 共享 `apps/desktop/src/main/maker-host/piPackageStoreCore.ts`。它和它引入的 `pi-package-compatibility.ts` 分别通过 `createRequire(import.meta.url)('picomatch')` 和 `createRequire(import.meta.url)('semver')` 在运行时加载这两个包（两者都声明在 `apps/desktop/package.json` 中）。`apps/host/scripts/build.mjs` 靠 esbuild 的 `onResolve` 收集需要复制进发行包的包，运行时的 `require` 不经过 esbuild，所以这两个包没有被收集，也没有出现在 `runtime-dependencies.json` 中；发行包根目录的 `node_modules` 下都没有它们（`semver` 只有 `sharp` 等包自己嵌套的副本）。

- `semver` 在模块顶层加载，Host 启动即退出；
- `picomatch` 在函数内部加载，启动不受影响，用到 Pi 扩展的文件匹配时才会抛出 `Cannot find module 'picomatch'`。

逐个检查 `bin/host.mjs` 中所有 `createRequire(import.meta.url)("…")`，只有这两个包缺失（`node-machine-id` 已由 `build.mjs` 显式复制）。

在 cc2dc0f 构建的发行包中，`bin/host.mjs` 不包含这段代码，启动正常。

### 环境 / Environment

- Cindy 版本或 commit：`main` `b975dc3`
- 平台与版本：linux-arm64，Debian 12，Node 22.22.3，pnpm 11.28.9
- 安装方式：源码构建独立 Host（`pnpm --filter @cindy/host build --output <dir>`）

### 复现步骤 / Steps to reproduce

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter desktop exec vite build --config vite.renderer.config.ts`
3. `pnpm --filter @cindy/host build --output /tmp/cindy-host`
4. `CINDY_TEST_HOST_RELEASE=/tmp/cindy-host node apps/host/scripts/lifecycle.e2e.mjs`：失败，报 `Host exited before listening`，子进程输出 `Cannot find module 'semver'`
5. `ls /tmp/cindy-host/node_modules/semver /tmp/cindy-host/node_modules/picomatch`：都不存在
6. 把工作区的 `node_modules/semver`（7.8.5）复制到 `/tmp/cindy-host/node_modules/semver` 后再跑第 4 步：2 项 PASS

### 日志与截图 / Logs & screenshots

```text
Error: Host exited before listening: node:internal/modules/cjs/loader:1430
Error: Cannot find module 'semver'
Require stack:
- /tmp/cindy-host/bin/host.mjs
    at Function._resolveFilename (node:internal/modules/cjs/loader:1430:15)
    ...
    at file:///tmp/cindy-host/bin/host.mjs:749222:45
```

`bin/host.mjs` 第 749222 行：`var semver = createRequire6(import.meta.url)("semver");`，来源 `apps/desktop/src/main/maker-host/pi-package-compatibility.ts`。

建议的修法：`build.mjs` 已有一处专门列出「通过 `createRequire` 加载」的运行时包（`node-machine-id`、`node-pty`、`sharp`），把这两个包按同样方式从 Desktop 的依赖中加入即可：

```js
packages.set('semver', packageRoot('semver', desktopRequire));
packages.set('picomatch', packageRoot('picomatch', desktopRequire));
```

这样只影响 Host 发行包的构建，不改动 Desktop 的代码和打包；Desktop 中三处 `createRequire('semver')` 的写法保持不变。在 `main` `b975dc3` 上按此修改后重新构建：发行包包含 `semver` 7.8.5 和 `picomatch` 4.0.5，`picomatch` 可以正常调用，`lifecycle.e2e.mjs` 2 项 PASS。

后续可以考虑（不在本 issue 范围内）：构建时扫描 bundle 中的 `createRequire(import.meta.url)("…")`，对没有复制进发行包的包直接报错，避免以后共享新的 Desktop 模块时再次遗漏。

`main` 的 CI 目前是绿的：`ci.yml` 的 Host regressions 只运行 `pnpm --filter @cindy/host test` 和 typecheck，没有构建发行包后运行 `test:lifecycle`（`lifecycle.e2e.mjs`）。
