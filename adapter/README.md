# fnOS Adapter

Reverse proxy between the fnOS gateway (Unix socket, requests under `/app/cindy`) and the loopback Cindy Host. Node.js standard library only; runs on the Node bundled with the Host.

```sh
CINDY_FNOS_SOCKET="$TRIM_APPDEST/app.sock" CINDY_FNOS_HOST_DATA_DIR=<host data dir> <host>/bin/node adapter/server.mjs
node --test adapter/test/
```

Configuration is documented at the top of `server.mjs`; the forwarded routes are the table in `lib/routes.mjs`. Design and security boundary: [docs/architecture.md](../docs/architecture.md).
