// Self-contained pages the adapter serves itself (no external resources).

const page = (title, body, head = '') => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">${head}<title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:15px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .75rem}p{margin:.25rem 0;opacity:.8}</style>
</head><body><main>${body}</main></body></html>`;

export const FORBIDDEN_PAGE = page('无法使用 Cindy',
  '<h1>仅飞牛管理员可以使用 Cindy</h1><p>当前账号没有管理员权限。</p><p>请使用管理员账号登录飞牛后再打开 Cindy。</p>');

// Sign-in methods `cindy-host login` supports, with the wording the page uses.
const METHODS = {
  wechat: { button: '使用微信登录', open: '打开微信登录页', hint: '在新打开的页面用手机微信扫码或确认' },
  google: { button: '使用 Google 登录', open: '打开 Google 登录页', hint: '在新打开的页面登录 Google 账号' },
  apple: { button: '使用 Apple 登录', open: '打开 Apple 登录页', hint: '在新打开的页面登录 Apple 账号' },
};

/**
 * Cindy sign-in page in the look of the original login screen (artwork from
 * /_fnos/brand/, light and dark following the system). `prefix` is the gateway
 * prefix (e.g. /app/cindy); `methods` are keys of METHODS.
 */
export function loginPage(prefix, methods = ['wechat']) {
  const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const known = methods.filter(m => METHODS[m]);
  const img = name => `${prefix}/_fnos/brand/${name}.png`;
  const buttons = known.map((m, i) => `<button type="button" class="${i ? 'secondary' : 'primary'}" data-method="${m}">${METHODS[m].button}</button>`).join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>登录 Cindy</title>
<style>
:root{--bg:#f2f2ee;--card:#fbfbf8;--line:#e6e5df;--text:#1d1d1b;--muted:#6b6b66;--btn:#1d1d1b;--btn-text:#fff;--btn2:#ecebe6}
@media (prefers-color-scheme:dark){:root{--bg:#131515;--card:#1a1b1d;--line:#26282a;--text:#ececea;--muted:#8d8f91;--btn:#ececea;--btn-text:#131515;--btn2:#232527}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;background:var(--bg);color:var(--text);
  font:14px/1.5 -apple-system,BlinkMacSystemFont,"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif}
.hero{position:relative;width:min(400px,80vw,46vh);margin-top:2vh}
.hero .art{display:block;width:100%;-webkit-mask-image:linear-gradient(#000 72%,transparent);mask-image:linear-gradient(#000 72%,transparent)}
.hero .wordmark{position:absolute;left:50%;bottom:6%;width:46%;transform:translateX(-50%)}
.hero .slogan{position:absolute;left:84%;top:52%;width:52%}
.dark{display:none}
@media (prefers-color-scheme:dark){.light{display:none}.dark{display:block}}
.card{width:min(380px,90vw);margin-top:-4px;padding:24px 28px 26px;border:1px solid var(--line);border-radius:20px;background:var(--card);text-align:center}
h1{margin:0;font-size:20px;font-weight:600}
.sub{margin:4px 0 16px;color:var(--muted);font-size:13px}
#msg{margin:0 0 12px;color:var(--muted);font-size:13px}
#msg:empty{display:none}
button,.open{display:block;width:100%;height:44px;margin:10px 0 0;border:0;border-radius:999px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;line-height:44px}
.primary,.open{background:var(--btn);color:var(--btn-text)}
.secondary,#cancel{background:var(--btn2);color:var(--text)}
button:disabled{opacity:.5;cursor:default}
[hidden]{display:none!important}
footer{margin:auto 0 16px;padding-top:16px;color:var(--muted);font-size:12px}
</style></head><body>
<div class="hero" aria-hidden="true">
<img class="art" src="${img('hero@2x')}" alt="">
<img class="wordmark light" src="${img('wordmark@2x')}" alt=""><img class="wordmark dark" src="${img('wordmark-dark@2x')}" alt="">
<img class="slogan light" src="${img('slogan@2x')}" alt=""><img class="slogan dark" src="${img('slogan-dark@2x')}" alt="">
</div>
<main class="card">
<h1>欢迎使用 Cindy</h1>
<p class="sub">登录 Cindy 账号后即可在 NAS 上使用</p>
<p id="msg" aria-live="polite"></p>
<div id="methods">${buttons}</div>
<a id="open" class="open" hidden target="_blank" rel="noopener noreferrer"></a>
<button id="cancel" type="button" hidden>取消</button>
</main>
<footer>登录期间 Cindy 服务会短暂暂停，完成后自动恢复</footer>
<script>
const base = ${json(prefix)};
const METHODS = ${json(Object.fromEntries(known.map(m => [m, METHODS[m]])))};
const $ = id => document.getElementById(id);
const say = text => { $('msg').textContent = text; };
let timer, method = ${json(known[0])};
async function call(path, verb) {
  const res = await fetch(base + '/_fnos/login' + path, { method: verb, headers: { accept: 'application/json' } });
  return res.json();
}
function render(s) {
  const idle = ['idle', 'failed', 'cancelled'].includes(s.state);
  $('methods').hidden = !idle;
  $('cancel').hidden = !['starting', 'waiting'].includes(s.state);
  $('open').hidden = s.state !== 'waiting';
  if (s.method && METHODS[s.method]) method = s.method;
  const m = METHODS[method];
  if (s.state === 'idle') say('');
  if (s.state === 'starting') say('正在准备登录……');
  if (s.state === 'waiting') { $('open').href = s.url; $('open').textContent = m.open; say(m.hint + '，完成后回到这里，页面会自动继续（5 分钟内有效）。'); }
  // Upstream \`cindy-host login\` only accepts a direct sign-in; an account that still has to bind a
  // phone number or pick one of several accounts ends with this message.
  if (s.state === 'failed' && /no refresh token/.test(s.reason || '')) say('授权成功，但这个账号还需要先完成设置（例如绑定手机号或选择账号），NAS 上暂时无法完成这一步。请先在 Cindy 桌面版用同样的方式登录一次并按提示完成，然后回到这里重试。');
  else if (s.state === 'failed') say('登录没有完成：' + (s.reason || '未知原因') + '。可以重试。');
  if (s.state === 'cancelled') say('已取消登录。');
  if (s.state === 'succeeded') say(s.ready ? '登录成功，正在打开 Cindy……' : '登录成功，正在启动 Cindy……');
  if (s.state === 'succeeded' && s.ready) { clearInterval(timer); location.href = base + '/'; }
  if (idle) clearInterval(timer);
}
function poll() { clearInterval(timer); timer = setInterval(() => call('/status', 'GET').then(render).catch(() => {}), 1500); }
for (const b of document.querySelectorAll('[data-method]')) {
  b.onclick = () => { method = b.dataset.method; call('/start?method=' + encodeURIComponent(method), 'POST').then(s => { render(s); poll(); }); };
}
$('cancel').onclick = () => call('/cancel', 'POST').then(render);
call('/status', 'GET').then(s => { render(s); if (!['idle', 'failed', 'cancelled'].includes(s.state)) poll(); });
</script></body></html>`;
}

export const UNAVAILABLE_PAGE = page('Cindy 暂不可用',
  '<h1>Cindy 正在启动或暂时不可用</h1><p>页面会每隔几秒自动重试。</p><p>如果长时间没有恢复，请在应用中心重新启动 Cindy，或查看应用日志。</p>',
  '<meta http-equiv="refresh" content="5">');
