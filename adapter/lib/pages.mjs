// Self-contained pages the adapter serves itself (no external resources).

const page = (title, body, head = '') => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">${head}<title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:15px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .75rem}p{margin:.25rem 0;opacity:.8}</style>
</head><body><main>${body}</main></body></html>`;

export const FORBIDDEN_PAGE = page('无法使用 Cindy',
  '<h1>仅飞牛管理员可以使用 Cindy</h1><p>当前账号没有管理员权限。</p><p>请使用管理员账号登录飞牛后再打开 Cindy。</p>');

export const UNAVAILABLE_PAGE = page('Cindy 暂不可用',
  '<h1>Cindy 正在启动或暂时不可用</h1><p>页面会每隔几秒自动重试。</p><p>如果长时间没有恢复，请在应用中心重新启动 Cindy，或查看应用日志。</p>',
  '<meta http-equiv="refresh" content="5">');
