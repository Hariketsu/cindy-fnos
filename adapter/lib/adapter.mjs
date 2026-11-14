// fnOS gateway (Unix socket, /app/cindy/...) -> Cindy Host (loopback HTTP).
import fs from 'node:fs';
import http from 'node:http';
import { matchRoute } from './routes.mjs';
import { readBrandImage } from './brand.mjs';
import { createLogin } from './login.mjs';
import { FORBIDDEN_PAGE, UNAVAILABLE_PAGE, loginPage } from './pages.mjs';
import { createUpstream } from './upstream.mjs';

// Hook for P2: prefix-relative script URLs injected into index.html right after
// the Cindy shim (e.g. '/fnos-bridge.js', which the adapter will serve itself).
export const EXTRA_SCRIPTS = [];

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'proxy-authorization', 'proxy-authenticate']);
// Client headers never forwarded: the adapter sets Host and Authorization itself,
// Origin is checked here and dropped, cookies/instance pins belong to other clients.
const CLIENT_DROP = new Set([...HOP_BY_HOP, 'host', 'origin', 'cookie', 'authorization',
  'x-cindy-host-instance', 'forwarded', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-real-ip']);
const FRAME_HEADERS = { 'x-frame-options': 'SAMEORIGIN' };
const FRAME_ANCESTORS = "frame-ancestors 'self'";
const MAX_BUFFERED = 8 * 1024 * 1024;

export function normalizePrefix(prefix = '/app/cindy') {
  return `/${prefix}`.replace(/\/+/g, '/').replace(/\/$/, '');
}

export function stripPrefix(pathname, prefix) {
  if (!prefix) return pathname;
  if (pathname === prefix) return '/';
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}

function connectionTokens(headers) {
  return new Set(String(headers.connection ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean));
}

function forwardHeaders(req) {
  const named = connectionTokens(req.headers);
  const out = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (CLIENT_DROP.has(name) || named.has(name) || name.startsWith('x-trim-')) continue;
    out[name] = value;
  }
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && /^[\w.:, -]{1,200}$/.test(xff)) out['x-forwarded-for'] = xff;
  out['x-forwarded-proto'] = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return out;
}

/** CSRF guard that replaces the Host's Origin check: Origin must be the NAS itself. */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    const o = new URL(origin);
    const h = new URL(`http://${req.headers.host}`);
    // The gateway sends Host without the port, so only the hostname can be compared.
    return (o.protocol === 'http:' || o.protocol === 'https:') && o.hostname === h.hostname;
  } catch { return false; }
}

function cleanUser(value) {
  return typeof value === 'string' ? value.replace(/[^\p{L}\p{N}._@-]/gu, '').slice(0, 64) || '-' : '-';
}

function wantsHtml(req) {
  return String(req.headers.accept ?? '').includes('text/html');
}

function sendBody(res, status, contentType, body, extra = {}) {
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': FRAME_ANCESTORS,
    ...FRAME_HEADERS,
    ...extra,
  });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

const sendJson = (res, status, value) => sendBody(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
const sendHtml = (res, status, html, extra) => sendBody(res, status, 'text/html; charset=utf-8', html, extra);
const redirect = (res, location) => sendBody(res, 302, 'text/plain; charset=utf-8', '', { location });

function sendUnavailable(req, res) {
  if (wantsHtml(req)) sendHtml(res, 503, UNAVAILABLE_PAGE, { 'retry-after': '5' });
  else sendBody(res, 503, 'application/json; charset=utf-8', JSON.stringify({ error: 'host_unavailable' }), { 'retry-after': '5' });
}

function readAll(stream, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { stream.destroy(); reject(new Error('too_large')); return; }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    stream.on('aborted', () => reject(new Error('aborted')));
  });
}

