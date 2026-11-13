#!/usr/bin/env bash
# Run a command on the dev fnOS VM over SSH with the password from .env.local.
# Public-key login does not survive VM restarts yet (see TODO.md), so this uses expect.
# Usage: scripts/dev-vm/vm-ssh.sh '<command>'        (prefix with `sudo -S` style as needed)
#        scripts/dev-vm/vm-ssh.sh --scp <local-file> <remote-path>
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
# shellcheck disable=SC1091
source "$ROOT/.env.local"
: "${FNOS_VM_HOST:?set in .env.local}" "${FNOS_VM_USER:?}" "${FNOS_VM_PASSWORD:?}"
if [[ ${1:-} == --scp ]]; then
  CMD=(scp -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new "$2" "$FNOS_VM_USER@$FNOS_VM_HOST:$3")
else
  CMD=(ssh -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new "$FNOS_VM_USER@$FNOS_VM_HOST" "$1")
fi
export FNOS_VM_PASSWORD
EXP=$(mktemp); trap 'rm -f "$EXP"' EXIT
cat > "$EXP" <<'EXPECT'
set timeout 900
spawn {*}$argv
expect {
  -re "password( for \\S+)?:" { send "$env(FNOS_VM_PASSWORD)\r"; exp_continue }
  eof
}
catch wait result
exit [lindex $result 3]
EXPECT
expect "$EXP" "${CMD[@]}"
