# Issue 草稿：Host 发行包缺少 semver，启动即退出

> 状态：**草稿，待用户审阅**
> 模板：`.github/ISSUE_TEMPLATE/bug_report.yml`（缺陷报告）。
> 是否附带 PR 由用户决定；修法有多种（见「可能的修法」），先让维护者选择。

**标题**：`bug: 独立 Host 发行包缺少 semver，启动时 Cannot find module 'semver'`

---

### 问题描述 / What happened

用当前 `main` 构建的独立 Host 发行包，启动时立即退出：

```text
Error: Cannot find module 'semver'
Require stack:
- <release>/bin/host.mjs
```

期望：发行包能正常启动，`apps/host/scripts/lifecycle.e2e.mjs` 通过。

原因：4ee0876 让 Host 共享 `apps/desktop/src/main/maker-host/piPackageStoreCore.ts`，它引入的 `pi-package-compatibility.ts` 通过 `createRequire(import.meta.url)('semver')` 在运行时加载 `semver`。`apps/host/scripts/build.mjs` 靠 esbuild 的 `onResolve` 收集需要复制进发行包的包，运行时的 `require` 不经过 esbuild，所以 `semver` 没有被收集，也没有出现在 `runtime-dependencies.json` 中。发行包根目录的 `node_modules` 下没有 `semver`（只有 `sharp` 等包自己嵌套的副本）。

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
5. `ls /tmp/cindy-host/node_modules/semver`：不存在
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

可能的修法（供参考）：

- 在 `pi-package-compatibility.ts` 中改用静态 `import`，让 esbuild 能看到并把 `semver` 作为运行时依赖复制；
- 或在 `apps/host/package.json` 中声明 `semver`，并让构建把它列入运行时依赖。

`main` 的 CI 目前是绿的：`ci.yml` 的 Host regressions 只运行 `pnpm --filter @cindy/host test` 和 typecheck，没有构建发行包后运行 `test:lifecycle`（`lifecycle.e2e.mjs`）。