export function injectIndex(html, prefix, extraScripts = EXTRA_SCRIPTS) {
  const base = `<script>window.__CINDY_BASE__=${JSON.stringify(prefix).replace(/</g, '\\u003c')};</script>`;
  const extra = extraScripts.map(src => `<script src="${prefix}${src}"></script>`).join('');
  return html.replace('<script src="/shim.js"></script>', `${base}<script src="${prefix}/shim.js"></script>${extra}`);
}

export function createAdapter(config) {
  const prefix = normalizePrefix(config.prefix);
  const log = config.log === false ? () => {} : (config.logger ?? (line => console.log(line)));
  const warn = config.warn ?? (line => console.error(`[cindy-fnos-adapter] ${line}`));
  const upstream = createUpstream({ dataDir: config.dataDir, port: config.hostPort, warn });
  // The Host restarts on a new port after a sign-in, so drop the cached endpoint.
  const login = createLogin({ command: config.loginCommand, spawn: config.spawn, warn, onExit: () => upstream.invalidate() });
  const loginMethods = config.loginMethods?.length ? config.loginMethods : ['wechat'];
  const loginPath = `${prefix}/_fnos/login`;

  /** The Host's /health, or null when it cannot be read right now. */
  async function hostHealth() {
    const endpoint = await upstream.endpoint();
    const token = endpoint && await upstream.token();
    if (!endpoint || !token) return null;
    return new Promise(resolve => {
      const upReq = http.get({
        host: endpoint.hostname, port: endpoint.port, path: '/health', agent: false, timeout: 3000,
        headers: { host: endpoint.host, authorization: `Bearer ${token}` },
      }, upRes => {
        readAll(upRes, 64 * 1024).then(body => {
          try { resolve(upRes.statusCode === 200 ? JSON.parse(body.toString('utf8')) : null); } catch { resolve(null); }
        }, () => resolve(null));
      });
      upReq.on('timeout', () => upReq.destroy());
      upReq.on('error', () => { upstream.invalidate(); resolve(null); });
    });
  }

  /** Send the browser to the sign-in page instead of the Cindy UI? */
  async function needsLogin() {
    if (!login.available) return false;
    if (['starting', 'waiting'].includes(login.status().state)) return true;
    return (await hostHealth())?.account?.authenticated === false;
  }

  async function handleLogin(req, res, pathname, search) {
    const action = pathname.slice('/_fnos/login'.length);
    const read = req.method === 'GET' || req.method === 'HEAD';
    if (!login.available) { sendJson(res, 404, { error: 'not_found' }); return; }
    if (action === '' && read) { sendHtml(res, 200, loginPage(prefix, loginMethods)); return; }
    if (action === '/status' && read) {
      const status = login.status();
      if (status.state === 'succeeded') status.ready = (await hostHealth())?.account?.authenticated === true;
      sendJson(res, 200, status);
      return;
    }
    if (action === '/start' && req.method === 'POST') {
      const method = search.get('method');
      if (!loginMethods.includes(method)) { sendJson(res, 400, { error: 'unsupported_method' }); return; }
      sendJson(res, 202, login.start(method));
      return;
    }
    if (action === '/cancel' && req.method === 'POST') { sendJson(res, 202, login.cancel()); return; }
    sendJson(res, 404, { error: 'not_found' });
  }

  function responseHeaders(upRes, endpoint) {
    const named = connectionTokens(upRes.headers);
    const out = {};
    for (const [name, value] of Object.entries(upRes.headers)) {
      if (HOP_BY_HOP.has(name) || named.has(name) || name === 'set-cookie' || name === 'x-frame-options') continue;
      out[name] = value;
    }
    const csp = String(out['content-security-policy'] ?? '').split(';').map(s => s.trim())
      .filter(d => d && !/^frame-ancestors\b/i.test(d));
    out['content-security-policy'] = [...csp, FRAME_ANCESTORS].join('; ');
    if (typeof out.location === 'string') out.location = rewriteLocation(out.location, endpoint);
    return { ...out, ...FRAME_HEADERS };
  }

  function rewriteLocation(location, endpoint) {
    if (location === prefix || location.startsWith(`${prefix}/`)) return location;
    if (location.startsWith('/') && !location.startsWith('//')) return prefix + location;
    try {
      const url = new URL(location);
      if (url.origin === endpoint.origin) return prefix + url.pathname + url.search + url.hash;
    } catch {}
    return location;
  }

  /** One attempt; resolves with the upstream response or rejects with the connect error. */
  function attempt(req, res, endpoint, token, target) {
    return new Promise((resolve, reject) => {
      const state = { bodyStarted: false };
      const upReq = http.request({
        host: endpoint.hostname, port: endpoint.port, method: req.method, path: target, agent: false,
        headers: { ...forwardHeaders(req), host: endpoint.host, authorization: `Bearer ${token}` },
      });
      const onClientGone = () => { if (!res.writableFinished) upReq.destroy(); };
      res.on('close', onClientGone);
      upReq.on('error', error => { error.bodyStarted = state.bodyStarted; reject(error); });
      upReq.on('response', upRes => resolve({ upReq, upRes, state, detach: () => res.off('close', onClientGone) }));
      if (req.method === 'GET' || req.method === 'HEAD') { upReq.end(); return; }
      // Send the body only once connected, so a refused connection can be retried.
      upReq.on('socket', socket => {
        const start = () => { state.bodyStarted = true; req.pipe(upReq); };
        if (socket.connecting) socket.once('connect', start); else start();
      });
    });
  }

  async function proxy(req, res, route, target) {
    const bodyless = req.method === 'GET' || req.method === 'HEAD';
    let refused = false;
    let tokenRetried = false;
    for (;;) {
      const endpoint = await upstream.endpoint();
      const token = endpoint && await upstream.token();
      if (!endpoint || !token) { sendUnavailable(req, res); return; }
      let result;
      try {
        result = await attempt(req, res, endpoint, token, target);
      } catch (error) {
        if (res.destroyed) return;
        if (error.code === 'ECONNREFUSED') {
          upstream.invalidate();
          if (!refused && !error.bodyStarted) { refused = true; continue; }
        }
        sendUnavailable(req, res);
        return;
      }
      const { upReq, upRes, detach } = result;

      if (upRes.statusCode === 401) {
        const changed = await upstream.refreshToken();
        if (changed && bodyless && !tokenRetried) {
          tokenRetried = true;
          detach();
          upRes.resume();
          continue;
        }
      }

      if (upRes.statusCode === 503 || route.kind === 'index') {
        await finishBuffered(req, res, route, upReq, upRes, endpoint);
        return;
      }

      res.writeHead(upRes.statusCode, upRes.statusMessage, responseHeaders(upRes, endpoint));
      if (route.kind === 'stream') {
        res.flushHeaders();
        req.socket.setNoDelay(true);
        upReq.socket?.setNoDelay(true);
      }
      upRes.on('error', () => res.destroy());
      upRes.on('aborted', () => res.destroy());
      upRes.pipe(res);
      return;
    }
  }

  /** Small responses that may need rewriting: index.html and 503 host_stopping. */
  async function finishBuffered(req, res, route, upReq, upRes, endpoint) {
    const isHtml = /^text\/html\b/i.test(String(upRes.headers['content-type'] ?? ''));
    const inject = route.kind === 'index' && req.method === 'GET' && upRes.statusCode === 200
      && isHtml && !upRes.headers['content-encoding'];
    if (!inject && upRes.statusCode !== 503) {
      res.writeHead(upRes.statusCode, upRes.statusMessage, responseHeaders(upRes, endpoint));
      upRes.pipe(res);
      return;
    }
    let body;
    try { body = await readAll(upRes, MAX_BUFFERED); }
    catch { upReq.destroy(); res.destroy(); return; }
    if (upRes.statusCode === 503) {
      let stopping = false;
      try { stopping = JSON.parse(body.toString('utf8'))?.error === 'host_stopping'; } catch {}
      if (stopping) { sendUnavailable(req, res); return; }
    }
    if (inject) body = Buffer.from(injectIndex(body.toString('utf8'), prefix), 'utf8');
    const headers = responseHeaders(upRes, endpoint);
    delete headers['content-length'];
    res.writeHead(upRes.statusCode, upRes.statusMessage, { ...headers, 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function handle(req, res) {
    const started = performance.now();
    const user = cleanUser(req.headers['x-trim-username']);
    let logPath = '-';
    res.on('close', () => {
      const ms = Math.round(performance.now() - started);
      log(`${new Date().toISOString()} ${req.method} ${logPath} ${res.statusCode}${res.writableFinished ? '' : ' aborted'} ${ms}ms user=${user}`);
    });

    let url;
    if (req.url?.startsWith('/') && !req.url.startsWith('//')) {
      try { url = new URL(req.url, 'http://adapter.invalid'); } catch {}
    }
    if (!url) { sendJson(res, 400, { error: 'bad_request' }); return; }
    const pathname = stripPrefix(url.pathname, prefix);
    logPath = pathname;

    if (!req.headers['x-trim-userid'] || req.headers['x-trim-isadmin'] !== 'true') {
      sendHtml(res, 403, FORBIDDEN_PAGE);
      return;
    }
    if (!originAllowed(req)) { sendJson(res, 403, { error: 'origin_not_allowed' }); return; }
    if (pathname.startsWith('/_fnos/brand/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const image = await readBrandImage(config.brandDir, pathname.slice('/_fnos/brand/'.length).replace(/\.png$/, ''));
      if (image) sendBody(res, 200, 'image/png', image, { 'cache-control': 'public, max-age=86400' });
      else sendJson(res, 404, { error: 'not_found' });
      return;
    }
    if (pathname === '/_fnos/login' || pathname.startsWith('/_fnos/login/')) { await handleLogin(req, res, pathname, url.searchParams); return; }
    // The web client goes to /connect after signing out; on fnOS that is the sign-in page.
    if (login.available && pathname === '/connect' && (req.method === 'GET' || req.method === 'HEAD')) { redirect(res, loginPath); return; }
    const route = matchRoute(req.method, pathname);
    if (!route) { sendJson(res, 404, { error: 'not_found' }); return; }
    if (route.kind === 'index' && await needsLogin()) { redirect(res, loginPath); return; }
    await proxy(req, res, route, pathname + url.search);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => { if (!res.headersSent) sendUnavailable(req, res); else res.destroy(); });
  });
  // The Host's only WebSocket is for native clients; browsers never get one.
  server.on('upgrade', (req, socket) => {
    socket.on('error', () => {});
    const body = '{"error":"not_found"}';
    socket.end(`HTTP/1.1 404 Not Found\r\ncontent-type: application/json\r\ncontent-length: ${body.length}\r\nconnection: close\r\n\r\n${body}`);
    let logPath = '-';
    try { logPath = stripPrefix(new URL(req.url, 'http://adapter.invalid').pathname, prefix); } catch {}
    log(`${new Date().toISOString()} UPGRADE ${logPath} 404 0ms user=${cleanUser(req.headers['x-trim-username'])}`);
  });

  return {
    server,
    prefix,
    listen() {
      const socketPath = config.socketPath;
      try {
        if (fs.lstatSync(socketPath).isSocket()) fs.unlinkSync(socketPath);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, () => { server.off('error', reject); resolve(); });
      });
    },
    /** Stops accepting, lets in-flight requests finish for `graceMs`, then cuts the rest (SSE). */
    close(graceMs = 500) {
      return new Promise(resolve => {
        server.close(() => {
          try { fs.unlinkSync(config.socketPath); } catch {}
          resolve();
        });
        server.closeIdleConnections();
        setTimeout(() => server.closeAllConnections(), graceMs).unref();
      });
    },
  };
}
