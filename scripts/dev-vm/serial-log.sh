#!/usr/bin/env bash
# Stream the VM's serial console (kernel and installer output). Ctrl-C to stop.
# The installed system prints its IP and Web UI address here after boot.
exec nc 127.0.0.1 "${FNOS_VM_SERIAL_PORT:-4555}"
