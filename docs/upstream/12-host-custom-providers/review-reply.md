感谢指出，已确认。Host 创建供应商后已经发布 `maker:provider:changed`，Web shim 缺少这个事件的映射，所以其他已打开的标签页收不到刷新通知。

已在 SSE 分发表将该事件接到 `maker.onProvidersChanged`。创建事件没有 payload，沿用现有转发后会收到一次 `undefined`；Host 事件也没有 owner stamp。

回归用例通过实际打包的 Web shim 从 SSE 注入一条创建后的通知，并断言订阅回调恰好执行一次。修复前的 `8426333da0` 已在 Linux 复现，回调次数为 0；修复后的 `df6af3d85a` 上 Web shim 20/20、Host 供应商配置 6/6、共享契约 9/9 通过，Host 类型检查与文档检查也通过。
