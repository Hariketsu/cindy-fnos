## 回复 MagicLizi（rev `c8f5e64ebf` P1：控制字符绕过同源路径校验）

感谢指出，复现确认成立。WHATWG URL 解析会先剥离 ASCII tab / CR / LF，因此 `"/\t/evil.example"` 等输入能通过原正则并解析为 `//evil.example/...`，既会让 `location.replace` 跳出当前站点，也会让 `fetch` 跨源发送请求。

已在修订提交 `ab84ad3b06` 中修复：

- `apps/web/shim.js`：`base` 校验改为 `/^\/(?!\/)[^\\\x00-\x1F\x7F]*$/`，拒绝 ASCII 控制字符，并同步更新注释；
- `apps/host/src/web-shim.test.mjs`：在「非同源路径被忽略」的表驱动用例中补充 `'/\t/evil.example'`、`'/\n/evil.example'`、`'/\r/evil.example'`（先确认修复前失败在 `'/\t/evil.example'`，修复后通过）；
- `docs/host/README.md`：第 3 步同步补充「或控制字符」。

已在 Linux（Debian 12 arm64）复跑验证：
- `cd apps/host && node --import tsx --import ./src/loaders/register-raw.mjs --test src/web-shim.test.mjs`：21/21 通过（0.31s）
- `pnpm --filter @cindy/host test`：532/532 通过（40.3s）
- `pnpm check:test-hygiene`：PASS（334 files within baseline）
- `pnpm check:dev-docs`：15/15 通过（0.36s）

完整跨平台 CI 请以本次推送后本 PR 的检查结果为准，欢迎重新审查。
