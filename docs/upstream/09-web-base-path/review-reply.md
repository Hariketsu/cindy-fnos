感谢指出，已确认。Host 在 bearer 鉴权前检查请求的 `Host` 和 `Origin`。代理原样转发浏览器的公开站点 `Origin` 时，即使 bearer 有效，Host 也会返回 `403 origin_not_allowed`。

已补充子路径部署说明的第 2 步。代理将上游 `Host` 设为实际监听的回环地址和端口，先校验浏览器的 `Origin`，校验通过后才移除它或改为对应的回环来源。

已直接调用生产 `isLoopbackRequest` 验证公开来源被拒绝，匹配的回环来源通过。修订提交 `c8f5e64ebf` 已在 Linux 通过 `pnpm check:dev-docs`。
