// Test helpers: a fake Cindy Host and a gateway-shaped client.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const GATEWAY_HEADERS = {
  host: '192.0.2.10',
  'x-forwarded-proto': 'http',
  'x-trim-userid': '1000',
  'x-trim-username': 'admin',
  'x-trim-isadmin': 'true',
};

export function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cfa-'));
}

/** Mimics the Cindy Host rules the adapter depends on. */
export async function startFakeHost({ token, sseIntervalMs = 200, sseEvents = 5, account }) {
  // `account` (e.g. { authenticated: false }) is reported by /health when set.
  const fake = { token, stopping: false, seen: [], account };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    fake.seen.push({ method: req.method, path: url.pathname, headers: req.headers });
    if (fake.stopping) { json(res, 503, { error: 'host_stopping' }); return; }
    res.setHeader('x-frame-options', 'DENY');
    let loopback = false;
    try {
      const host = new URL(`http://${req.headers.host}`);
      loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)
        && (!req.headers.origin || req.headers.origin === host.origin);
    } catch {}
    if (!loopback) { json(res, 403, { error: 'origin_not_allowed' }); return; }
    if (url.pathname === '/health') { json(res, 200, { status: 'ok', ...(fake.account ? { account: fake.account } : {}) }); return; }
    if (req.headers.authorization !== `Bearer ${fake.token}`) { json(res, 401, { error: 'unauthorized' }); return; }

    if (req.method === 'GET' && url.pathname === '/') {
      const html = '<!doctype html><html><head><script>window.__cindyBoot={};</script><script src="/shim.js"></script><title>Cindy</title></head><body></body></html>';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html), 'set-cookie': 'cindy_host_web=x; Path=/' });
      res.end(html);
      return;
    }
    if (url.pathname === '/assets/app.js') {
      res.writeHead(200, { 'content-type': 'text/javascript', 'set-cookie': 'a=b; Path=/' });
      res.end('console.log(1)');
      return;
    }
    if (url.pathname === '/assets/moved.js') {
      res.writeHead(302, { location: '/assets/app.js' });
      res.end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' });
      res.write(': connected\n\n');
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        res.write(`id: ${n}\ndata: {"n":${n}}\n\n`);
        if (n >= sseEvents) { clearInterval(timer); res.end(); }
      }, sseIntervalMs);
      req.on('close', () => clearInterval(timer));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/echo') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      json(res, 200, { body: Buffer.concat(chunks).toString('utf8'), headers: req.headers });
      return;
    }
    json(res, 404, { error: 'not_found' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fake.server = server;
  fake.port = server.address().port;
  fake.close = () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  return fake;
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

/** Sends a request through the adapter's Unix socket, gateway-style by default. */
export function request(socketPath, { method = 'GET', path: p, headers = {}, body, gateway = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, method, path: p, headers: { ...(gateway ? GATEWAY_HEADERS : {}), ...headers } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}
