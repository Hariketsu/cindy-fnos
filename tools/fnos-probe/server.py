#!/usr/bin/env python3
"""fnOS platform probe backend.

Serves the probe page over the fnOS unified gateway (Unix socket) and records
what the platform actually does: request paths and headers as forwarded by
the gateway, SSE delivery timing, runtime identity and environment, and the
backend open API. Findings are written as JSON files to the app's data-share
directory so they can be read back with fnos-cli.

Python standard library only: the ARM app center has no Node.js runtime yet.
"""

import http.client
import json
import os
import socket
import socketserver
import sys
import time
from http.server import BaseHTTPRequestHandler

APP = os.environ.get("TRIM_APPNAME", "cindyprobe")
PREFIX = f"/app/{APP}"
HERE = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(HERE, "www")
SOCKET_PATH = os.environ.get("PROBE_SOCKET") or os.path.join(os.environ.get("TRIM_APPDEST", HERE), "app.sock")
SHARES = [p for p in os.environ.get("TRIM_DATA_SHARE_PATHS", "").split(":") if p]
REPORT_DIR = next((p for p in SHARES if p.rstrip("/").endswith("reports")), None) \
    or os.environ.get("TRIM_PKGVAR") or os.path.join(HERE, "reports")
OPEN_API_SOCKET = "/var/run/trim_open_gateway_apiscope.socket"
SENSITIVE_HEADERS = {"cookie", "authorization", "x-trim-token"}
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8"}


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()) + f".{int(time.time() * 1000) % 1000:03d}"


def redact_headers(headers):
    """Keep header names and non-secret values; never store cookie or token values."""
    out = {}
    for name, value in headers.items():
        if name.lower() in SENSITIVE_HEADERS:
            if name.lower() == "cookie":
                out[name] = "[cookie names] " + ", ".join(sorted({c.split("=", 1)[0].strip() for c in value.split(";")}))
            else:
                out[name] = f"[redacted, {len(value)} chars]"
        else:
            out[name] = value
    return out


