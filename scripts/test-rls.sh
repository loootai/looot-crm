#!/usr/bin/env bash
# Proves row level security on a throwaway Postgres: user 2 sees, changes and forges nothing of
# user 1 in any of the 12 data tables, and a team member invited by user 1 sees and edits user 1's rows. Needs initdb, pg_ctl and psql on PATH. Touches no Supabase project.
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
tables="companies contacts deals deal_contacts activities actions runs signals signal_baselines score_history settings budget_reservations"
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
[[ "$out" == *"public tables|14"* ]] || fail "expected 14 tables"
for t in $tables; do
  [[ "$out" == *"member sees 1 rows in $t"* ]] || fail "a team member cannot read $t"
done
for m in "owner invited a member" "second invite says already" "invalid invite refused" "owner invited an email that has not signed up" \
  "member of a workspace with data refused" "member joined" "member sees 3 members" "member added a contact to a shared company" \
  "member budget change refused" "member invite refused" "direct member insert refused" "forged workspace refused" \
  "outsider sees no team rows" "unconfirmed join refused" "owner cannot remove themselves" "owner removed a member" \
  "removed member rows stay" "removed member sees nothing" "removed member starts a new workspace" "anon join refused"; do
  [[ "$out" == *"$m"* ]] || fail "team: expected \"$m\""
done

# Upgrade: a database with 0.1.5 data takes the team migration and keeps every row.
pg_ctl -D "$dir/db" stop -m fast >/dev/null
rm -rf "$dir/db"
initdb -D "$dir/db" -U postgres -A trust >/dev/null
pg_ctl -D "$dir/db" -o "-p $port -k '' -c listen_addresses=127.0.0.1" -l "$dir/log" -w start >/dev/null
p -f "$root/supabase/tests/auth_stub.sql"
team="$root/supabase/migrations/20261016000000_team_workspaces.sql"
for f in "$root"/supabase/migrations/*.sql; do [[ "$f" < "$team" ]] && p -f "$f"; done
p -f "$root/supabase/tests/upgrade_before.sql"
for f in "$root"/supabase/migrations/*.sql; do [[ "$f" < "$team" ]] || p -f "$f"; done
up="$(p -At -f "$root/supabase/tests/upgrade_after.sql" 2>&1 | sed -E "s/^psql:.*NOTICE:  //")"
echo "$up"
[[ "$up" == *"upgrade kept user1 rows"* ]] || fail "upgrade lost user 1 rows or budget"
[[ "$up" == *"upgrade kept user2 apart"* ]] || fail "upgrade mixed users"
[[ "$up" == *"rows without workspace|0"* ]] || fail "upgrade left rows without a workspace"
echo "RLS check passed: 14 tables, teams, upgrade from 0.1.5"
