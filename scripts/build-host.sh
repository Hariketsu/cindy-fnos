#!/usr/bin/env bash
# Build the Cindy Host release for fnOS inside an OrbStack Debian 12 machine.
#
# Usage: scripts/build-host.sh [arm64|amd64]    (default: arm64)
# Output: build/host/cindy-host-linux-<arch>.tar.gz
#
# CINDY_WEB_BASE   URL path the browser loads the app from, e.g. /app/cindy/
#                  (fnOS gateway). Builds the renderer with Vite --base so its
#                  assets resolve under that path; the proxy in front must also
#                  set window.__CINDY_BASE__ for the shim (patches/0004).
#                  Default: unset, renderer served at / as upstream.
#
# Why Debian 12: fnOS is Debian 12 (glibc 2.36). The release contains native
# modules compiled on the build machine, so the glibc must match the target.
# See docs/development.md for details.
set -euo pipefail

ARCH=${1:-arm64}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
MACHINE=${CINDY_BUILD_MACHINE:-cindy-build-$ARCH}
COMMIT=$(sed -n 's/^commit=//p' "$ROOT/upstream.lock")
REPO=$(sed -n 's/^repository=//p' "$ROOT/upstream.lock")
NODE_VERSION=22.22.3          # upstream .nvmrc
PNPM_VERSION=11.28.9          # upstream packageManager
HARNESSES=pi-bin,ripgrep-bin  # see docs/plan.md: only Pi is bundled
WEB_BASE=${CINDY_WEB_BASE:-}
if [[ -n $WEB_BASE && ! $WEB_BASE =~ ^/([A-Za-z0-9._~-]+/)*$ ]]; then
  echo "CINDY_WEB_BASE must be an absolute path ending in /, e.g. /app/cindy/" >&2
  exit 1
fi
NODE_ARCH=$([[ $ARCH == amd64 ]] && echo x64 || echo arm64)
OUT=$ROOT/build/host
mkdir -p "$OUT"

# The release tarball is ~0.8 GB and the build machine grows by several GB.
FREE_GB=$(df -g "$ROOT" | awk 'NR==2 {print $4}')
if (( FREE_GB < 10 )); then
  echo "Only ${FREE_GB} GB free on the Mac; need at least 10 GB. See docs/development.md (disk space)." >&2
  exit 1
fi

if ! orb list | awk '{print $1}' | grep -qx "$MACHINE"; then
  echo "Creating OrbStack machine $MACHINE (debian:bookworm, $ARCH)..."
  orb create -a "$ARCH" debian:bookworm "$MACHINE"
  orb -m "$MACHINE" -u root bash -c 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git git-lfs curl ca-certificates xz-utils build-essential python3 >/dev/null'
fi

orb -m "$MACHINE" bash -lc "set -euo pipefail
if [[ ! -x \$HOME/.local/node/bin/node ]] || [[ \$(\$HOME/.local/node/bin/node -v) != v$NODE_VERSION ]]; then
  cd /tmp
  curl -fsSLO https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz
  curl -fsSL https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt | grep ' node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz\$' | sha256sum -c -
  mkdir -p \$HOME/.local && tar -xJf node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz -C \$HOME/.local
  ln -sfn \$HOME/.local/node-v$NODE_VERSION-linux-$NODE_ARCH \$HOME/.local/node
fi
export PATH=\$HOME/.local/node/bin:\$PATH
# pnpm 11 checks dependencies before every run/exec and would reinstall every
# platform from pnpm-workspace.yaml, undoing install --os/--cpu below.
export pnpm_config_verify_deps_before_run=false
corepack enable --install-directory \$HOME/.local/node/bin
corepack prepare pnpm@$PNPM_VERSION --activate >/dev/null

# Fresh checkout of the pinned commit, with our patches applied.
if [[ ! -d \$HOME/cindy/.git ]]; then
  GIT_LFS_SKIP_SMUDGE=1 git clone -q --filter=blob:none $REPO \$HOME/cindy
fi
cd \$HOME/cindy
git fetch -q origin $COMMIT
git checkout -q --force $COMMIT
git clean -qfd apps/host/scripts
for p in '$ROOT'/patches/*.patch; do [[ -e \$p ]] && git apply --index \"\$p\"; done
git lfs pull --include='apps/desktop/native/sqlite-vec/linux-*'

# Upstream installs the optional native packages of every desktop platform
# (supportedArchitectures); this machine only needs its own (~2.3 GB by du it never uses).
# The release copies none of them (node-pty's bundled prebuilds are unaffected).
pnpm install --frozen-lockfile --config.confirmModulesPurge=false --os=linux --cpu=$NODE_ARCH    # also downloads the agent harness binaries; no TTY to confirm a modules purge
CLI=\$(cd apps/host && node -p \"require('path').join(require('path').dirname(require.resolve('playwright-core/package.json')),'cli.js')\")
node \"\$CLI\" install chromium   # Chromium bundled into the release
pnpm --filter desktop exec vite build --config vite.renderer.config.ts ${WEB_BASE:+--base=$WEB_BASE}

rm -rf \$HOME/out && mkdir -p \$HOME/out
CINDY_HOST_HARNESSES=$HARNESSES pnpm --filter @cindy/host build --output \$HOME/out/cindy-host
node '$ROOT/scripts/prune-host.mjs' \$HOME/out/cindy-host   # see docs/fnos-platform-notes.md
tar -C \$HOME/out -cf - cindy-host | gzip -1 > '$OUT/cindy-host-linux-$ARCH.tar.gz'
"
echo "Built $OUT/cindy-host-linux-$ARCH.tar.gz (upstream $COMMIT)"
