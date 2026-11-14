// Self-contained pages the adapter serves itself (no external resources).

const page = (title, body, head = '') => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">${head}<title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:15px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .75rem}p{margin:.25rem 0;opacity:.8}</style>
</head><body><main>${body}</main></body></html>`;

export const FORBIDDEN_PAGE = page('无法使用 Cindy',
  '<h1>仅飞牛管理员可以使用 Cindy</h1><p>当前账号没有管理员权限。</p><p>请使用管理员账号登录飞牛后再打开 Cindy。</p>');

/** Cindy sign-in page; `prefix` is the gateway prefix (e.g. /app/cindy). */
export function loginPage(prefix) {
  const base = JSON.stringify(prefix).replace(/</g, '\\u003c');
  return page('登录 Cindy', `<h1>登录 Cindy 账号</h1>
<p id="msg">登录后才能使用 Cindy。目前支持微信登录。</p>
<p><a id="open" hidden target="_blank" rel="noopener noreferrer">打开微信登录页</a></p>
<p><button id="go" type="button">使用微信登录</button> <button id="cancel" type="button" hidden>取消</button></p>
<script>
const base = ${base};
const $ = id => document.getElementById(id);
const say = text => { $('msg').textContent = text; };
let timer;
async function call(path, method) {
  const res = await fetch(base + '/_fnos/login' + path, { method, headers: { accept: 'application/json' } });
  return res.json();
}
function render(s) {
  $('go').hidden = !['idle', 'failed', 'cancelled'].includes(s.state);
  $('cancel').hidden = !['starting', 'waiting'].includes(s.state);
  $('open').hidden = s.state !== 'waiting';
  if (s.state === 'starting') say('正在准备登录：暂停 Cindy 服务……');
  if (s.state === 'waiting') { $('open').href = s.url; say('点击下方链接，在新打开的页面用手机微信扫码；完成后回到这里，页面会自动继续（5 分钟内有效）。'); }
  if (s.state === 'failed') say('登录没有完成：' + (s.reason || '未知原因') + '。可以重试。');
  if (s.state === 'cancelled') say('已取消登录。');
  if (s.state === 'succeeded') say(s.ready ? '登录成功，正在打开 Cindy……' : '登录成功，正在重新启动 Cindy……');
  if (s.state === 'succeeded' && s.ready) { clearInterval(timer); location.href = base + '/'; }
  if (['idle', 'failed', 'cancelled'].includes(s.state)) clearInterval(timer);
}
function poll() { clearInterval(timer); timer = setInterval(() => call('/status', 'GET').then(render).catch(() => {}), 1500); }
$('go').onclick = () => call('/start', 'POST').then(s => { render(s); poll(); });
$('cancel').onclick = () => call('/cancel', 'POST').then(render);
call('/status', 'GET').then(s => { render(s); if (!['idle', 'failed', 'cancelled'].includes(s.state)) poll(); });
</script>`, '<style>button,a{font:inherit}button{padding:.4rem 1rem}</style>');
}

export const UNAVAILABLE_PAGE = page('Cindy 暂不可用',
  '<h1>Cindy 正在启动或暂时不可用</h1><p>页面会每隔几秒自动重试。</p><p>如果长时间没有恢复，请在应用中心重新启动 Cindy，或查看应用日志。</p>',
  '<meta http-equiv="refresh" content="5">');
