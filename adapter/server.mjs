// Entry point: <host>/bin/node <app>/adapter/server.mjs
//
// Environment:
//   CINDY_FNOS_SOCKET         Unix socket the fnOS gateway connects to (default $TRIM_APPDEST/app.sock)
//   CINDY_FNOS_PREFIX         Gateway path prefix (default /app/cindy)
//   CINDY_FNOS_HOST_DATA_DIR  Cindy Host data dir: host-api-token, host-endpoint.json (required)
//   CINDY_FNOS_HOST_PORT      Fixed Host port; when unset, read from host-endpoint.json
//   CINDY_FNOS_MAIN           Path of the app's cmd/main; enables the web sign-in (`main host-login <method>`)
//   CINDY_FNOS_LOGIN_METHODS  Space-separated sign-in methods for the edition (default: wechat)
//   CINDY_FNOS_LOG=0          Disable per-request logging
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdapter } from './lib/adapter.mjs';

const env = process.env;
const socketPath = env.CINDY_FNOS_SOCKET || (env.TRIM_APPDEST ? path.join(env.TRIM_APPDEST, 'app.sock') : '');
const dataDir = env.CINDY_FNOS_HOST_DATA_DIR;
const hostPort = env.CINDY_FNOS_HOST_PORT ? Number(env.CINDY_FNOS_HOST_PORT) : undefined;

if (!socketPath || !dataDir || (hostPort !== undefined && !(Number.isInteger(hostPort) && hostPort > 0 && hostPort < 65536))) {
  console.error('[cindy-fnos-adapter] need CINDY_FNOS_SOCKET (or TRIM_APPDEST), CINDY_FNOS_HOST_DATA_DIR, and a valid CINDY_FNOS_HOST_PORT if set');
  process.exit(2);
}

const adapter = createAdapter({
  socketPath,
  dataDir,
  hostPort,
  prefix: env.CINDY_FNOS_PREFIX || '/app/cindy',
  loginCommand: env.CINDY_FNOS_MAIN || undefined,
  brandDir: fileURLToPath(new URL('./brand', import.meta.url)),
  loginMethods: (env.CINDY_FNOS_LOGIN_METHODS || '').split(/\s+/).filter(Boolean),
  log: env.CINDY_FNOS_LOG !== '0',
});

await adapter.listen();
console.log(`[cindy-fnos-adapter] listening on ${socketPath}, prefix ${adapter.prefix}, Host ${hostPort ? `port ${hostPort}` : 'from host-endpoint.json'}`);

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(0), 3000).unref();
    adapter.close().then(() => process.exit(0));
  });
}
