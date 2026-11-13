// Client-side checks: how the page is embedded, how paths and headers behave
// through the gateway, SSE timing, and which JS SDK calls work. Results are
// shown on the page and POSTed to the backend, which saves them as JSON.
const BASE = '/app/cindyprobe/';
const tag = new URLSearchParams(location.search).get('entry') || 'main';
const out = document.getElementById('out');
const report = { tag, startedAt: new Date().toISOString(), checks: {} };

const show = () => { out.textContent = JSON.stringify(report, null, 2); };
const record = (name, value) => { report.checks[name] = value; show(); };
const errText = e => (e && (e.stack || e.message)) ? String(e.message || e) : String(e);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`timeout ${ms}ms`)), ms))]);

async function save(name = tag) {
  try {
    const res = await fetch(BASE + 'api/report', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...report, tag: name, savedAt: new Date().toISOString() }) });
    return (await res.json()).saved;
  } catch (e) { return `save failed: ${errText(e)}`; }
}

function embedding() {
  const r = { href: location.href, origin: location.origin, pathname: location.pathname, search: location.search,
    referrer: document.referrer, isSecureContext: window.isSecureContext,
    randomUUID: typeof crypto?.randomUUID === 'function', clipboard: !!navigator.clipboard?.writeText,
    inIframe: window.top !== window, userAgent: navigator.userAgent };
  try { r.topHref = window.top.location.href; r.sameOriginWithTop = true; } catch (e) { r.sameOriginWithTop = false; r.topError = errText(e); }
  try {
    const f = window.frameElement;
    r.frameElement = f ? Object.fromEntries([...f.attributes].map(a => [a.name, a.value.length > 300 ? a.value.slice(0, 300) + '…' : a.value])) : null;
  } catch (e) { r.frameElement = `inaccessible: ${errText(e)}`; }
  try { localStorage.setItem('probe', '1'); r.localStorage = localStorage.getItem('probe') === '1'; } catch (e) { r.localStorage = errText(e); }
  r.cookieNames = document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean);
  r.broadcastChannel = typeof BroadcastChannel !== 'undefined';
  return r;
}

async function fetchCheck(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
    return { status: res.status, finalUrl: res.url, redirected: res.redirected, body };
  } catch (e) { return { error: errText(e) }; }
}

async function headerCheck() {
  try {
    const res = await fetch(BASE + 'api/headers', { cache: 'no-store' });
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()),
      cookieNamesAfter: document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean) };
  } catch (e) { return { error: errText(e) }; }
}

function sseCheck(path, maxMs) {
  return new Promise(resolve => {
    const t0 = Date.now(); const events = []; let opened = null;
    const es = new EventSource(BASE + path);
    const finish = why => { es.close(); resolve({ why, openedAfterMs: opened, events }); };
    es.onopen = () => { opened = Date.now() - t0; };
    es.onmessage = ev => { const d = JSON.parse(ev.data); events.push({ seq: d.seq, clientAfterMs: Date.now() - t0, lagMs: Date.now() - d.server_ms }); };
    es.addEventListener('done', () => finish('done'));
    es.onerror = () => finish(`error (readyState ${es.readyState})`);
    setTimeout(() => finish('client timeout'), maxMs);
  });
}

async function sdkChecks() {
  const r = {};
  let sdk;
  try {
    const { TrimApp } = await import(BASE + 'sdk.js');
    sdk = new TrimApp();
    r.isWeb = sdk.isWeb; r.isStandaloneWeb = sdk.isStandaloneWeb;
  } catch (e) { r.load = errText(e); return { r, sdk: null }; }
  const call = async (name, fn) => { try { r[name] = await withTimeout(fn(), 8000); } catch (e) { r[name] = `ERR ${errText(e)}`; } };
  await call('ready', () => sdk.ready().then(() => 'ok'));
  await call('getPlatformConfig', () => sdk.getPlatformConfig());
  await call('getHostCapabilities', () => sdk.getHostCapabilities());
  await call('getHostSnapshot', () => sdk.getHostSnapshot());
  await call('setTitle', () => sdk.setTitle('Cindy Probe ✓').then(() => 'ok'));
  // Never record the secret itself: only whether the call works.
  await call('getSessionCredentials', () => sdk.getSessionCredentials().then(x =>
    ({ code: x?.code, error: x?.error, msg: x?.msg, hasSecret: !!x?.data?.secret })));
  return { r, sdk };
}

function wireButtons(sdk) {
  const action = (id, name, fn) => document.getElementById(id).addEventListener('click', async () => {
    try { record(name, await withTimeout(fn(), 120000)); } catch (e) { record(name, `ERR ${errText(e)}`); }
    record(`${name}:saved`, await save(`${tag}-${name}`));
  });
  action('pick-shared', 'pickSharedFile', () => sdk.pickSharedFile({}));
  action('pick-user', 'pickUserFile', () => sdk.pickUserFile({ directory: true }));
  action('open-fm', 'openFileManager', () => sdk.openFileManager('/vol1'));
  action('sse-idle', 'sseIdle70s', () => sseCheck('api/sse-idle?seconds=70', 100000));
}

(async () => {
  record('embedding', embedding());
  record('fetch', {
    absolutePrefixed: await fetchCheck(BASE + 'api/echo'),
    relative: await fetchCheck('api/echo'),
    rootUnprefixed: await fetchCheck('/api/echo'),
    noTrailingSlash: await fetchCheck('/app/cindyprobe'),
  });
  record('responseHeaders', await headerCheck());
  record('sse', await sseCheck('api/sse', 20000));
  record('backend', (await fetchCheck(BASE + 'api/backend')).body);
  const { r, sdk } = await sdkChecks();
  record('sdk', r);
  if (sdk) wireButtons(sdk);
  record('saved', await save());
  document.getElementById('status').textContent = 'done';
})();
