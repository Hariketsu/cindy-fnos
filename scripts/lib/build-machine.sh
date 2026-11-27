#!/usr/bin/env bash
# Shared build-machine helpers for OrbStack (macOS) and Docker (Linux/WSL2).
# Sourced by scripts/build-host.sh and scripts/upstream-check.sh.

cindy_build_backend() {
  if [[ -n ${CINDY_BUILD_BACKEND:-} ]]; then
    echo "$CINDY_BUILD_BACKEND"
  elif [[ $(uname -s) == Darwin ]]; then
    echo orb
  else
    echo docker
  fi
}

cindy_free_gb() {
  local path=$1
  # -P (POSIX) -m (1024K blocks) works identically on macOS and GNU coreutils.
  df -Pm "$path" | awk 'NR==2 {print int($4/1024)}'
}

cindy_ensure_machine() {
  local machine=$1 arch=$2 root=$3
  local backend
  backend=$(cindy_build_backend)

  case "$backend" in
    orb)
      if ! orb list | awk '{print $1}' | grep -qx "$machine"; then
        echo "Creating OrbStack machine $machine (debian:bookworm, $arch)..."
        orb create -a "$arch" debian:bookworm "$machine"
        orb -m "$machine" -u root bash -c 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git git-lfs curl ca-certificates xz-utils build-essential python3 >/dev/null'
      fi
      ;;
    docker)
      local vol="cindy-build-home-$machine"
      local platform="linux/$arch"
      if ! docker container inspect "$machine" >/dev/null 2>&1; then
        echo "Creating Docker build container $machine (debian:bookworm, $platform)..."
        docker volume create "$vol" >/dev/null
        docker run -d --init --name "$machine" --platform "$platform" \
          -v "$vol:/root" \
          -v "$root:$root" \
          debian:bookworm sleep infinity >/dev/null
        docker exec "$machine" bash -lc '
          set -euo pipefail
          apt-get update -qq
          DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git git-lfs curl ca-certificates xz-utils build-essential python3 procps >/dev/null
          git config --global --add safe.directory "*"
        '
      elif [[ $(docker inspect -f '{{.State.Running}}' "$machine") != true ]]; then
        docker start "$machine" >/dev/null
      fi
      ;;
    *)
      echo "Unsupported CINDY_BUILD_BACKEND: $backend (expected orb or docker)" >&2
      exit 1
      ;;
  esac
}

cindy_run_in_machine() {
  local machine=$1 script=$2
  local backend
  backend=$(cindy_build_backend)

  case "$backend" in
    orb)
      orb -m "$machine" bash -lc "$script"
      ;;
    docker)
      docker exec -i "$machine" bash -lc "$script"
      ;;
    *)
      echo "Unsupported CINDY_BUILD_BACKEND: $backend" >&2
      exit 1
      ;;
  esac
}
