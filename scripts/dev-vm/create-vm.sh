#!/usr/bin/env bash
# Create the ARM fnOS dev VM in UTM with a configuration known to work.
# Usage: scripts/dev-vm/create-vm.sh <fnos-arm.iso> [vm-name]
# See docs/development.md for why each setting is needed.
set -euo pipefail

ISO=${1:?usage: create-vm.sh <fnos-arm.iso> [vm-name]}
NAME=${2:-fnOS-dev}
SERIAL_PORT=${FNOS_VM_SERIAL_PORT:-4555}
DOCS=~/Library/Containers/com.utmapp.UTM/Data/Documents

[[ -f $ISO ]] || { echo "ISO not found: $ISO" >&2; exit 1; }
[[ -d /Applications/UTM.app ]] || { echo "Install UTM first: brew install --cask utm" >&2; exit 1; }
if utmctl list 2>/dev/null | awk '{print $3}' | grep -qx "$NAME"; then
  echo "A VM named $NAME already exists; pick another name or delete it in UTM." >&2; exit 1
fi

ISO_ABS=$(cd "$(dirname "$ISO")" && pwd)/$(basename "$ISO")
echo "Creating $NAME (aarch64, hvf, 4 CPU, 8 GB, system 64 GB + 2 x data 64 GB)..."
osascript - "$ISO_ABS" "$NAME" <<'OSA'
on run argv
  set iso to POSIX file (item 1 of argv)
  with timeout of 600 seconds
    tell application "UTM"
      make new virtual machine with properties {backend:qemu, configuration:{name:(item 2 of argv), architecture:"aarch64", memory:8192, cpu cores:4, displays:{{hardware:"VGA"}}, network interfaces:{{mode:shared, hardware:"e1000"}}, drives:{{removable:true, source:iso}, {guest size:65536}, {guest size:65536}, {guest size:65536}}}}
    end tell
  end timeout
end run
OSA

# Serial-over-TCP cannot be set through AppleScript; edit the plist while UTM is closed.
osascript -e 'quit app "UTM"'; sleep 3
PLIST=$DOCS/$NAME.utm/config.plist
PB=/usr/libexec/PlistBuddy
"$PB" -c "Delete :Serial" "$PLIST" 2>/dev/null || true
"$PB" -c "Add :Serial array" \
      -c "Add :Serial:0 dict" \
      -c "Add :Serial:0:Mode string TcpServer" \
      -c "Add :Serial:0:Target string Auto" \
      -c "Add :Serial:0:TcpHostAddress string 127.0.0.1" \
      -c "Add :Serial:0:TcpPort integer $SERIAL_PORT" \
      -c "Add :Serial:0:WaitForConnection bool false" \
      -c "Add :Serial:0:RemoteConnectionAllowed bool false" "$PLIST"
# Make sure the display and NIC are what the installer needs, whatever UTM defaulted to.
"$PB" -c "Set :Display:0:Hardware VGA" -c "Set :Network:0:Hardware e1000" "$PLIST"

open -a UTM; sleep 3
echo "Created. Next: utmctl start $NAME, then follow the install steps in docs/development.md."
echo "Boot log: scripts/dev-vm/serial-log.sh"
