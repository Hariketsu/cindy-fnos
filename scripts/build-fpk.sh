#!/usr/bin/env bash
# Assemble the Cindy fnOS app package from the Host release and the adapter.
#
# Usage: scripts/build-fpk.sh [arm64|amd64]   (default: arm64)
# Input:  build/host/cindy-host-linux-<arch>.tar.gz   (scripts/build-host.sh)
# Output: build/fpk/cindy-<version>-<arch>.fpk
#
# CINDY_FNOS_VERSION        package version (default 0.1.0)
# CINDY_FNOS_ADAPTER_LOGIN  set to 0 for a test package without the adapter's
#                           sign-in page: the adapter then passes signed-out
#                           users to the original Cindy login page, which needs
#                           the Host's web sign-in (patches/0005)
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
if [[ ${CINDY_FNOS_ADAPTER_LOGIN:-1} == 0 ]]; then
  # Without CINDY_FNOS_MAIN the adapter has no sign-in command and turns its page off.
  sed -i.bak 's/ CINDY_FNOS_MAIN="${SELF}"//' "$STAGE/cmd/main" && rm "$STAGE/cmd/main.bak"
  grep -q CINDY_FNOS_MAIN "$STAGE/cmd/main" && { echo "Could not remove CINDY_FNOS_MAIN from cmd/main." >&2; exit 1; }
fi
sed -e "s/@VERSION@/$VERSION/" -e "s/@PLATFORM@/$PLATFORM/" "$ROOT/fpk/manifest" > "$STAGE/manifest"

# Host release (already pruned by build-host.sh) and the adapter, without its tests.
mkdir -p "$STAGE/app/host" "$STAGE/app/adapter"
tar -xzf "$TARBALL" -C "$STAGE/app/host" --strip-components=1
rsync -a --exclude test --exclude '*.test.mjs' "$ROOT/adapter/" "$STAGE/app/adapter/"
chmod +x "$STAGE/cmd/"* "$STAGE/app/host/cindy-host" "$STAGE/app/host/bin/node"

# The adapter's sign-in page reuses the original login artwork. The renderer's file
# names carry build hashes, and the Host is stopped during sign-in, so copy them
# under stable names for the adapter to serve itself (adapter/lib/brand.mjs).
mkdir -p "$STAGE/app/adapter/brand"
for name in hero@2x wordmark@2x wordmark-dark@2x slogan@2x slogan-dark@2x; do
  src=$(ls "$STAGE/app/host/resources/web/assets/$name"-*.png 2>/dev/null | head -n1)
  [[ -n $src ]] || { echo "Missing renderer asset $name in the Host release." >&2; exit 1; }
  cp "$src" "$STAGE/app/adapter/brand/$name.png"
done

( cd "$OUT" && "$ROOT/scripts/fnpack" build --directory "$STAGE" )
mv "$STAGE"/*.fpk "$OUT/cindy-$VERSION-$ARCH.fpk" 2>/dev/null || mv "$OUT"/cindy.fpk "$OUT/cindy-$VERSION-$ARCH.fpk"
rm -rf "$STAGE"
ls -la "$OUT/cindy-$VERSION-$ARCH.fpk"
