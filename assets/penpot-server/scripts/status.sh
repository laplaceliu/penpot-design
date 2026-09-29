#!/usr/bin/env bash
# Why: one-shot status probe — checks both the compose service state and the
# public health endpoint, so a glance answers "is the stack usable?".

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

echo "==> Deployment"
echo "  compose file: $COMPOSE_FILE"
echo "  data dir:     $DATA_DIR"
echo "  host name:    $HOST_NAME"

echo
echo "==> Container status"
compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'

echo
echo "==> HTTPS probes"
# Why: --resolve keeps the probe pinned to loopback, matching /etc/hosts, so
# the result reflects this deployment and not whatever DNS the host happens to
# use. -k is intentional: the leaf is signed by Caddy's internal CA, which is
# only trusted after ./scripts/trust-ca.sh.
for path in / /api/main/methods/get-enabled-flags; do
  url="https://${HOST_NAME}${path}"
  code=$(curl --silent --output /dev/null --write-out '%{http_code}' --insecure \
              --max-time 5 --resolve "${HOST_NAME}:443:127.0.0.1" "$url" 2>/dev/null || echo "ERR")
  echo "  ${url} -> ${code}"
done

echo
echo "==> Certificate"
if ca_cert_present; then
  echo "  CA cert: $CA_CERT"
  if command -v openssl >/dev/null 2>&1; then
    openssl x509 -in "$CA_CERT" -noout -subject -dates 2>/dev/null | sed 's/^/  /' || true
  fi
else
  echo "  CA cert not generated yet (start the stack with ./scripts/up.sh)"
fi

echo
echo "==> Disk usage (data dir)"
du -sh "$DATA_DIR"/* 2>/dev/null || echo "  (empty)"
