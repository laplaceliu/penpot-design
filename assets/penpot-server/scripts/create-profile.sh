#!/usr/bin/env bash
# Why: a fresh deployment starts with an EMPTY database — zero rows in the
# `profile` table — so the credentials printed by up.sh do not exist yet and
# the login form rejects them. Penpot ships `manage.py` inside the backend
# image, but it has to run inside that container (it talks to the backend's
# prepl port, which is not published to the host). This script wraps the whole
# sequence: wait for the backend, create the account (idempotently), then prove
# the credentials work by calling the real login endpoint.
#
# Why it is idempotent by default and does NOT reset passwords:
#   `manage.py create-profile` on an existing email fails with
#   "email already exists" — and `-f`/--force does NOT change that. So a plain
#   create is not re-runnable. We therefore check first and treat "already
#   exists" as success. Silently resetting the password of a live account would
#   be far worse than reporting that it already exists, so changing an existing
#   password requires an explicit --force.

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

BACKEND_SERVICE="penpot-backend"
# Why: only used for the read-only "is this email taken?" lookups. The
# credentials come from compose.yaml's penpot-postgres service, so they are
# shared with the running stack rather than duplicated here.
POSTGRES_SERVICE="penpot-postgres"
DB_USER="penpot"
DB_NAME="penpot"
# Why: path inside the penpotapp/backend image. Pinned here (not discovered) so
# a wrong image version produces a clear error from this script rather than a
# bare "No such file or directory" from deep inside docker exec.
MANAGE_PY="/opt/penpot/backend/manage.py"

EMAIL="${PENPOT_ADMIN_EMAIL:-admin@penpot.local}"
FULLNAME="${PENPOT_ADMIN_FULLNAME:-Admin}"
# Why: intentionally empty by default. Passing a password on argv leaks it into
# `ps` output and shell history, so when none is supplied we prompt for it.
PASSWORD="${PENPOT_ADMIN_PASSWORD:-}"
FORCE=0
VERIFY=1

usage() {
  cat <<'EOF'
Usage: create-profile.sh [options]

Create (or verify) a Penpot login account in the running stack.

Options:
  -e, --email EMAIL      login email         (default: admin@penpot.local)
  -p, --password PASS    password            (default: prompt securely)
  -n, --fullname NAME    display name        (default: Admin)
  -f, --force            reset the password of an EXISTING account
      --no-verify        skip the login check at the end
  -h, --help             show this help

Environment alternatives (useful for CI / non-interactive use):
  PENPOT_ADMIN_EMAIL, PENPOT_ADMIN_PASSWORD, PENPOT_ADMIN_FULLNAME

Behaviour:
  * account missing            -> created
  * account exists             -> success, password left UNTOUCHED
  * account exists + --force   -> password reset to the given one

Examples:
  ./scripts/create-profile.sh                       # prompt for the password
  ./scripts/create-profile.sh -p penpot123          # non-interactive
  ./scripts/create-profile.sh -e me@penpot.local -f # reset an existing account
EOF
}

# Why: `2>/dev/null` guards the common "flag as the last argument" mistake.
# Using ${2:?msg} instead would abort with a raw bash line-number error, which
# tells the user nothing about which flag they left dangling.
need_value() { # $1 = flag name, $2 = value (may be empty), $3 = remaining argc
  if [ "$3" -lt 2 ] || [ -z "$2" ]; then
    echo "ERROR: $1 needs a value." >&2
    echo "  Try: $1 \"<value>\"   (run with --help for the full usage)" >&2
    exit 1
  fi
  # Why: `-p -f` is nearly always a typo (a flag where the value should be), and
  # swallowing `-f` as the password silently produces an account nobody can log
  # into. A dash-prefixed *password* is legal though, so only reject when the
  # value is exactly one of our own flags.
  case "$2" in
    -e|--email|-p|--password|-n|--fullname|-f|--force|--no-verify|-h|--help)
      echo "ERROR: $1 got '$2', which looks like another flag, not a value." >&2
      echo "  Quote it if you really meant it:  $1 \"$2\"" >&2
      exit 1
      ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    -e|--email)    need_value "$1" "${2:-}" $#; EMAIL="$2"; shift 2 ;;
    -p|--password) need_value "$1" "${2:-}" $#; PASSWORD="$2"; shift 2 ;;
    -n|--fullname) need_value "$1" "${2:-}" $#; FULLNAME="$2"; shift 2 ;;
    -f|--force)    FORCE=1; shift ;;
    --no-verify)   VERIFY=0; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; echo >&2; usage >&2; exit 1 ;;
  esac
