#!/usr/bin/env bash
# Run upstream's full client CI for a commit of .upstream/cindy on the
# contributor's fork, before the commit goes into an upstream PR.
#
# Usage: scripts/fork-ci.sh <ref> [name]
#   e.g. scripts/fork-ci.sh feat/host-web-login
#
# The commit is force-pushed to ci/<name> on the fork (name defaults to <ref>
# with "/" replaced by "-"), ci.yml is started there with workflow_dispatch,
# and the script waits for the result. On failure the failed jobs' logs are
# saved under build/fork-ci/. The run uses GitHub-hosted runners, so it matches
# the checks upstream requires (Linux and Windows unit shards, typecheck,
# verify-checks, Host regressions) without the local build machine.
#
# Differences from a PR run: without a PR base, the diff-based checks (design
# colours, settings search) compare against HEAD^ and test hygiene trusts the
# fork's main, so sync the fork's main (gh repo sync <fork> --branch main) and
# squash the branch to one commit on top of the latest upstream main first;
# Host regressions always run.
#
# CINDY_FORK_REMOTE   remote of .upstream/cindy that points at the fork (default: fork)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
UPSTREAM=$ROOT/.upstream/cindy
REMOTE=${CINDY_FORK_REMOTE:-fork}

(( $# >= 1 )) || { echo "usage: scripts/fork-ci.sh <ref> [name]" >&2; exit 2; }
REF=$1
SHA=$(git -C "$UPSTREAM" rev-parse --verify "$REF^{commit}")
NAME=${2:-${REF//\//-}}
BRANCH=ci/$NAME
REPO=$(git -C "$UPSTREAM" remote get-url "$REMOTE" | sed -E 's#^(https://github.com/|git@github.com:)##; s#\.git$##')
LOGDIR=$ROOT/build/fork-ci
log() { echo "[fork-ci] $*" >&2; }

git -C "$UPSTREAM" fetch -q origin main
if ! git -C "$UPSTREAM" merge-base --is-ancestor origin/main "$SHA"; then
  log "warning: $REF is not based on upstream main; test hygiene and diff-based checks may fail spuriously"
fi

log "pushing $SHA ($REF) to $REPO $BRANCH"
git -C "$UPSTREAM" push -q --force "$REMOTE" "$SHA:refs/heads/$BRANCH"

SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh workflow run ci.yml -R "$REPO" --ref "$BRANCH"

RUN=
for _ in $(seq 30); do
  RUN=$(gh run list -R "$REPO" --workflow ci.yml --branch "$BRANCH" --event workflow_dispatch \
    --json databaseId,headSha,createdAt \
    -q "[.[] | select(.headSha == \"$SHA\" and .createdAt >= \"$SINCE\")][0].databaseId // empty")
  [[ -n $RUN ]] && break
  sleep 5
done
[[ -n $RUN ]] || { log "run did not appear; check https://github.com/$REPO/actions"; exit 1; }
log "run https://github.com/$REPO/actions/runs/$RUN"

START=$(date +%s)
gh run watch "$RUN" -R "$REPO" --interval 60 >/dev/null 2>&1 || true
log "finished in $(( ($(date +%s) - START) / 60 )) min"

JOBS=$(gh run view "$RUN" -R "$REPO" --json jobs -q '.jobs[] | "\(.conclusion // .status)\t\(.name)"' | sort)
echo "$JOBS"
# "verify" only aggregates the other jobs. Fork runs may never get a macOS
# runner, so a cancelled job is reported but does not fail the check.
FAILED=$(awk -F'\t' '$1 != "success" && $1 != "skipped" && $1 != "cancelled" && $2 != "verify"' <<<"$JOBS")
CANCELLED=$(awk -F'\t' '$1 == "cancelled"' <<<"$JOBS")
[[ -z $CANCELLED ]] || log "warning: cancelled (not run, not verified): $(cut -f2 <<<"$CANCELLED" | paste -sd, -)"

if [[ -n $FAILED ]]; then
  mkdir -p "$LOGDIR"
  OUT=$LOGDIR/$NAME-${SHA:0:10}.log
  gh run view "$RUN" -R "$REPO" --log-failed > "$OUT" || true
  log "failed; logs of failed jobs: $OUT"
  exit 1
fi
log "all jobs passed at $SHA"
