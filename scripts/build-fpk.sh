#!/usr/bin/env bash
# Assemble the Cindy fnOS app package from the Host release and the adapter.
#
# Usage: scripts/build-fpk.sh [arm64|amd64]   (default: arm64)
# Input:  build/host/cindy-host-linux-<arch>.tar.gz   (scripts/build-host.sh)
# Output: build/fpk/cindy-<version>-<arch>.fpk
set -euo pipefail

ARCH=${1:-arm64}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=${CINDY_FNOS_VERSION:-0.1.0}
PLATFORM=$([[ $ARCH == amd64 ]] && echo x86 || echo arm)   # fnOS manifest platform names
TARBALL=$ROOT/build/host/cindy-host-linux-$ARCH.tar.gz
OUT=$ROOT/build/fpk
STAGE=$OUT/cindy

[[ -f $TARBALL ]] || { echo "Missing $TARBALL; run scripts/build-host.sh $ARCH first." >&2; exit 1; }
[[ -f $ROOT/adapter/server.mjs ]] || { echo "Missing adapter/server.mjs." >&2; exit 1; }

rm -rf "$STAGE" && mkdir -p "$OUT"
cp -R "$ROOT/fpk" "$STAGE"
find "$STAGE" -name .gitkeep -delete
sed -e "s/@VERSION@/$VERSION/" -e "s/@PLATFORM@/$PLATFORM/" "$ROOT/fpk/manifest" > "$STAGE/manifest"

# Host release (already pruned by build-host.sh) and the adapter, without its tests.
mkdir -p "$STAGE/app/host" "$STAGE/app/adapter"
tar -xzf "$TARBALL" -C "$STAGE/app/host" --strip-components=1
rsync -a --exclude test --exclude '*.test.mjs' "$ROOT/adapter/" "$STAGE/app/adapter/"
chmod +x "$STAGE/cmd/"* "$STAGE/app/host/cindy-host" "$STAGE/app/host/bin/node"

( cd "$OUT" && "$ROOT/scripts/fnpack" build --directory "$STAGE" )
mv "$STAGE"/*.fpk "$OUT/cindy-$VERSION-$ARCH.fpk" 2>/dev/null || mv "$OUT"/cindy.fpk "$OUT/cindy-$VERSION-$ARCH.fpk"
rm -rf "$STAGE"
ls -la "$OUT/cindy-$VERSION-$ARCH.fpk"
