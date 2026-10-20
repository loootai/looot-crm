/**
 * The reservation functions in supabase/migrations, run on a throwaway local Postgres (initdb and
 * pg_ctl on PATH, no containers). Skips with a note when PostgreSQL is not installed. Concurrent
 * callers are real psql processes held at an advisory-lock barrier and released together.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const PG_BIN = ["/opt/homebrew/opt/postgresql@17/bin", ...(process.env.PATH ?? "").split(":")];
const bin = (name: string) => PG_BIN.map((d) => path.join(d, name)).find((p) => existsSync(p));
const have = Boolean(bin("initdb") && bin("pg_ctl") && bin("psql"));
if (!have) console.warn("budgetSql tests skipped: initdb, pg_ctl and psql are not on PATH. Install PostgreSQL to run them.");

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const A1 = "aaaaaaaa-0000-0000-0000-000000000001";
// The workspaces the team migration made for U1 and U2, read after the migrations ran.
let W1 = "";
let W2 = "";
const NOW = "2026-10-08T09:10:00Z";
const DAY = "2026-10-08T00:00:00Z";
const MONTH = "2026-10-01T00:00:00Z";

let dir = "";
let port = 0;
let pgBinDir = "";

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

const psqlArgs = (extra: string[]) => ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...extra];
const psql = (...extra: string[]) => execFileSync(path.join(pgBinDir, "psql"), psqlArgs(extra), { encoding: "utf8" }).trim();
const sql = (q: string) => psql("-c", q);

interface Reply {
  ok: boolean;
  reason?: string;
  scope?: string;
  daily: { budget: number; spent: number; reserved: number };
  monthly: { budget: number; spent: number; reserved: number };
}
const reserveSql = (ws: string, key: string, amount: number, now = NOW) =>
  `select public.reserve_budget('${ws}', '${A1}', '${key}', 'company.enrich', ${amount}, '${now}', '${DAY}', '${MONTH}', 900, 86400)`;
const reserve = (ws: string, key: string, amount: number, now = NOW) => JSON.parse(sql(reserveSql(ws, key, amount, now))) as Reply;
const setBudget = (ws: string, daily: number, monthly: number) => sql(`update public.settings set daily_budget_usd = ${daily}, monthly_budget_usd = ${monthly} where workspace_id = '${ws}'`);
const reservedSum = (ws: string) => Number(sql(`select coalesce(sum(amount_usd), 0) from public.budget_reservations where workspace_id = '${ws}' and state = 'reserved'`));
const reset = () => sql(`truncate public.budget_reservations; delete from public.runs; update public.settings set daily_budget_usd = 1, monthly_budget_usd = 100`);
const addRun = (key: string, cost: number, at: string) => sql(`insert into public.runs (workspace_id, owner_id, action_id, job_id, idempotency_key, status, cost_usd, created_at) values ('${W1}', '${U1}', '${A1}', 'company.enrich', '${key}', 'completed', ${cost}, '${at}')`);

/** Starts n psql clients that all wait on one advisory lock, then releases them together. */
async function race(n: number, query: (i: number) => string): Promise<string[]> {
  const holder = spawn(path.join(pgBinDir, "psql"), psqlArgs([]), { stdio: ["pipe", "ignore", "ignore"] });
  holder.stdin.write("select pg_advisory_lock(4242);\n");
  await new Promise((r) => setTimeout(r, 300));
  const clients = Array.from({ length: n }, (_, i) => {
    const p = spawn(path.join(pgBinDir, "psql"), psqlArgs(["-c", "select pg_advisory_lock_shared(4242)", "-c", query(i)]), { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    return new Promise<string>((resolve) => p.on("close", () => resolve(out.split("\n").filter((l) => l.startsWith("{")).join("\n"))));
  });
  // Wait until every client is blocked on the lock, then let them all go at once.
  for (let t = 0; t < 100; t++) {
    if (Number(sql("select count(*) from pg_locks where locktype = 'advisory' and not granted")) >= n) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  holder.stdin.write("select pg_advisory_unlock(4242);\n\\q\n");
  return Promise.all(clients);
}

describe.skipIf(!have)("reserve_budget on Postgres", () => {
  beforeAll(async () => {
    pgBinDir = path.dirname(bin("psql")!);
    dir = path.resolve(root, "..", ".pgtest-looot-crm");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    port = await freePort();
    execFileSync(path.join(pgBinDir, "initdb"), ["-D", path.join(dir, "db"), "-U", "postgres", "-A", "trust"], { stdio: "ignore" });
    execFileSync(path.join(pgBinDir, "pg_ctl"), ["-D", path.join(dir, "db"), "-o", `-p ${port} -k '' -c listen_addresses=127.0.0.1 -c max_connections=60`, "-l", path.join(dir, "log"), "-w", "start"], { stdio: "ignore" });
    psql("-f", path.join(root, "supabase/tests/auth_stub.sql"));
    for (const f of readdirSync(path.join(root, "supabase/migrations")).sort()) psql("-f", path.join(root, "supabase/migrations", f));
    W1 = sql(`select id from public.workspaces where created_by = '${U1}'`);
    W2 = sql(`select id from public.workspaces where created_by = '${U2}'`);
    sql(`insert into public.settings (workspace_id, owner_id) values ('${W1}', '${U1}'), ('${W2}', '${U2}')`);
    sql(`insert into public.actions (id, workspace_id, owner_id, action_key, kind, max_cost_usd) values ('${A1}', '${W1}', '${U1}', 'k1', 'company_enrich', 100)`);
  }, 60_000);

  afterAll(() => {
    if (!dir) return;
    spawnSync(path.join(pgBinDir, "pg_ctl"), ["-D", path.join(dir, "db"), "stop", "-m", "fast"], { stdio: "ignore" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("the default budgets are $5 a day and $50 a month", () => {
    expect(sql(`select daily_budget_usd || ',' || monthly_budget_usd from public.settings where workspace_id = '${W2}'`)).toBe("5.000000,50.000000");
  });

  it("ten simultaneous reservations of 0.4 against a 1.0 budget: exactly two succeed", async () => {
    reset();
    const outs = await race(10, (i) => reserveSql(W1, `k${i}`, 0.4));
    const replies = outs.map((o) => JSON.parse(o) as Reply);
    expect(replies).toHaveLength(10);
    expect(replies.filter((r) => r.ok)).toHaveLength(2);
    expect(replies.filter((r) => !r.ok && r.scope === "daily")).toHaveLength(8);
    expect(reservedSum(W1)).toBeCloseTo(0.8, 6);
  }, 60_000);

  it("two simultaneous reservations of 0.6 against a 1.0 budget: exactly one succeeds", async () => {
    reset();
    const outs = await race(2, (i) => reserveSql(W1, `two${i}`, 0.6));
    expect(outs.map((o) => (JSON.parse(o) as Reply).ok).sort()).toEqual([false, true]);
    expect(reservedSum(W1)).toBeCloseTo(0.6, 6);
  }, 60_000);

  it("the race harness can see a race: a read-then-write version lets several through", async () => {
    reset();
    sql(`create or replace function public.naive_reserve(p_ws uuid, p_key text, p_amount numeric) returns boolean language plpgsql as $$
      declare held numeric;
      begin
        select coalesce(sum(amount_usd), 0) into held from public.budget_reservations where workspace_id = p_ws and state = 'reserved';
        perform pg_sleep(0.3);
        if held + p_amount > 1 then return false; end if;
        insert into public.budget_reservations (workspace_id, action_id, idempotency_key, job_id, amount_usd, expires_at, hard_expires_at)
          values (p_ws, '${A1}', p_key, 'company.enrich', p_amount, now(), now());
        return true;
      end $$`);
    const outs = await race(4, (i) => `select jsonb_build_object('ok', public.naive_reserve('${W1}', 'n${i}', 0.6))`);
    expect(outs.filter((o) => (JSON.parse(o) as { ok: boolean }).ok).length).toBeGreaterThan(1);
    sql("drop function public.naive_reserve(uuid, text, numeric)");
  }, 60_000);

  it("refuses at the monthly budget and says which one", () => {
    reset();
    setBudget(W1, 100, 1.5);
    expect(reserve(W1, "m1", 1).ok).toBe(true);
    const r = reserve(W1, "m2", 1);
    expect(r).toMatchObject({ ok: false, scope: "monthly" });
    expect(r.monthly).toMatchObject({ budget: 1.5, reserved: 1, spent: 0 });
  });

  it("counts spent runs and holds together, and a day that rolled over does not count against the daily budget", () => {
    reset();
    addRun("old", 0.9, "2026-10-07T12:00:00Z");
    setBudget(W1, 1, 2);
    expect(reserve(W1, "d1", 1).ok).toBe(true); // yesterday's 0.9 is not in today
    expect(reserve(W1, "d2", 0.2)).toMatchObject({ ok: false, scope: "daily" });
    sql(`update public.budget_reservations set state = 'released'`);
    setBudget(W1, 5, 2);
    expect(reserve(W1, "d3", 1.2)).toMatchObject({ ok: false, scope: "monthly" }); // 0.9 spent this month + 1.2 > 2
    addRun("today", 0.8, NOW);
    setBudget(W1, 1, 2);
    expect(reserve(W1, "d4", 0.3)).toMatchObject({ ok: false, scope: "daily" });
    expect(reserve(W1, "d5", 0.2).ok).toBe(true);
  });

  it("refuses a repeated key and writes nothing", () => {
    reset();
    expect(reserve(W1, "dup", 0.1).ok).toBe(true);
    expect(reserve(W1, "dup", 0.1)).toMatchObject({ ok: false, reason: "duplicate" });
    expect(Number(sql(`select count(*) from public.budget_reservations where idempotency_key = 'dup'`))).toBe(1);
  });

  it("settle, release and hold change only a reserved row", () => {
    reset();
    for (const k of ["s", "r", "h"]) reserve(W1, k, 0.1);
    sql(`select public.settle_reservation('${W1}', 's', '${NOW}')`);
    sql(`select public.release_reservation('${W1}', 'r', '${NOW}')`);
    sql(`select public.hold_reservation('${W1}', 'h', 'run_abc')`);
    expect(sql(`select state || ':' || idempotency_key from public.budget_reservations order by idempotency_key`).split("\n")).toEqual(["reserved:h", "released:r", "settled:s"]);
    expect(sql(`select looot_run_id from public.budget_reservations where idempotency_key = 'h'`)).toBe("run_abc");
    // A settled row cannot be released afterwards, so a late release never frees money that was spent.
    sql(`select public.release_reservation('${W1}', 's', '${NOW}')`);
    expect(sql(`select state from public.budget_reservations where idempotency_key = 's'`)).toBe("settled");
    expect(reservedSum(W1)).toBeCloseTo(0.1, 6);
  });

  it("a pending reservation keeps counting until it is released", () => {
    reset();
    expect(reserve(W1, "p", 0.8).ok).toBe(true);
    sql(`select public.hold_reservation('${W1}', 'p', 'run_p')`);
    expect(reserve(W1, "q", 0.8)).toMatchObject({ ok: false, scope: "daily" });
    sql(`select public.release_reservation('${W1}', 'p', '${NOW}')`);
    expect(reserve(W1, "q", 0.8).ok).toBe(true);
  });

  it("stores the soft and hard expiry", () => {
    reset();
    reserve(W1, "e", 0.1);
    expect(sql(`select extract(epoch from expires_at - created_at)::int || ',' || extract(epoch from hard_expires_at - created_at)::int from public.budget_reservations where idempotency_key = 'e'`)).toBe("900,86400");
  });

  it("budget_status returns used, held and left without writing", () => {
    reset();
    addRun("u", 0.25, NOW);
    reserve(W1, "b", 0.5);
    const s = JSON.parse(sql(`select public.budget_status('${W1}', '${DAY}', '${MONTH}')`)) as Reply;
    expect(s.daily).toMatchObject({ budget: 1, spent: 0.25, reserved: 0.5 });
    expect(s.monthly).toMatchObject({ budget: 100, spent: 0.25, reserved: 0.5 });
  });

  it("another user cannot reserve against, read or release the workspace's budget", () => {
    reset();
    reserve(W1, "own", 0.1);
    const asU2 = (q: string) => spawnSync(path.join(pgBinDir, "psql"), psqlArgs(["-c", "set role authenticated", "-c", `select set_config('request.jwt.claim.sub', '${U2}', false)`, "-c", q]), { encoding: "utf8" });
    const r = asU2(reserveSql(W1, "theft", 0.1));
    expect(r.status === 0 && r.stdout.includes('"ok": true')).toBe(false);
    expect(asU2("select count(*) from public.budget_reservations").stdout.trim().split("\n").pop()).toBe("0");
    asU2(`select public.release_reservation('${W1}', 'own', '${NOW}')`);
    expect(sql(`select state from public.budget_reservations where idempotency_key = 'own'`)).toBe("reserved");
    expect(Number(sql(`select count(*) from public.budget_reservations where idempotency_key = 'theft'`))).toBe(0);
  });

  it("the owner can change the budget, and a budget cannot be negative", () => {
    expect(spawnSync(path.join(pgBinDir, "psql"), psqlArgs(["-c", `update public.settings set daily_budget_usd = -1 where workspace_id = '${W1}'`]), { encoding: "utf8" }).status).not.toBe(0);
    setBudget(W1, 7, 70);
    expect(sql(`select daily_budget_usd from public.settings where workspace_id = '${W1}'`)).toBe("7.000000");
  });

  it("a team member spends from the same workspace budget and cannot raise it", () => {
    reset();
    setBudget(W1, 1, 100);
    const as = (user: string, ...q: string[]) =>
      spawnSync(path.join(pgBinDir, "psql"), psqlArgs(["-c", "set role authenticated", "-c", `select set_config('request.jwt.claim.sub', '${user}', false)`, ...q.flatMap((x) => ["-c", x])]), { encoding: "utf8" });
    const U3 = "33333333-3333-3333-3333-333333333333";
    expect(as(U1, "select public.invite_member('user3@three.example')").stdout).toContain('"ok": true');
    expect(as(U3, "select public.join_workspace() ->> 'role'").stdout).toContain("member");
    expect(reserve(W1, "owner-half", 0.6).ok).toBe(true);
    // The member's call counts against the same daily budget: 0.6 held by the owner + 0.6 > 1.
    const r = as(U3, reserveSql(W1, "member-half", 0.6));
    expect(r.stdout).toContain('"scope": "daily"');
    expect(as(U3, `update public.settings set daily_budget_usd = 50 where workspace_id = '${W1}'`).stderr).toContain("only the workspace owner");
    expect(sql(`select daily_budget_usd from public.settings where workspace_id = '${W1}'`)).toBe("1.000000");
    expect(as(U3, reserveSql(W1, "member-small", 0.3)).stdout).toContain('"ok": true');
    expect(reservedSum(W1)).toBeCloseTo(0.9, 6);
  });
});