done

require_docker

# Why: manage.py reaches the backend over its prepl port (6063), which is bound
# to localhost *inside* the container and never published. So the script must
# both have the backend container up AND the prepl listener accepting — a
# container that is merely "Up" can still be mid-migration, and manage.py would
# then fail with a confusing connection error.
if ! compose ps -q "$BACKEND_SERVICE" >/dev/null 2>&1 || [ -z "$(compose ps -q "$BACKEND_SERVICE" 2>/dev/null)" ]; then
  echo "ERROR: the '$BACKEND_SERVICE' container is not running." >&2
  echo "  Start the stack first:  ./scripts/up.sh" >&2
  exit 1
fi

echo "==> Waiting for the backend prepl port to accept connections"
PREPL_OK=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if compose exec -T "$BACKEND_SERVICE" bash -c \
       'bash -c "exec 3<>/dev/tcp/localhost/6063" 2>/dev/null' >/dev/null 2>&1; then
    PREPL_OK=1
    break
  fi
  sleep 2
done
if [ "$PREPL_OK" != "1" ]; then
  echo "ERROR: prepl on $BACKEND_SERVICE:6063 never became ready." >&2
  echo "  Check the backend is healthy:  ./scripts/tail-logs.sh $BACKEND_SERVICE" >&2
  exit 1
fi

if [ -z "$PASSWORD" ]; then
  # Why: read -s keeps the password off the screen and out of shell history.
  # Only prompt on a real terminal; in a pipe/CI context there is nobody to
  # answer, so fail with actionable guidance instead of hanging forever.
  if [ -t 0 ]; then
    printf 'Password for %s: ' "$EMAIL"
    read -rs PASSWORD
    printf '\n'
  else
    echo "ERROR: no password given and stdin is not a terminal." >&2
    echo "  Use -p <password> or set PENPOT_ADMIN_PASSWORD (e.g. in CI)." >&2
    exit 1
  fi
fi

if [ -z "$PASSWORD" ]; then
  echo "ERROR: password must not be empty." >&2
  exit 1
fi

# Why: the password is carried into the container through an environment
# variable and expanded inside double quotes there. These four characters would
# break out of that quoting (and a `"` could inject extra manage.py flags), so
# reject them up front with an explanation rather than failing obscurely — or
# silently truncating — inside the container.
case "$PASSWORD" in
  *'"'*|*'$'*|*'`'*|*'\'*)
    echo "ERROR: the password contains one of  \" \$ \` \\  — characters that" >&2
    echo "  cannot be passed through manage.py's command line safely." >&2
    echo "  Pick a different password." >&2
    exit 1
    ;;
esac

# Why: manage.py talks to prepl, so run it inside the backend container. The
# email / password / fullname travel as environment variables, NOT interpolated
# into the command string — that keeps a quote or `$` in a password from
# breaking out of the quoting, and keeps the password out of `ps` output on
# the host (it is only ever an argv entry inside the short-lived container).
# We always pass -n and -p: without them the tool prompts on stdin, and with -T
# (no TTY) that raises EOFError and exits 1 with a traceback instead of a
# useful message.
manage() { # "$1" = arguments for manage.py, already single-quoted by the caller
  compose exec -T \
    -e PP_EMAIL="$EMAIL" -e PP_PASSWORD="$PASSWORD" -e PP_FULLNAME="$FULLNAME" \
    "$BACKEND_SERVICE" bash -c \
    "cd /opt/penpot/backend && python3 '$MANAGE_PY' $1"
}

