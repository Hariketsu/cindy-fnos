import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createAdapter } from '../lib/adapter.mjs';
import { request, startFakeHost, tempDir, GATEWAY_HEADERS } from './helpers.mjs';

const PREFIX = '/app/cindy';

async function startAdapter(options) {
  const dir = tempDir();
  const socketPath = path.join(dir, 'app.sock');
  const adapter = createAdapter({ socketPath, prefix: PREFIX, log: false, warn: () => {}, ...options });
  await adapter.listen();
  return { adapter, socketPath, close: () => adapter.close(0) };
}

describe('adapter with a fixed Host port', () => {
  let host, ctx, dataDir;
  before(async () => {
    dataDir = tempDir();
    fs.writeFileSync(path.join(dataDir, 'host-api-token'), 'token-1\n', { mode: 0o600 });
    host = await startFakeHost({ token: 'token-1' });
    ctx = await startAdapter({ dataDir, hostPort: host.port });
  });
  after(async () => { await ctx.close(); await host.close(); });

  const seenPaths = () => host.seen.map(s => s.path);

  test('strips the prefix with and without trailing slash, and accepts unprefixed paths', async () => {
    for (const p of [`${PREFIX}/health`, '/health']) {
      const res = await request(ctx.socketPath, { path: p });
      assert.equal(res.status, 200, p);
    }
    host.seen.length = 0;
    for (const p of [PREFIX, `${PREFIX}/`, '/']) {
      const res = await request(ctx.socketPath, { path: p });
      assert.equal(res.status, 200, p);
    }
    assert.deepEqual(seenPaths(), ['/', '/', '/']);
  });

  test('non-admin gets the 403 page and nothing reaches the Host', async () => {
    host.seen.length = 0;
    const res = await request(ctx.socketPath, { path: `${PREFIX}/`, headers: { 'x-trim-isadmin': 'false' } });
    assert.equal(res.status, 403);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /仅飞牛管理员可以使用 Cindy/);
    assert.equal(host.seen.length, 0);
  });

  test('missing X-Trim-Userid gets 403', async () => {
    const { 'x-trim-userid': _, ...headers } = GATEWAY_HEADERS;
    const res = await request(ctx.socketPath, { path: `${PREFIX}/`, headers, gateway: false });
    assert.equal(res.status, 403);
  });

  test('gateway-shaped POST is accepted by the Host with rewritten Host/Origin and bearer', async () => {
    host.seen.length = 0;
    const res = await request(ctx.socketPath, {
      method: 'POST', path: `${PREFIX}/api/echo`, body: '{"x":1}',
      headers: { origin: 'http://192.0.2.10:5666', 'content-type': 'application/json', cookie: 'language=zh', authorization: 'Bearer evil', 'x-cindy-host-instance': 'i' },
    });
    assert.equal(res.status, 200, res.body);
    const echo = JSON.parse(res.body);
    assert.equal(echo.body, '{"x":1}');
    assert.equal(echo.headers.host, `127.0.0.1:${host.port}`);
    assert.equal(echo.headers.origin, undefined);
    assert.equal(echo.headers.cookie, undefined);
    assert.equal(echo.headers['x-cindy-host-instance'], undefined);
    assert.equal(echo.headers['x-forwarded-proto'], 'http');
    assert.ok(!Object.keys(echo.headers).some(h => h.startsWith('x-trim-')));
    assert.equal(echo.headers.authorization, 'Bearer token-1');
  });

  test('cross-origin POST is rejected before the Host', async () => {
    host.seen.length = 0;
    const res = await request(ctx.socketPath, { method: 'POST', path: `${PREFIX}/api/echo`, body: '{}', headers: { origin: 'http://evil.example' } });
    assert.equal(res.status, 403);
    assert.equal(host.seen.length, 0);
  });

  test('denied routes never reach the Host', async () => {
    host.seen.length = 0;
    const cases = [
      ['POST', `${PREFIX}/control/stop`], ['POST', `${PREFIX}/web/pair`], ['POST', `${PREFIX}/web/session`],
      ['GET', `${PREFIX}/connect`], ['GET', `${PREFIX}/connect.js`], ['POST', `${PREFIX}/logout`],
      ['GET', `${PREFIX}/sessions`], ['GET', `${PREFIX}/me`], ['GET', `${PREFIX}/plugins`],
      ['GET', `${PREFIX}/../control/stop`], ['GET', `${PREFIX}/%2e%2e/control/stop`], ['DELETE', `${PREFIX}/api/x`],
      ['GET', `${PREFIX}/api/x`], ['GET', '/control/platform/socket'],
    ];
    for (const [method, p] of cases) {
      const res = await request(ctx.socketPath, { method, path: p });
      assert.equal(res.status, 404, `${method} ${p}`);
    }
    assert.equal(host.seen.length, 0);
  });

  test('WebSocket upgrades are rejected without reaching the Host', async () => {
    host.seen.length = 0;
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ socketPath: ctx.socketPath, path: `${PREFIX}/control/platform/socket`,
        headers: { ...GATEWAY_HEADERS, connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' } });
      req.on('response', res => { res.resume(); resolve(res.statusCode); });
      req.on('upgrade', () => resolve(101));
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 404);
    assert.equal(host.seen.length, 0);
  });

  test('replaces XFO/CSP, strips Set-Cookie, keeps redirects under the prefix', async () => {
    const res = await request(ctx.socketPath, { path: `${PREFIX}/assets/app.js` });
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(res.headers['content-security-policy'], "frame-ancestors 'self'");
    assert.equal(res.headers['set-cookie'], undefined);
    const moved = await request(ctx.socketPath, { path: `${PREFIX}/assets/moved.js` });
    assert.equal(moved.status, 302);
    assert.equal(moved.headers.location, `${PREFIX}/assets/app.js`);
  });

  test('injects base and prefixed shim into index.html', async () => {
    const res = await request(ctx.socketPath, { path: `${PREFIX}/`, headers: { accept: 'text/html' } });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes(`<script>window.__CINDY_BASE__="${PREFIX}";</script><script src="${PREFIX}/shim.js"></script>`), res.body);
    assert.ok(!res.body.includes('src="/shim.js"'));
    assert.equal(Number(res.headers['content-length']), Buffer.byteLength(res.body));
    assert.equal(res.headers['set-cookie'], undefined);
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  });

  test('SSE events arrive incrementally', async () => {
    const start = Date.now();
    const times = await new Promise((resolve, reject) => {
      const stamps = [];
      const req = http.request({ socketPath: ctx.socketPath, path: `${PREFIX}/events?protocol=2`, headers: GATEWAY_HEADERS }, res => {
        assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8');
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          buf += chunk;
          for (const _ of buf.matchAll(/^data: /gm)) stamps.push(Date.now() - start);
          buf = buf.replace(/^data: /gm, '');
        });
        res.on('end', () => resolve({ stamps, end: Date.now() - start }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(times.stamps.length, 5);
    assert.ok(times.stamps[0] < 600, `first event at ${times.stamps[0]}ms`);
    assert.ok(times.end - times.stamps[0] >= 600, `first ${times.stamps[0]}ms, end ${times.end}ms`);
  });

  test('client abort closes the upstream SSE request', async () => {
    const closed = new Promise(resolve => host.server.once('request', req => req.on('close', resolve)));
    await new Promise((resolve, reject) => {
      const req = http.request({ socketPath: ctx.socketPath, path: `${PREFIX}/events`, headers: GATEWAY_HEADERS }, res => {
        res.once('data', () => { req.destroy(); resolve(); });
      });
      req.on('error', () => {});
      req.end();
      setTimeout(() => reject(new Error('no data')), 1000);
    });
    await closed;
  });

  test('re-reads the token after a 401 and retries GET', async () => {
    host.token = 'token-2';
    fs.writeFileSync(path.join(dataDir, 'host-api-token'), 'token-2\n');
    host.seen.length = 0;
    const res = await request(ctx.socketPath, { path: `${PREFIX}/assets/app.js` });
    assert.equal(res.status, 200);
    // First attempt used the cached (stale) token and got 401; the retry used the new one.
    assert.deepEqual(host.seen.map(s => s.headers.authorization), ['Bearer token-1', 'Bearer token-2']);
  });

  test('host_stopping becomes the 503 page for navigations and JSON for API calls', async () => {
    host.stopping = true;
    try {
      const page = await request(ctx.socketPath, { path: `${PREFIX}/`, headers: { accept: 'text/html,*/*' } });
      assert.equal(page.status, 503);
      assert.match(page.body, /Cindy 正在启动或暂时不可用/);
      const api = await request(ctx.socketPath, { method: 'POST', path: `${PREFIX}/api/echo`, body: '{}', headers: { accept: 'application/json' } });
      assert.equal(api.status, 503);
      assert.deepEqual(JSON.parse(api.body), { error: 'host_unavailable' });
    } finally { host.stopping = false; }
  });
});

describe('Host down and endpoint discovery', () => {
  test('connection refused gives 503 HTML vs JSON without leaking details', async () => {
    const dataDir = tempDir();
    fs.writeFileSync(path.join(dataDir, 'host-api-token'), 'secret-token');
    const dead = await startFakeHost({ token: 'x' });
    const port = dead.port;
    await dead.close();
    const ctx = await startAdapter({ dataDir, hostPort: port });
    try {
      const page = await request(ctx.socketPath, { path: `${PREFIX}/`, headers: { accept: 'text/html' } });
      assert.equal(page.status, 503);
      assert.match(page.headers['content-type'], /text\/html/);
      const api = await request(ctx.socketPath, { method: 'POST', path: `${PREFIX}/api/x`, body: '{}' });
      assert.equal(api.status, 503);
      assert.deepEqual(JSON.parse(api.body), { error: 'host_unavailable' });
      for (const r of [page, api]) {
        assert.ok(!r.body.includes('secret-token') && !r.body.includes('ECONNREFUSED') && !r.body.includes(String(port)));
      }
    } finally { await ctx.close(); }
  });

  test('discovers the port from host-endpoint.json and re-discovers after a restart', async () => {
    const dataDir = tempDir();
    const writeEndpoint = (record) => fs.writeFileSync(path.join(dataDir, 'host-endpoint.json'), JSON.stringify(record));
    fs.writeFileSync(path.join(dataDir, 'host-api-token'), 'a');
    const ctx = await startAdapter({ dataDir });
    const first = await startFakeHost({ token: 'a' });
    try {
      // Missing file: Host unavailable.
      assert.equal((await request(ctx.socketPath, { path: `${PREFIX}/health` })).status, 503);
      // Invalid file (wrong host): still unavailable.
      writeEndpoint({ baseUrl: `http://192.0.2.1:${first.port}`, pid: 1 });
      assert.equal((await request(ctx.socketPath, { path: `${PREFIX}/health` })).status, 503);

      writeEndpoint({ baseUrl: `http://127.0.0.1:${first.port}`, pid: 100, instanceId: 'one' });
      let res = await request(ctx.socketPath, { method: 'POST', path: `${PREFIX}/api/echo`, body: '{}', headers: { origin: 'http://192.0.2.10:5666' } });
      assert.equal(res.status, 200, res.body);
      assert.equal(JSON.parse(res.body).headers.host, `127.0.0.1:${first.port}`);

      // Host restarts on a new port with a new token.
      await first.close();
      const second = await startFakeHost({ token: 'b' });
      try {
        fs.writeFileSync(path.join(dataDir, 'host-api-token'), 'b');
        writeEndpoint({ baseUrl: `http://127.0.0.1:${second.port}`, pid: 101, instanceId: 'two' });
        res = await request(ctx.socketPath, { method: 'POST', path: `${PREFIX}/api/echo`, body: '{"y":2}', headers: { origin: 'http://192.0.2.10:5666' } });
        assert.equal(res.status, 200, res.body);
        const echo = JSON.parse(res.body);
        assert.equal(echo.body, '{"y":2}');
        assert.equal(echo.headers.host, `127.0.0.1:${second.port}`);
        assert.equal(echo.headers.authorization, 'Bearer b');
      } finally { await second.close(); }
    } finally { await ctx.close(); }
  });
});
