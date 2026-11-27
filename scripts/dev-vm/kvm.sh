#!/usr/bin/env bash
# Manage an x86_64 fnOS dev VM with QEMU/KVM on Linux/WSL2.
#
# Usage:
#   scripts/dev-vm/kvm.sh create <fnos-x86.iso> [name]
#   scripts/dev-vm/kvm.sh install [name]            # boot ISO with GTK window (WSLg)
#   scripts/dev-vm/kvm.sh start [name]              # boot headless in background
#   scripts/dev-vm/kvm.sh stop [name] [--force]     # ACPI powerdown (or SIGTERM)
#   scripts/dev-vm/kvm.sh status [name]
#   scripts/dev-vm/kvm.sh serial [name]             # tail serial console log
#   scripts/dev-vm/kvm.sh snapshot <list|save|restore> [tag] [name]
set -euo pipefail

CMD=${1:-}
[[ -n $CMD ]] || { sed -n '2,12p' "$0" >&2; exit 2; }
shift

VM_BASE=${FNOS_VM_DIR:-$HOME/.local/share/cindy-fnos-vm}
OVMF_CODE=/usr/share/OVMF/OVMF_CODE_4M.fd
OVMF_VARS_TMPL=/usr/share/OVMF/OVMF_VARS_4M.fd

vm_dir() { echo "$VM_BASE/${1:-fnOS-dev}"; }

