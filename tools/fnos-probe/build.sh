#!/usr/bin/env bash
# Build the fnOS platform probe into build/fnos-probe/cindyprobe.fpk.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
OUT=$ROOT/build/fnos-probe
SDK_VERSION=0.6.0   # @trimjs/web-app; not vendored because the package declares no license

rm -rf "$OUT" && mkdir -p "$OUT"
cp -R "$HERE/pkg" "$OUT/cindyprobe"
mkdir -p "$OUT/cindyprobe/app/server"
cp "$HERE/server.py" "$OUT/cindyprobe/app/server/"
cp -R "$HERE/www" "$OUT/cindyprobe/app/server/www"

( cd "$OUT" && npm pack "@trimjs/web-app@$SDK_VERSION" --silent >/dev/null && tar -xzf trimjs-web-app-*.tgz )
cp "$OUT/package/dist/index.js" "$OUT/cindyprobe/app/server/www/sdk.js"

"$ROOT/scripts/fnpack" build --directory "$OUT/cindyprobe"
mv "$OUT"/cindyprobe/*.fpk "$OUT/" 2>/dev/null || mv ./*.fpk "$OUT/" 2>/dev/null || true
ls -la "$OUT"/*.fpk
