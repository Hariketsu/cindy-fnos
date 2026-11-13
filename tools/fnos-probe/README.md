# fnOS 平台探针

一个仅供开发使用的飞牛应用，用来实测平台行为：网关路径和请求头、iframe 嵌入方式、SSE、JS SDK、打开方式入口、后端开放 API。
结论记录在 [docs/fnos-platform-notes.md](../../docs/fnos-platform-notes.md)。飞牛平台升级后，重新跑一遍探针。

```bash
tools/fnos-probe/build.sh     # 输出 build/fnos-probe/cindyprobe.fpk
F=".agents/skills/fnos-cli/scripts/fnos-cli --profile dev-vm --allow-insecure-http"
$F app install-fpk build/fnos-probe/cindyprobe.fpk --volume-id 1 --dry-run --yes
$F app install-fpk build/fnos-probe/cindyprobe.fpk --volume-id 1 --yes \
   --api-scope '{"trim.system.getPlatformConfig":true,"trim.file.path":true,"trim.file.sharedAccess":true,"trim.file.userAccess":true}'
```

从飞牛桌面打开「Cindy Probe」，页面会自动运行检查，并显示结果。交互项（目录选择、打开文件管理器、SSE 空闲测试）需要点按钮。
报告保存在 VM 上的 `/vol1/@appshare/cindyprobe/reports/`（读取需要 sudo）。报告不会记录 Cookie 值和 token。