def write_report(name, payload):
    os.makedirs(REPORT_DIR, exist_ok=True)
    path = os.path.join(REPORT_DIR, f"{time.strftime('%Y%m%d-%H%M%S')}-{name}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("localhost", timeout=10)
        self.unix_path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(10)
        self.sock.connect(self.unix_path)


def open_api(req, data=None):
    token = os.environ.get("TRIM_API_TOKEN")
    if not token:
        return {"error": "TRIM_API_TOKEN not set"}
    body = json.dumps({"reqId": str(int(time.time() * 1000)), "req": req, "appName": APP, "data": data or {}})
    try:
        conn = UnixHTTPConnection(OPEN_API_SOCKET)
        conn.request("POST", "/api/v1/trimapp", body, {"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
        res = conn.getresponse()
        text = res.read().decode("utf-8", "replace")
        try:
            return {"status": res.status, "body": json.loads(text)}
        except ValueError:
            return {"status": res.status, "text": text[:2000]}
    except OSError as e:
        return {"error": f"{type(e).__name__}: {e}"}


def backend_checks():
    def writable(path):
        if not path:
            return None
        try:
            probe = os.path.join(path, ".probe-write")
            with open(probe, "w") as f:
                f.write("ok")
            os.remove(probe)
            return True
        except OSError as e:
            return f"{type(e).__name__}: {e}"

    env = {k: v for k, v in sorted(os.environ.items()) if k.startswith("TRIM_") or k.startswith("wizard_")}
    if "TRIM_API_TOKEN" in env:
        env["TRIM_API_TOKEN"] = f"[present, {len(env['TRIM_API_TOKEN'])} chars]"
    dirs = {k: os.environ.get(k) for k in ("TRIM_APPDEST", "TRIM_PKGVAR", "TRIM_PKGETC", "TRIM_PKGHOME", "TRIM_PKGTMP")}
    try:
        sock_stat = oct(os.stat(SOCKET_PATH).st_mode & 0o777)
    except OSError as e:
        sock_stat = str(e)
    return {
        "time": now(),
        "identity": {"uid": os.getuid(), "gid": os.getgid(), "groups": os.getgroups(), "euid": os.geteuid()},
        "python": sys.version,
        "cwd": os.getcwd(),
        "env": env,
        "dirs_writable": {k: writable(v) for k, v in dirs.items()},
        "shares": SHARES,
        "report_dir": REPORT_DIR,
        "socket": {"path": SOCKET_PATH, "mode": sock_stat, "umask_note": "default umask, not changed"},
        "open_api": {
            "getPlatformConfig": open_api("trim.system.getPlatformConfig"),
            "getSharedAccessibleFolders": open_api("trim.file.getSharedAccessibleFolders"),
            "convertPath": open_api("trim.file.convertPath", {"path": SHARES + ["/vol1/1000"], "language": "zh-CN"}),
        },
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "cindyprobe"

    def log_message(self, fmt, *args):
        pass

    def route(self):
        path = self.path.split("?", 1)[0]
        if path == PREFIX or path.startswith(PREFIX + "/"):
            return path[len(PREFIX):] or "/", True
        return path, False

    def record(self, body_len=0):
        entry = {"t": now(), "method": self.command, "raw_path": self.path, "headers": redact_headers(self.headers),
                 "body_len": body_len, "client": str(self.client_address)}
        os.makedirs(REPORT_DIR, exist_ok=True)
        with open(os.path.join(REPORT_DIR, "requests.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def send_json(self, status, payload, extra=None):
        data = json.dumps(payload, ensure_ascii=False, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.record()
        route, prefixed = self.route()
        query = self.path.split("?", 1)[1] if "?" in self.path else ""
        if route in ("/", "/index.html"):
            return self.static("index.html")
        if route in ("/probe.js", "/sdk.js", "/file.html", "/callback.html"):
            return self.static(route[1:])
        if route == "/api/echo":
            return self.send_json(200, {"raw_path": self.path, "prefixed": prefixed, "route": route,
                                        "headers": redact_headers(self.headers)})
        if route == "/api/headers":
            # Which response headers survive the gateway?
            return self.send_json(200, {"ok": True}, {
                "X-Probe-Custom": "kept",
                "X-Frame-Options": "SAMEORIGIN",
                "Content-Security-Policy": "frame-ancestors 'self'",
                "Set-Cookie": f"probe_cookie=1; Path={PREFIX}; HttpOnly; SameSite=Strict",
                "Access-Control-Expose-Headers": "X-Probe-Custom, X-Frame-Options, Content-Security-Policy",
            })
        if route == "/api/backend":
            return self.send_json(200, backend_checks())
        if route == "/api/sse":
            return self.sse(count=10, interval=1.0)
        if route == "/api/sse-idle":
            seconds = int(dict(p.split("=", 1) for p in query.split("&") if "=" in p).get("seconds", "70"))
            return self.sse(count=2, interval=min(seconds, 600))
        self.send_json(404, {"error": "not_found", "route": route, "raw_path": self.path})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        self.record(len(body))
        route, _ = self.route()
        if route == "/api/report":
            try:
                payload = json.loads(body or b"{}")
            except ValueError:
                return self.send_json(400, {"error": "bad_json"})
            tag = "".join(c for c in str(payload.get("tag", "client")) if c.isalnum() or c in "-_")[:40] or "client"
            payload["received_headers"] = redact_headers(self.headers)
            payload["received_raw_path"] = self.path
            return self.send_json(200, {"saved": write_report(f"client-{tag}", payload)})
        self.send_json(404, {"error": "not_found", "route": route})

    def static(self, name):
        path = os.path.join(WWW, name)
        if not os.path.isfile(path):
            return self.send_json(404, {"error": "missing_static", "name": name})
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(os.path.splitext(name)[1], "application/octet-stream"))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def sse(self, count, interval):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-transform")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        self.end_headers()  # no Content-Length: the stream ends when the connection closes
        self.close_connection = True
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            for i in range(count):
                if i:
                    time.sleep(interval)
                msg = json.dumps({"seq": i, "server_ms": int(time.time() * 1000)})
                self.wfile.write(f"id: {i}\ndata: {msg}\n\n".encode())
                self.wfile.flush()
            self.wfile.write(b"event: done\ndata: {}\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True

    def get_request(self):
        conn, _ = super().get_request()
        return conn, ("unix", 0)


def main():
    if os.path.exists(SOCKET_PATH):
        os.remove(SOCKET_PATH)
    server = Server(SOCKET_PATH, Handler)
    print(f"{now()} listening on {SOCKET_PATH}, reports in {REPORT_DIR}", flush=True)
    write_report("backend-startup", backend_checks())
    server.serve_forever()


if __name__ == "__main__":
    main()