# Why: prints `active`, `deleted` or `missing`. This queries Postgres directly
# rather than shelling out to `manage.py search-profile`, because that command's
# text table cannot be parsed reliably:
#   * it exits 0 whether or not it finds anything, so the exit code says nothing;
#   * counting columns to spot the `deletedAt` field breaks the moment the
#     fullname contains a space (awk sees extra fields);
#   * and one email can legitimately have SEVERAL rows — Penpot deletes SOFTLY
#     (it only stamps `deleted_at`) and `create-profile` inserts a new row
#     instead of reviving the old one, so delete+recreate yields two rows.
# A `where deleted_at is null` count is exact under all of the above.
#
# Why the SQL goes in over stdin with a psql variable (`:'email'`) instead of
# being interpolated into the query text: psql quotes and escapes the value, so
# an apostrophe in the email cannot break out and inject SQL.
profile_state() {
  local n
  n="$(printf "select count(*) from profile where email = :'email' and deleted_at is null;\n" \
        | compose exec -T "$POSTGRES_SERVICE" \
            psql -U "$DB_USER" -d "$DB_NAME" -v email="$EMAIL" -tA 2>/dev/null \
        | tr -d '[:space:]')"
  case "${n:-0}" in
    ''|*[!0-9]*) n=0 ;;
  esac
  if [ "$n" -gt 0 ]; then
    printf 'active\n'
    return
  fi
  # Why: distinguish "never existed" from "exists but soft-deleted" purely so
  # we can print a clearer message; both are safe to (re)create.
  n="$(printf "select count(*) from profile where email = :'email';\n" \
        | compose exec -T "$POSTGRES_SERVICE" \
            psql -U "$DB_USER" -d "$DB_NAME" -v email="$EMAIL" -tA 2>/dev/null \
        | tr -d '[:space:]')"
  case "${n:-0}" in
    ''|*[!0-9]*) n=0 ;;
  esac
  if [ "$n" -gt 0 ]; then
    printf 'deleted\n'
  else
    printf 'missing\n'
  fi
}

# Why: drives how a failed login check is reported. If we just created or reset
# the account, a failed login means WE broke something -> hard error. If the
# account already existed and we deliberately left it alone, a failed login only
# means the password the caller supplied differs from the stored one -> that is
# worth reporting, but it is not a failure of this script, so exit 0.
CHANGED=0

echo
STATE="$(profile_state)"
case "$STATE" in
  active)
    if [ "$FORCE" = "1" ]; then
      echo "==> Account '$EMAIL' exists — resetting its password (--force)"
      manage 'update-profile -e "$PP_EMAIL" -p "$PP_PASSWORD"' >/dev/null
      echo "    password updated"
      CHANGED=1
    else
      echo "==> Account '$EMAIL' already exists — nothing to do."
      echo "    Its password was NOT changed. To reset it, re-run with --force."
      echo "    (A fresh database starts out empty; this account came from the"
      echo "     existing ./data volume, which is where all your files live too.)"
    fi
    ;;
  deleted|missing)
    if [ "$STATE" = "deleted" ]; then
      # Why: recreating is the only way to reclaim a soft-deleted address.
      echo "==> '$EMAIL' exists but is soft-deleted — recreating it"
    fi
    echo "==> Creating account '$EMAIL'"
    # --skip-tutorial / --skip-walkthrough: skip the first-run onboarding modals
    # so an automation/CI account can log straight in.
    out="$(manage 'create-profile -e "$PP_EMAIL" -p "$PP_PASSWORD" -n "$PP_FULLNAME" --skip-tutorial --skip-walkthrough' 2>&1)" \
      || { echo "$out" >&2; echo "ERROR: failed to create '$EMAIL'." >&2; exit 1; }
    echo "$out" | sed 's/^/    /'
    CHANGED=1
    ;;
  *)
    echo "ERROR: unexpected profile state '$STATE'." >&2
    exit 1
    ;;
