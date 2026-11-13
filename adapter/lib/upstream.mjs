// Where Cindy Host listens and which bearer token it accepts.
import fs from 'node:fs/promises';
import path from 'node:path';

const ENDPOINT_FILE = 'host-endpoint.json';
const TOKEN_FILE = 'host-api-token';

function target(baseUrl) {
  const url = new URL(baseUrl);
  // URL keeps IPv6 brackets in hostname; the socket API wants them stripped.
  return { origin: url.origin, host: url.host, hostname: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port) };
}

/**
 * Reads <dataDir>/host-endpoint.json with the same validation as upstream
 * readHostEndpoint (apps/host/src/control.mjs). Missing file -> { endpoint: null };
 * invalid file -> { endpoint: null, invalid: true }.
 */
export async function readHostEndpoint(dataDir) {
  let record;
  try { record = JSON.parse(await fs.readFile(path.join(dataDir, ENDPOINT_FILE), 'utf8')); }
  catch (error) { return error?.code === 'ENOENT' ? { endpoint: null } : { endpoint: null, invalid: true }; }
  try {
    const url = new URL(record.baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.origin !== record.baseUrl || !url.port
      || !Number.isSafeInteger(record.pid) || record.pid < 1) return { endpoint: null, invalid: true };
    return { endpoint: { ...target(record.baseUrl), instanceId: record.instanceId } };
  } catch { return { endpoint: null, invalid: true }; }
}

async function readToken(dataDir) {
  try { return (await fs.readFile(path.join(dataDir, TOKEN_FILE), 'utf8')).trim() || null; }
  catch { return null; }
}

/** Cached endpoint and token. `port` (explicit override) skips endpoint discovery. */
export function createUpstream({ dataDir, port, warn = () => {} }) {
  const fixed = port ? target(`http://127.0.0.1:${port}`) : null;
  let endpoint = null;
  let token = null;
  let instanceId;
  let lastInvalid = false;
  return {
    async endpoint() {
      if (fixed) return fixed;
      if (!endpoint) {
        const result = await readHostEndpoint(dataDir);
        if (result.invalid && !lastInvalid) warn(`${ENDPOINT_FILE} is invalid; treating Host as unavailable`);
        lastInvalid = Boolean(result.invalid);
        // A new Host instance may also have regenerated its token.
        if (result.endpoint && result.endpoint.instanceId !== instanceId) {
          token = null;
          instanceId = result.endpoint.instanceId;
        }
        endpoint = result.endpoint;
      }
      return endpoint;
    },
    async token() {
      token ??= await readToken(dataDir);
      return token;
    },
    /** Re-reads the token; true if it changed (worth retrying). */
    async refreshToken() {
      const previous = token;
      token = await readToken(dataDir);
      return token !== null && token !== previous;
    },
    /** Connection refused: the Host may have restarted on another port with another token. */
    invalidate() { endpoint = null; token = null; },
  };
}
