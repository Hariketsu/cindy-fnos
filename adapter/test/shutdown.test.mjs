import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { GATEWAY_HEADERS, startFakeHost, tempDir } from './helpers.mjs';

const entry = fileURLToPath(new URL('../server.mjs', import.meta.url));

test('SIGTERM exits promptly with an open SSE stream and removes the socket', async () => {
  const dataDir = tempDir();
  fs.writeFileSync(path.join(dataDir, 'host-api-token'), 't');
  const host = await startFakeHost({ token: 't', sseIntervalMs: 100, sseEvents: 1000 });
  const socketPath = path.join(tempDir(), 'app.sock');
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, CINDY_FNOS_SOCKET: socketPath, CINDY_FNOS_HOST_DATA_DIR: dataDir, CINDY_FNOS_HOST_PORT: String(host.port), CINDY_FNOS_LOG: '0' },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 100 && !fs.existsSync(socketPath); i++) await delay(20);
    assert.ok(fs.existsSync(socketPath), 'adapter did not start');
    await new Promise((resolve, reject) => {
      const req = http.request({ socketPath, path: '/app/cindy/events', headers: GATEWAY_HEADERS }, res => res.once('data', resolve));
      req.on('error', () => {});
      req.end();
      setTimeout(() => reject(new Error('no SSE data')), 1000);
    });
    const start = Date.now();
    child.kill('SIGTERM');
    const code = await new Promise(resolve => child.once('exit', resolve));
    assert.equal(code, 0);
    assert.ok(Date.now() - start < 3000);
    assert.ok(!fs.existsSync(socketPath));
  } finally {
    child.kill('SIGKILL');
    await host.close();
  }
});
