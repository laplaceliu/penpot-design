#!/usr/bin/env bash
# Why: canonical entrypoint. Brings the stack up detached, waits for the Caddy
# HTTPS probe to land, and prints the URLs the rest of the team needs. The
# probe is HTTPS (not the old plain HTTP on 9001) because Penpot 2.18's
# `allowRunFromHttpSchema` check and other secure-context APIs require a secure
# origin.

# Why: these scripts use bash arrays and ${BASH_SOURCE}. Re-exec under bash when
# someone starts them with `sh script.sh` (dash on Debian/Ubuntu) so they behave
# identically no matter how they are invoked.
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"

set -euo pipefail

# Why: resolve this script's real location (following symlinks, e.g. a copy
# linked into ~/bin) before sourcing lib.sh — a symlinked invocation would
# otherwise look for lib.sh next to the link instead of inside the checkout.
# shellcheck source=lib.sh
_lib_src="${BASH_SOURCE[0]}"
while [ -L "$_lib_src" ]; do
  _lib_link="$(readlink "$_lib_src")"
  case "$_lib_link" in /*) _lib_src="$_lib_link";; *) _lib_src="$(dirname -- "$_lib_src")/$_lib_link";; esac
done
source "$(cd -- "$(dirname -- "$_lib_src")" >/dev/null 2>&1 && pwd -P)/lib.sh"

require_docker

ensure_host_entry "$HOST_NAME" 127.0.0.1 || true
ensure_data_dirs

echo "==> Starting services (run ./scripts/prewarm.sh first on a fresh host)"
compose up -d --no-build --remove-orphans

echo
echo "Waiting for Caddy to terminate TLS at https://${HOST_NAME} ..."

# Why: --resolve pins the probe at the loopback address we just put in
# /etc/hosts, so a stale DNS answer or a corporate proxy cannot make the
# health check flap on someone else's machine.
PROBE_FLAGS=(--silent --fail --insecure --max-time 5 --resolve "${HOST_NAME}:443:127.0.0.1")
ATTEMPTS=60
until curl "${PROBE_FLAGS[@]}" "https://${HOST_NAME}/api/main/methods/get-enabled-flags" >/dev/null 2>&1 \
   || curl "${PROBE_FLAGS[@]}" "https://${HOST_NAME}/" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS - 1))
  if [ "$ATTEMPTS" -le 0 ]; then
    echo "ERROR: Caddy did not respond on https://${HOST_NAME} within ~120s."
    echo "  ./scripts/tail-logs.sh penpot-caddy"
    echo "  ./scripts/tail-logs.sh penpot-frontend"
    exit 1
  fi
  sleep 2
done

echo
echo "Penpot is up."
echo "  URL:        https://${HOST_NAME}/"
echo "  MCP stream: https://${HOST_NAME}/mcp/stream"
echo
# Why: a brand-new deployment has an EMPTY database — the credentials below do
# not exist until create-profile.sh has run. Saying so here (instead of just
# printing them) is what stops "up.sh said the login is X but it doesn't work".
echo "  No login exists yet on a fresh database. Create one with:"
echo "    ./scripts/create-profile.sh"
echo "  (defaults to admin@penpot.local, prompts for the password)"
echo
echo "First-time trust note:"
echo "  The leaf cert is signed by Caddy's internal CA. To dismiss the"
echo "  browser warning, run: ./scripts/trust-ca.sh"
echo "  Node.js / Electron MCP clients need the same script and a restart."
echo
echo "  (Change the password under /auth/profile once logged in.)"
