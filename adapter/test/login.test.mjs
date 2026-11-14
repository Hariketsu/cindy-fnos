import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createAdapter } from '../lib/adapter.mjs';
import { request, startFakeHost, tempDir } from './helpers.mjs';

const PREFIX = '/app/cindy';
const LOGIN = `${PREFIX}/_fnos/login`;
const AUTHORIZE = 'https://auth.example.test/api/auth/social/wechat/authorize?client_type=desktop';
const POST = { method: 'POST', headers: { origin: 'http://192.0.2.10:5666' } };

/** A stand-in for cmd/main: `host-login` prints like `cindy-host login`, then `tail` decides the outcome. */
function fakeMain(dir, tail) {
  const file = path.join(dir, 'main');
  fs.writeFileSync(file, `#!/bin/bash
[ "$1" = host-login ] || exit 9
echo ran >> "${dir}/ran"
echo "Open the following Cindy login page on a device with a browser."
echo "(node:1) ExperimentalWarning: SQLite is an experimental feature" >&2
echo "If it does not open, visit:"
echo "${AUTHORIZE}"
${tail}
`, { mode: 0o755 });
  return file;
}

async function until(read, done, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > end) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

describe('web sign-in', () => {
  let host, dataDir, dir;
  const adapters = [];
  before(async () => {
    dataDir = tempDir();
    dir = tempDir();
    fs.writeFileSync(path.join(dataDir, 'host-api-token'), 'token-1\n', { mode: 0o600 });
    host = await startFakeHost({ token: 'token-1', account: { authenticated: false } });
  });
  after(async () => { for (const a of adapters) await a.close(0); await host.close(); });

  async function adapterWith(loginCommand, loginMethods, extra = {}) {
    const socketPath = path.join(tempDir(), 'app.sock');
    const adapter = createAdapter({ socketPath, dataDir, hostPort: host.port, prefix: PREFIX, log: false, warn: () => {}, loginCommand, loginMethods, ...extra });
    await adapter.listen();
    adapters.push(adapter);
    return socketPath;
  }
  const status = sock => request(sock, { path: `${LOGIN}/status` }).then(r => JSON.parse(r.body));

  test('the Cindy UI sends a signed-out admin to the sign-in page; a signed-in one gets the UI', async () => {
    const sock = await adapterWith(fakeMain(dir, 'exit 0'));
    const out = await request(sock, { path: `${PREFIX}/` });
    assert.equal(out.status, 302);
    assert.equal(out.headers.location, LOGIN);
    const page = await request(sock, { path: LOGIN });
    assert.equal(page.status, 200);
    assert.match(page.body, /使用微信登录/);
    // Signing out in the web client lands on /connect.
    assert.equal((await request(sock, { path: `${PREFIX}/connect` })).headers.location, LOGIN);

    host.account = { authenticated: true };
    try {
      const ui = await request(sock, { path: `${PREFIX}/` });
      assert.equal(ui.status, 200);
      assert.match(ui.body, /shim\.js/);
    } finally { host.account = { authenticated: false }; }
  });

  test('a successful sign-in shows the authorize URL, then reports ready once the Host is signed in', async () => {
    const sock = await adapterWith(fakeMain(dir, 'sleep 0.3; exit 0'));
    const started = await request(sock, { path: `${LOGIN}/start?method=wechat`, ...POST });
    assert.equal(started.status, 202);
    const waiting = await until(() => status(sock), s => s.state === 'waiting');
    assert.deepEqual(waiting, { state: 'waiting', method: 'wechat', url: AUTHORIZE });
    // While the sign-in runs (Host stopped), the UI stays on the sign-in page.
    assert.equal((await request(sock, { path: `${PREFIX}/` })).headers.location, LOGIN);

    const done = await until(() => status(sock), s => s.state === 'succeeded');
    assert.deepEqual(done, { state: 'succeeded', ready: false });
    host.account = { authenticated: true };
    try {
      assert.deepEqual(await status(sock), { state: 'succeeded', ready: true });
    } finally { host.account = { authenticated: false }; }
  });

  test('a failed sign-in reports the CLI error, not Node warnings', async () => {
    const sock = await adapterWith(fakeMain(dir, 'echo "Error: browser authorization failed: REQUEST_TIMEOUT" >&2; exit 1'));
    await request(sock, { path: `${LOGIN}/start?method=wechat`, ...POST });
    const failed = await until(() => status(sock), s => s.state === 'failed');
    assert.deepEqual(failed, { state: 'failed', reason: 'Error: browser authorization failed: REQUEST_TIMEOUT' });
  });

  test('the sign-in page explains the upstream no-refresh-token failure instead of showing it raw', async () => {
    const sock = await adapterWith(fakeMain(dir, 'echo "cindy-host login failed: authorization exchange returned no refresh token" >&2; exit 1'));
    await request(sock, { path: `${LOGIN}/start?method=wechat`, ...POST });
    const failed = await until(() => status(sock), s => s.state === 'failed');
    assert.match(failed.reason, /no refresh token/);
    const page = (await request(sock, { path: LOGIN })).body;
    assert.match(page, /Cindy 桌面版用同样的方式登录一次/);
    assert.match(page, /详细信息：/, 'the raw CLI error stays visible for support');
  });

  test('cancel stops the running sign-in, and a second start while running does not run it twice', async () => {
    const ran = path.join(dir, 'ran');
    fs.rmSync(ran, { force: true });
    const sock = await adapterWith(fakeMain(dir, "sleep 30 & trap 'kill $!; exit 130' TERM; wait"));
    await request(sock, { path: `${LOGIN}/start?method=wechat`, ...POST });
    await until(() => status(sock), s => s.state === 'waiting');
    await request(sock, { path: `${LOGIN}/start?method=wechat`, ...POST });
    await request(sock, { path: `${LOGIN}/cancel`, ...POST });
    const cancelled = await until(() => status(sock), s => s.state === 'cancelled');
    assert.deepEqual(cancelled, { state: 'cancelled' });
    assert.equal(fs.readFileSync(ran, 'utf8'), 'ran\n');
  });

  test('a sign-in starts only with a method the edition offers, and the page offers exactly those', async () => {
    const ran = path.join(dir, 'ran');
    fs.rmSync(ran, { force: true });
    const sock = await adapterWith(fakeMain(dir, `echo "$2" > "${dir}/method"; exit 0`), ['google', 'apple']);
    const page = await request(sock, { path: LOGIN });
    assert.match(page.body, /使用 Google 登录/);
    assert.match(page.body, /使用 Apple 登录/);
    assert.doesNotMatch(page.body, /使用微信登录/);
    for (const bad of ['wechat', '', 'google;id']) {
      const res = await request(sock, { path: `${LOGIN}/start?method=${encodeURIComponent(bad)}`, ...POST });
      assert.equal(res.status, 400, bad);
    }
    assert.equal(fs.existsSync(ran), false);
    await request(sock, { path: `${LOGIN}/start?method=apple`, ...POST });
    await until(() => status(sock), s => s.state === 'succeeded');
    assert.equal(fs.readFileSync(path.join(dir, 'method'), 'utf8'), 'apple\n');
  });

  test('serves only the packaged login artwork', async () => {
    const brandDir = tempDir();
    fs.writeFileSync(path.join(brandDir, 'hero@2x.png'), 'png-bytes');
    fs.writeFileSync(path.join(brandDir, 'secret.png'), 'nope');
    const sock = await adapterWith(fakeMain(dir, 'exit 0'), undefined, { brandDir });
    const hero = await request(sock, { path: `${PREFIX}/_fnos/brand/hero@2x.png` });
    assert.equal(hero.status, 200);
    assert.equal(hero.headers['content-type'], 'image/png');
    assert.equal(hero.body, 'png-bytes');
    for (const p of ['secret.png', '..%2Fhero@2x.png', 'wordmark@2x.png']) {
      assert.equal((await request(sock, { path: `${PREFIX}/_fnos/brand/${p}` })).status, 404, p);
    }
  });

  test('only fnOS admins from the NAS origin can start a sign-in', async () => {
    const ran = path.join(dir, 'ran');
    fs.rmSync(ran, { force: true });
    const sock = await adapterWith(fakeMain(dir, 'exit 0'));
    const notAdmin = await request(sock, { path: `${LOGIN}/start`, method: 'POST', headers: { 'x-trim-isadmin': 'false' } });
    assert.equal(notAdmin.status, 403);
    const crossSite = await request(sock, { path: `${LOGIN}/start`, method: 'POST', headers: { origin: 'https://evil.example' } });
    assert.equal(crossSite.status, 403);
    assert.equal((await request(sock, { path: `${LOGIN}/start` })).status, 404, 'GET does not start a sign-in');
    assert.equal(fs.existsSync(ran), false);
  });

  test('without a sign-in command the adapter keeps proxying and offers no sign-in page', async () => {
    const sock = await adapterWith(undefined);
    assert.equal((await request(sock, { path: `${PREFIX}/` })).status, 200);
    assert.equal((await request(sock, { path: LOGIN })).status, 404);
    assert.equal((await request(sock, { path: `${PREFIX}/connect` })).status, 404);
  });
});
