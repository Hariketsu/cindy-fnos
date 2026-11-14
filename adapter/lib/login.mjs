// Cindy sign-in for the web page: runs `<cmd/main> host-login` (which stops the
// Host, runs `cindy-host login`, and starts the Host again) and reports progress.
//
// States: idle -> starting -> waiting (authorize URL known) -> succeeded | failed | cancelled.
import { spawn as nodeSpawn } from 'node:child_process';

// Node runtime noise on stderr that says nothing about the sign-in itself.
const NOISE = /ExperimentalWarning|--trace-warnings/;

function authorizeUrl(line) {
  try {
    const url = new URL(line.trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function lines(stream, onLine) {
  let rest = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    const parts = (rest + chunk).split('\n');
    rest = parts.pop();
    for (const line of parts) onLine(line);
  });
  stream.on('end', () => { if (rest) onLine(rest); });
}

export function createLogin({ command, spawn = nodeSpawn, onExit = () => {}, warn = () => {} }) {
  let state = { state: 'idle' };
  let child = null;
  let cancelled = false;

  return {
    available: Boolean(command),
    status: () => ({ ...state }),
    /** `method` must already be one the caller allows (cmd/main checks it again). */
    start(method) {
      if (!command || child) return { ...state };
      state = { state: 'starting', method };
      cancelled = false;
      let reason = '';
      child = spawn(command, ['host-login', method], { stdio: ['ignore', 'pipe', 'pipe'] });
      lines(child.stdout, line => {
        const url = authorizeUrl(line);
        if (url && state.state === 'starting') state = { state: 'waiting', method, url };
      });
      lines(child.stderr, line => {
        const text = line.trim();
        if (!text || NOISE.test(text)) return;
        reason = text.slice(0, 300);
        warn(`login: ${reason}`);
      });
      const done = code => {
        if (!child) return;
        child = null;
        if (code === 0) state = { state: 'succeeded' };
        else if (cancelled) state = { state: 'cancelled' };
        else state = { state: 'failed', reason: reason || `exit ${code}` };
        onExit(code);
      };
      child.on('error', error => { reason = error.message; done(-1); });
      child.on('close', code => done(code ?? -1));
      return { ...state };
    },
    cancel() {
      if (child) { cancelled = true; child.kill('SIGTERM'); }
      return { ...state };
    },
  };
}
