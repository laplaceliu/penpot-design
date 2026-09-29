#!/usr/bin/env bash
# Why: bring the stack down cleanly. Differs from a hard `docker compose down`
# in that it preserves the volumes (postgres data, valkey, assets, exports) by
# default; pass --volumes for a full wipe.

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

WIPE=0
case "${1:-}" in
  --volumes|-v)
    WIPE=1
    ;;
  ""|--help|-h)
    ;;
  *)
    echo "Usage: $(basename "$0") [--volumes]" >&2
    echo "  (no flag)   stop containers, keep all data in ./data" >&2
    echo "  --volumes   stop containers AND delete named volumes (irreversible)" >&2
    exit 1
    ;;
esac

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  echo "Usage: $(basename "$0") [--volumes]"
  echo "  (no flag)   stop containers, keep all data in ./data"
  echo "  --volumes   stop containers AND delete named volumes (irreversible)"
  exit 0
fi

if [ "$WIPE" = "1" ]; then
  echo "==> Stopping services and removing volumes"
  compose down -v --remove-orphans
  echo "==> Pruning dangling images"
  docker image prune -f
else
  echo "==> Stopping services (data in ./data preserved)"
  compose down --remove-orphans
fi
