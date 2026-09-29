#!/usr/bin/env bash
# Why: shorten the time-to-ready on the first `up.sh` by pre-pulling every
# image the stack needs. Without this the postgres-migration step eats 5+
# minutes on a fresh host and looks like a hang.

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

# Why: keep this in sync with compose.yaml — both default to the same value, and
# both accept PENPOT_IMAGE_TAG so a version bump is a one-line change (in .env).
TAG="${PENPOT_IMAGE_TAG:-2.17}"

images=(
  "postgres:15-alpine"
  "valkey/valkey:7-alpine"
  "caddy:2-alpine"
  "penpotapp/frontend:${TAG}"
  "penpotapp/backend:${TAG}"
  "penpotapp/exporter:${TAG}"
  "penpotapp/mcp:${TAG}"
)

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found in PATH." >&2
  exit 1
fi

echo "Pre-pulling ${#images[@]} images (tag=${TAG})..."

FAILED=0
for image in "${images[@]}"; do
  echo "==> docker pull ${image}"
  # Why: one unreachable registry should not abort the whole warm-up — report
  # it and keep going so the rest of the images are cached.
  docker pull --quiet "$image" || {
    echo "WARNING: failed to pull ${image}"
    FAILED=1
  }
done

echo
if [ "$FAILED" = "0" ]; then
  echo "All images cached locally."
else
  echo "Some images could not be pulled — see the warnings above."
fi
echo "Next: ./scripts/up.sh"

exit "$FAILED"
