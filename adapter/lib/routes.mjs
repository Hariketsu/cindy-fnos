// Which browser requests the adapter forwards to Cindy Host.
// Deny by default: a request reaches the Host only if it matches a row in ROUTES
// and no entry in DENIED. Paths are already normalized and prefix-stripped.

const GET_HEAD = ['GET', 'HEAD'];

// Renderer static files outside /assets/ (e.g. /pdfjs/build/pdf.mjs, /favicon.ico):
// plain path segments that end in a file extension; no dot-segments, no escapes.
const STATIC_FILE = /^(?:\/[\w-][\w.-]*)*\/[\w-][\w.-]*\.[A-Za-z0-9]+$/;

export const ROUTES = [
  // methods        match                        kind      what it is
  { methods: GET_HEAD, exact: '/',              kind: 'index' },  // renderer index.html (Host injects boot + shim)
  { methods: GET_HEAD, exact: '/shim.js' },                       // web shim (window.electronAPI)
  { methods: GET_HEAD, prefix: '/assets/' },                      // renderer bundle
  { methods: ['GET'],  exact: '/events',        kind: 'stream' }, // SSE event stream
  { methods: ['POST'], exact: '/chat',          kind: 'stream' }, // chat turn, streams SSE
  { methods: ['POST'], prefix: '/api/' },                         // JSON RPC
  { methods: GET_HEAD, exact: '/health' },                        // health probe
  { methods: GET_HEAD, pattern: STATIC_FILE },                    // other renderer static files
];

// Never forwarded, even if a row above would match (exact path or anything below it).
// /control/* (incl. /control/stop), pairing and cookie sessions, the loopback
// connect page, and the Host's native-client endpoints.
export const DENIED = ['/control', '/web', '/connect', '/connect.js', '/logout', '/sessions', '/me', '/plugins'];

export function matchRoute(method, pathname) {
  if (DENIED.some(d => pathname === d || pathname.startsWith(`${d}/`))) return null;
  return ROUTES.find(r => r.methods.includes(method) && (
    (r.exact !== undefined && pathname === r.exact)
    || (r.prefix !== undefined && pathname.startsWith(r.prefix))
    || (r.pattern !== undefined && r.pattern.test(pathname))
  )) ?? null;
}
