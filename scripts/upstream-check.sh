#!/usr/bin/env bash
# Run a command against a commit of .upstream/cindy on the Linux build machine.
#
# Usage: scripts/upstream-check.sh <ref> <command...>
#   e.g. scripts/upstream-check.sh fix/host-login-outcomes pnpm --filter @cindy/host test
#
# The build machine has the dependencies; the Mac clone has the branches. The
# commit moves between them as git objects: ~/cindy-dev on the build machine
# (a worktree of the ~/cindy clone that build-host.sh creates) fetches <ref>
# from the Mac clone, checks out exactly that commit and runs the command.
# Only committed work is tested; commit (or amend) first. ~/cindy-dev is
# separate from ~/cindy, so a Host build never resets what is being tested.
#
# CINDY_BUILD_MACHINE   OrbStack machine (default: cindy-build-arm64)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
UPSTREAM=$ROOT/.upstream/cindy
MACHINE=${CINDY_BUILD_MACHINE:-cindy-build-arm64}

if (( $# < 2 )); then
  echo "usage: scripts/upstream-check.sh <ref> <command...>" >&2
  exit 2
fi
REF=$1; shift
SHA=$(git -C "$UPSTREAM" rev-parse --verify "$REF^{commit}")
if [[ -n $(git -C "$UPSTREAM" status --porcelain --untracked-files=no) ]]; then
  echo "[upstream-check] note: .upstream/cindy has uncommitted changes; they are not part of $REF" >&2
fi
CMD=$(printf '%q ' "$@")

orb -m "$MACHINE" bash -lc "set -euo pipefail
export PATH=\$HOME/.local/node/bin:\$PATH
# pnpm 11 checks dependencies before every run/exec and would reinstall every
# platform from pnpm-workspace.yaml, undoing install --os/--cpu below.
export pnpm_config_verify_deps_before_run=false
step() { local label=\$1 start; shift; start=\$(date +%s%N); \"\$@\"; echo \"[upstream-check] \$label \$(( (\$(date +%s%N) - start) / 1000000 )) ms\" >&2; }

[[ -d \$HOME/cindy/.git ]] || { echo 'no ~/cindy on $MACHINE; run scripts/build-host.sh once first' >&2; exit 1; }
cd \$HOME/cindy
git remote get-url mac >/dev/null 2>&1 || git remote add mac '$UPSTREAM'
git config remote.mac.promisor true
git config remote.mac.uploadpack 'git -c uploadpack.allowFilter=true upload-pack'
[[ -e \$HOME/cindy-dev/.git ]] || git worktree add -q --detach \$HOME/cindy-dev
cd \$HOME/cindy-dev

# The Mac clone is partial (blob:none) and cannot serve blobs it never had, so
# fetch commits and trees only; blobs come lazily from origin or, for new
# commits, from the Mac clone.
step fetch git fetch -q --filter=blob:none mac $SHA
git checkout -q --force --detach $SHA
git clean -qfd
[[ \$(git rev-parse HEAD) == $SHA ]] && git diff --quiet HEAD || { echo '[upstream-check] checkout does not match $SHA' >&2; exit 1; }
step lfs git lfs pull --include='apps/desktop/native/sqlite-vec/linux-*'

# Only this machine's native packages, as in build-host.sh.
CPU=\$(node -p process.arch)
LOCK=\"\$(sha256sum pnpm-lock.yaml | cut -d' ' -f1) linux-\$CPU\"
if [[ \$(cat node_modules/.upstream-check-lock 2>/dev/null) != \$LOCK ]]; then
  step install pnpm install --frozen-lockfile --config.confirmModulesPurge=false --os=linux --cpu=\$CPU
  echo \$LOCK > node_modules/.upstream-check-lock
fi

echo \"[upstream-check] running at $SHA ($REF): $CMD\" >&2
step run $CMD
"