is_running() {
  local pidfile=$1/qemu.pid
  [[ -f $pidfile ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

monitor_cmd() {
  local sock=$1 cmd=$2
  python3 - "$sock" "$cmd" <<'PY'
import socket, sys
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(sys.argv[1])
s.sendall((sys.argv[2] + "\n").encode())
s.close()
PY
}

qemu_common_args() {
  local dir=$1
  # shellcheck disable=SC1091
  source "$dir/vm.conf"
  QEMU_ARGS=(
    -name "$VM_NAME"
    -machine q35,accel=kvm
    -cpu host
    -smp "${FNOS_VM_CPUS:-4}"
    -m "${FNOS_VM_MEM:-8192}"
    -drive "if=pflash,format=raw,readonly=on,file=$OVMF_CODE"
    -drive "if=pflash,format=raw,file=$dir/OVMF_VARS.fd"
    -drive "file=$dir/sys.qcow2,if=virtio,format=qcow2,discard=unmap"
    -drive "file=$dir/data.qcow2,if=virtio,format=qcow2,discard=unmap"
    -device "e1000,netdev=net0"
    -netdev "user,id=net0,hostfwd=tcp:127.0.0.1:${SSH_PORT}-:22,hostfwd=tcp:0.0.0.0:${WEB_PORT}-:5666"
    -vga std
    -serial "file:$dir/serial.log"
    -monitor "unix:$dir/monitor.sock,server,nowait"
    -pidfile "$dir/qemu.pid"
  )
}

case "$CMD" in
  create)
    ISO=${1:?usage: kvm.sh create <fnos-x86.iso> [name]}
    NAME=${2:-fnOS-dev}
    DIR=$(vm_dir "$NAME")
    [[ -f $ISO ]] || { echo "ISO not found: $ISO" >&2; exit 1; }
    [[ ! -e $DIR ]] || { echo "VM $NAME already exists at $DIR" >&2; exit 1; }
    [[ -r /dev/kvm && -w /dev/kvm ]] || { echo "No read/write access to /dev/kvm (add user to kvm group)" >&2; exit 1; }
    [[ -f $OVMF_CODE && -f $OVMF_VARS_TMPL ]] || { echo "Missing OVMF firmware; install ovmf" >&2; exit 1; }

    ISO_ABS=$(cd "$(dirname "$ISO")" && pwd)/$(basename "$ISO")
    mkdir -p "$DIR"
    cp "$OVMF_VARS_TMPL" "$DIR/OVMF_VARS.fd"
    qemu-img create -q -f qcow2 "$DIR/sys.qcow2" 64G
    qemu-img create -q -f qcow2 "$DIR/data.qcow2" 64G
    cat > "$DIR/vm.conf" <<CONF
VM_NAME=$NAME
ISO_PATH=$ISO_ABS
SSH_PORT=${FNOS_VM_PORT:-2222}
WEB_PORT=${FNOS_VM_WEB_PORT:-5666}
CONF
    echo "Created KVM VM $NAME at $DIR (sys 64G + data 64G)."
    echo "Next: scripts/dev-vm/kvm.sh install $NAME"
    ;;

  install)
    NAME=${1:-fnOS-dev}
    DIR=$(vm_dir "$NAME")
    [[ -f $DIR/vm.conf ]] || { echo "VM $NAME not found at $DIR" >&2; exit 1; }
    ! is_running "$DIR" || { echo "VM $NAME is already running" >&2; exit 1; }
    qemu_common_args "$DIR"
    # shellcheck disable=SC1091
    source "$DIR/vm.conf"
    [[ -f $ISO_PATH ]] || { echo "ISO not found: $ISO_PATH" >&2; exit 1; }
    export DISPLAY=${DISPLAY:-:0}
    echo "Booting $NAME from ISO with GTK window (DISPLAY=$DISPLAY)..."
    echo "Close or power off the VM once installation finishes, then run: scripts/dev-vm/kvm.sh start $NAME"
    exec qemu-system-x86_64 "${QEMU_ARGS[@]}" -cdrom "$ISO_PATH" -boot d -display gtk
    ;;

  start)
    NAME=${1:-fnOS-dev}
    DIR=$(vm_dir "$NAME")
    [[ -f $DIR/vm.conf ]] || { echo "VM $NAME not found at $DIR" >&2; exit 1; }
    if is_running "$DIR"; then
      echo "VM $NAME is already running (pid $(cat "$DIR/qemu.pid"))."
      exit 0
    fi
    qemu_common_args "$DIR"
    # shellcheck disable=SC1091
    source "$DIR/vm.conf"
    qemu-system-x86_64 "${QEMU_ARGS[@]}" -display none -daemonize
    echo "Started $NAME (pid $(cat "$DIR/qemu.pid")): Web UI http://127.0.0.1:${WEB_PORT}, SSH port ${SSH_PORT}"
    ;;

  stop)
    NAME=${1:-fnOS-dev}
    FORCE=${2:-}
    DIR=$(vm_dir "$NAME")
    if ! is_running "$DIR"; then
      echo "VM $NAME is not running."
      exit 0
    fi
    PID=$(cat "$DIR/qemu.pid")
    if [[ $FORCE == --force ]]; then
      kill "$PID"
    elif [[ -S $DIR/monitor.sock ]]; then
      monitor_cmd "$DIR/monitor.sock" system_powerdown
      for _ in $(seq 1 30); do
        kill -0 "$PID" 2>/dev/null || break
        sleep 1
      done
      if kill -0 "$PID" 2>/dev/null; then
        echo "ACPI powerdown timed out after 30s; run with --force to terminate." >&2
        exit 1
      fi
    else
      kill "$PID"
    fi
    echo "Stopped $NAME."
    ;;

  status)
    NAME=${1:-fnOS-dev}
    DIR=$(vm_dir "$NAME")
    [[ -f $DIR/vm.conf ]] || { echo "VM $NAME not found at $DIR" >&2; exit 1; }
    # shellcheck disable=SC1091
    source "$DIR/vm.conf"
    if is_running "$DIR"; then
      echo "$NAME: running (pid $(cat "$DIR/qemu.pid")), Web :${WEB_PORT}, SSH :${SSH_PORT}"
    else
      echo "$NAME: stopped (Web :${WEB_PORT}, SSH :${SSH_PORT})"
    fi
    ;;

  serial)
    NAME=${1:-fnOS-dev}
    DIR=$(vm_dir "$NAME")
    exec tail -n 100 -f "$DIR/serial.log"
    ;;

  snapshot)
    SUB=${1:?usage: kvm.sh snapshot <list|save|restore> [tag] [name]}
    shift
    case "$SUB" in
      list)
        NAME=${1:-fnOS-dev}
        DIR=$(vm_dir "$NAME")
        qemu-img snapshot -l "$DIR/sys.qcow2"
        ;;
      save|restore)
        TAG=${1:?usage: kvm.sh snapshot $SUB <tag> [name]}
        NAME=${2:-fnOS-dev}
        DIR=$(vm_dir "$NAME")
        ! is_running "$DIR" || { echo "Stop VM $NAME before snapshot $SUB" >&2; exit 1; }
        local_flag=$([[ $SUB == save ]] && echo -c || echo -a)
        qemu-img snapshot "$local_flag" "$TAG" "$DIR/sys.qcow2"
        qemu-img snapshot "$local_flag" "$TAG" "$DIR/data.qcow2"
        echo "Snapshot '$TAG' ${SUB}d on $NAME."
        ;;
      *)
        echo "Unknown snapshot action: $SUB" >&2; exit 2
        ;;
    esac
    ;;

  *)
    echo "Unknown command: $CMD" >&2
    exit 2
    ;;
esac
