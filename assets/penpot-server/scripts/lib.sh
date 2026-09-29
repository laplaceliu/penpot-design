#!/usr/bin/env bash
# Why: single source of truth for "where am I" and "how do I talk to compose".
# Every script in ./scripts sources this file first. All deployment paths are
# derived from this file's own location, so the checkout can be cloned
# anywhere (~/penpot, /srv/penpot, a CI workspace) and the scripts still find
# compose.yaml, caddy/Caddyfile and data/. The only absolute paths left in the
# scripts are the OS trust stores and /etc/hosts, which are absolute on every
# host by definition.

# shellcheck shell=bash
set -euo pipefail

# Why: resolve a path to its real location by walking symlinks. `readlink -f`
# is GNU-only (macOS ships a readlink without -f) so we loop by hand; relative
# link targets are resolved against the link's own directory, which is what a
# `ln -s scripts/up.sh ~/bin/up.sh` style link produces.
_resolve_path() {
  local src="$1" link
  while [ -L "$src" ]; do
    link="$(readlink "$src" 2>/dev/null || true)"
    [ -n "$link" ] || break
    case "$link" in
      /*) src="$link" ;;
      *) src="$(dirname -- "$src")/$link" ;;
    esac
  done
  printf '%s\n' "$(cd -- "$(dirname -- "$src")" >/dev/null 2>&1 && pwd -P)/$(basename -- "$src")"
}

# Why: `$0` breaks for symlinked scripts, for `sh script.sh`, and for sourced
# files. ${BASH_SOURCE[1]} is the caller, ${BASH_SOURCE[0]} is this file (used
# when lib.sh is run directly). Symlinks are followed so a script linked into
# ~/bin still resolves back into the checkout.
_scripts_dir() {
  dirname -- "$(_resolve_path "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")"
}

SCRIPTS_DIR="$(_scripts_dir)"
SERVER_DIR="$(cd -- "$SCRIPTS_DIR/.." >/dev/null 2>&1 && pwd -P)"

COMPOSE_FILE="$SERVER_DIR/compose.yaml"
CADDYFILE="$SERVER_DIR/caddy/Caddyfile"
DATA_DIR="$SERVER_DIR/data"
CA_CERT="$DATA_DIR/caddy/pki/authorities/local/root.crt"
# Why: the hostname Caddy signs the leaf cert for. Override with PENPOT_HOST
# (and the matching PENPOT_PUBLIC_URI in .env) to serve a different name.
HOST_NAME="${PENPOT_HOST:-penpot.local}"

# Why: docker compose v2 (`docker compose`) and v1 (`docker-compose`) take the
# same arguments but only v2 is installed on modern hosts. Detect once and let
# every script call `compose ...`, so the `-f compose.yaml` flag (and with it
# the portability of the whole stack) can never be forgotten.
COMPOSE_CMD=()

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    printf 'ERROR: no docker compose found. Install Docker Engine + the compose plugin:\n  https://docs.docker.com/compose/install/\n' >&2
    exit 1
  fi
}

compose() {
  "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" "$@"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    printf 'ERROR: docker not found in PATH.\n' >&2
    exit 1
  fi
  detect_compose
  if [ ! -f "$COMPOSE_FILE" ]; then
    printf 'ERROR: %s not found.\n  Expected the scripts to live in <deployment>/scripts/.\n' "$COMPOSE_FILE" >&2
    exit 1
  fi
}

# Why: /etc/hosts and the system trust store need root. On a dev box that is
# almost always `sudo`, but CI images and rootful containers have neither nor
# need it. Returns 1 when privileges are unavailable so callers can warn and
# continue instead of dying.
SUDO=""
need_privileges() {
  if [ "$(id -u)" = "0" ]; then
    SUDO=""
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
    return 0
  fi
  return 1
}

run_privileged() {
  if [ -n "$SUDO" ]; then
    sudo "$@"
  else
    "$@"
  fi
}

hosts_has_entry() {
  local host="$1"
  local pattern
  pattern="$(printf '%s' "$host" | sed 's/\./\\./g')"
  grep -qE "(^|[[:space:]])${pattern}([[:space:]]|$)" /etc/hosts 2>/dev/null
}

# Why: HOST_NAME must resolve to 127.0.0.1 for Caddy's server-name match and
# for any browser / webview / MCP client that loads https://penpot.local.
# We only append when the entry is missing and never rewrite existing lines.
ensure_host_entry() {
  local host="${1:-$HOST_NAME}"
  local ip="${2:-127.0.0.1}"
  if hosts_has_entry "$host"; then
    return 0
  fi
  if ! need_privileges; then
    printf 'WARNING: "%s" is missing from /etc/hosts and we cannot write it (no root, no sudo).\n  Add it manually:  %s %s\n' "$host" "$ip" "$host" >&2
    return 1
  fi
  echo "==> Adding '${ip} ${host}' to /etc/hosts"
  printf '%s %s\n' "$ip" "$host" | run_privileged tee -a /etc/hosts >/dev/null
}

# Why: compose bind-mounts ./data/... and docker creates missing host dirs as
# root:root 755 — but postgres (uid 999) and valkey then fail to initialise in
# a dir they cannot write. Creating the dirs ourselves with permissive modes
# before the first `up` removes a class of "works on my machine" bugs. Existing
# directories are never touched.
ensure_data_dirs() {
  local rel target
  # Why: these mirror the `./data/...` bind mounts in compose.yaml exactly.
  # Note there is no `assets` entry: compose keeps assets in the named volume
  # `penpot_assets`, so a local dir would be dead weight.
  for rel in postgres/data valkey/data exports caddy; do
    target="$DATA_DIR/$rel"
    if [ ! -d "$target" ]; then
      mkdir -p "$target"
      chmod a+rwX "$target" 2>/dev/null || true
    fi
  done
}

# Why: the CA is generated by Caddy on first boot, so it is legitimately
# missing until then. Callers check this before touching the trust stores.
ca_cert_present() {
  [ -f "$CA_CERT" ]
}
