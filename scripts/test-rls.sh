#!/usr/bin/env bash
# Proves row level security on a throwaway Postgres: user 2 sees, changes and forges nothing of
# user 1 in any of the 11 tables. Needs initdb, pg_ctl and psql on PATH. Touches no Supabase project.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null 2>&1 || { echo "SKIPPED: $bin not found. Install PostgreSQL to run this check."; exit 0; }
done
dir="$(mktemp -d)"
port="${PGPORT_TEST:-55441}"
cleanup() { pg_ctl -D "$dir/db" stop -m fast >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT
initdb -D "$dir/db" -U postgres -A trust >/dev/null
pg_ctl -D "$dir/db" -o "-p $port -k '' -c listen_addresses=127.0.0.1" -l "$dir/log" -w start >/dev/null
p() { psql -X -q -h 127.0.0.1 -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
p -f "$root/supabase/tests/auth_stub.sql"
for f in "$root"/supabase/migrations/*.sql; do p -f "$f"; done
out="$(p -At -f "$root/supabase/tests/rls_check.sql" 2>&1 | sed -E "s/^psql:.*NOTICE:  //")"
echo "$out"
fail() { echo "RLS check FAILED: $1"; exit 1; }
tables="companies contacts deals deal_contacts activities actions runs signals signal_baselines score_history settings"
for t in $tables; do
  [[ "$out" == *"user2 sees 0 rows in $t"* ]] || fail "user 2 can read $t"
  [[ "$out" == *"user2 updated 0 rows in $t"* ]] || fail "user 2 can update $t"
  [[ "$out" == *"user2 deleted 0 rows in $t"* ]] || fail "user 2 can delete $t"
  [[ "$out" == *"forged owner refused: $t"* ]] || fail "forged owner_id accepted in $t"
  [[ "$out" == *"user1 sees 1 rows in $t"* ]] || fail "user 1 lost a row in $t"
done
[[ "$out" == *"actual above max refused"* ]] || fail "actual_usd above max_cost_usd was accepted"
[[ "$out" == *"cross-owner reference refused"* ]] || fail "cross-owner reference accepted"
[[ "$out" == *"anon refused"* ]] || fail "anon can read"
[[ "$out" == *"tables without rls|0"* ]] || fail "a table has no row level security"
[[ "$out" == *"tables without forced rls|0"* ]] || fail "a table does not force row level security"
[[ "$out" == *"public tables|11"* ]] || fail "expected 11 tables"
echo "RLS check passed: 11 tables"