esac

if [ "$VERIFY" != "1" ]; then
  echo
  echo "Done (verification skipped)."
  echo "  URL:      https://${HOST_NAME}/"
  echo "  Username: ${EMAIL}"
  exit 0
fi

# Why: everything above proves manage.py accepted our input. Only this proves
# the account actually works — it exercises the same RPC the browser login form
# calls, through Caddy, so a broken route or a wrong password shows up here
# instead of as a failed login in the browser.
echo
echo "==> Verifying the credentials against the real login endpoint"

# Why: --cacert pins the check to THIS deployment's CA instead of relying on the
# host trust store. Without it this step fails on a machine that has not run
# trust-ca.sh, which would look like an account problem when it is not one.
PROBE=(--cacert "$CA_CERT" --resolve "${HOST_NAME}:443:127.0.0.1" --silent --max-time 15)
if [ ! -f "$CA_CERT" ]; then
  echo "    (CA not found at $CA_CERT — falling back to the host trust store)"
  PROBE=(--resolve "${HOST_NAME}:443:127.0.0.1" --silent --max-time 15)
fi

# Why: the payload is Transit, not JSON — Penpot's RPC layer only parses Transit.
BODY="[\"^ \",\"~:email\",\"${EMAIL}\",\"~:password\",\"${PASSWORD}\"]"
CODE="$(curl "${PROBE[@]}" -o /tmp/penpot-login-out.$$ -w '%{http_code}' \
         -X POST "https://${HOST_NAME}/api/rpc/command/login-with-password" \
         -H 'content-type: application/transit+json' --data "$BODY" 2>/dev/null || echo ERR)"
RESP="$(cat /tmp/penpot-login-out.$$ 2>/dev/null || true)"
rm -f /tmp/penpot-login-out.$$

VERIFY_OK=0
if [ "$CODE" = "200" ] && printf '%s' "$RESP" | grep -q '~:auth-backend'; then
  echo "    login OK (HTTP 200)"
  VERIFY_OK=1
elif [ "$CHANGED" != "1" ]; then
  # Why: nothing was modified, so this is a report about the password the caller
  # supplied, not a failure of the script. Exit 0 — the account does exist.
  echo "    NOTE: the password you supplied is NOT this account's current password."
  echo "          The account was left untouched. To set it, re-run with --force."
  echo "          (HTTP ${CODE})"
else
  echo "ERROR: login check failed (HTTP ${CODE}) even though the account was just" >&2
  echo "  created/updated — something is wrong beyond the credentials." >&2
  echo "  Response: ${RESP}" >&2
  echo "  Check the backend logs:  ./scripts/tail-logs.sh $BACKEND_SERVICE" >&2
  exit 1
fi

echo
if [ "$VERIFY_OK" != "1" ]; then
  # Why: only reachable when the account was left untouched and the supplied
  # password did not match it. Say so plainly instead of printing a credential
  # block for a password that does not work.
  echo "Account '$EMAIL' exists, but NOT with the password you supplied."
  echo "  Reset it with:  ./scripts/create-profile.sh -e '$EMAIL' -f -p '<new-password>'"
  exit 0
fi

echo "Penpot login ready."
echo "  URL:      https://${HOST_NAME}/"
echo "  Username: ${EMAIL}"
echo "  Password: (the one you supplied)"
if [ "$EMAIL" = "admin@penpot.local" ] && [ "$PASSWORD" = "penpot123" ]; then
  echo
  echo "  WARNING: this is the well-known default password — change it under"
  echo "  /auth/profile once you are logged in."
fi
