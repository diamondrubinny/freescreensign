#!/usr/bin/env bash
# Makes an account an operator of this installation (the server status page), or removes it.
# Only from the server itself: the web interface cannot grant this.
#
#   ./set-operator.sh EMAIL            make EMAIL an operator
#   ./set-operator.sh EMAIL --remove   remove EMAIL from the operators
#   ./set-operator.sh --list           list the operators
#
# The account must exist; the status page also needs its two-step verification on.
#
# License: AGPL-3.0-only. Part of Rubinny. See docs/OPERATIONS.md.

set -euo pipefail
cd "$(dirname "$0")"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# Values reach SQL only as psql variables (:'email'), never inside the SQL text.
psql_run() {
  docker compose exec -T postgres sh -c \
    'psql -Atq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
}

[ -f .env ] || die "no .env here: run this in the deploy folder of an installation"
[ $# -ge 1 ] || die "usage: ./set-operator.sh EMAIL [--remove] | --list"

case "$1" in
  -h | --help)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  --list)
    psql_run <<'SQL'
SELECT email FROM users WHERE is_operator AND deleted_at IS NULL ORDER BY email;
SQL
    exit 0
    ;;
esac

EMAIL="$1"
VALUE=true
if [ "${2:-}" = --remove ]; then VALUE=false; elif [ $# -gt 1 ]; then die "unknown option: $2"; fi
if [ ${#EMAIL} -gt 254 ] || [[ "$EMAIL" != *@* ]]; then die "not an e-mail address: $EMAIL"; fi

CHANGED="$(psql_run -v email="$EMAIL" -v value="$VALUE" <<'SQL'
UPDATE users SET is_operator = :'value'::boolean, updated_at = now()
WHERE lower(email) = lower(:'email') AND deleted_at IS NULL
RETURNING id;
SQL
)"
[ -n "$CHANGED" ] || die "no account with this e-mail address"
if [ "$VALUE" = true ]; then
  printf 'Done: %s is an operator (the status page needs two-step verification).\n' "$EMAIL"
else
  printf 'Done: %s is no longer an operator.\n' "$EMAIL"
fi
