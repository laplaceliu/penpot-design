#!/usr/bin/env bash
# Why: shortcut to follow one service's logs without remembering compose flags
# or the exact service names.

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

SERVICE="${1:-penpot-backend}"

case "$SERVICE" in
  --help|-h)
    echo "Usage: $(basename "$0") [service]"
    echo
    echo "Available services:"
    compose config --services | sed 's/^/  /'
    exit 0
    ;;
esac

# Why: a typo'd service name otherwise fails deep inside compose with an
# unhelpful error; listing the real names (from the compose file itself, not a
# hard-coded list that can drift) is cheaper.
if ! compose config --services 2>/dev/null | grep -qx "$SERVICE"; then
  echo "ERROR: unknown service '$SERVICE'. Available services:" >&2
  compose config --services 2>/dev/null | sed 's/^/  /' >&2
  exit 1
fi

exec docker compose -f "$COMPOSE_FILE" logs --tail "${LINES:-100}" -f "$SERVICE"
