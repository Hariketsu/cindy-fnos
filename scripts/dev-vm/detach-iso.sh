#!/usr/bin/env bash
# Remove the installer ISO after installation so the VM boots from its system disk.
# Usage: scripts/dev-vm/detach-iso.sh [vm-name]
set -euo pipefail
NAME=${1:-fnOS-dev}
PLIST=~/Library/Containers/com.utmapp.UTM/Data/Documents/$NAME.utm/config.plist
PB=/usr/libexec/PlistBuddy

utmctl stop "$NAME" --force >/dev/null 2>&1 || true
osascript -e 'quit app "UTM"'; sleep 3
i=0
while "$PB" -c "Print :Drive:$i" "$PLIST" >/dev/null 2>&1; do
  if [[ $("$PB" -c "Print :Drive:$i:ImageType" "$PLIST") == CD ]]; then
    "$PB" -c "Delete :Drive:$i" "$PLIST"; echo "Removed installer drive $i."; break
  fi
  i=$((i + 1))
done
open -a UTM; sleep 3
utmctl start "$NAME"
echo "Started $NAME from the system disk. Watch for the IP with scripts/dev-vm/serial-log.sh"
