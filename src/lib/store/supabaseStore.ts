import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TableName, Tables } from "../types";
import { dayStart, monthStart, RESERVATION_HARD_SECONDS, RESERVATION_SOFT_SECONDS, windowOf, type BudgetScope, type BudgetStatus, type Reservation, type ReserveRequest, type ReserveResult } from "../budget";
import type { Store } from "./types";

type Window = { budget: number | string; spent: number | string; reserved: number | string };
const statusOf = (d: { daily: Window; monthly: Window }): BudgetStatus => ({
  daily: windowOf(Number(d.daily.budget), Number(d.daily.spent), Number(d.daily.reserved)),
  monthly: windowOf(Number(d.monthly.budget), Number(d.monthly.spent), Number(d.monthly.reserved)),
});

const PAGE = 1000;
const NUMERIC: Partial<Record<TableName, string[]>> = {
  actions: ["estimate_usd", "max_cost_usd", "actual_usd"],
  runs: ["cap_usd", "cost_usd"],
  settings: ["action_ceiling_usd", "daily_budget_usd", "monthly_budget_usd"],
  deals: ["amount_cents", "position"],
};

/** Postgres numeric and bigint columns arrive as strings. Turn them back into numbers. */
function fix<T extends TableName>(table: T, row: Record<string, unknown>): Tables[T] {
  for (const col of NUMERIC[table] ?? []) if (typeof row[col] === "string") row[col] = Number(row[col]);
  return row as unknown as Tables[T];
}

/** Store on Supabase. The client acts as the signed-in user, so row level security scopes every query to their rows. */
export class SupabaseStore implements Store {
  readonly demo = false;
  constructor(
    private readonly db: SupabaseClient,
    private readonly ownerId: string,
  ) {}

  async all<T extends TableName>(table: T, where?: Partial<Tables[T]>): Promise<Tables[T][]> {
    const out: Tables[T][] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.db.from(table).select("*").order("created_at", { ascending: true }).order("id", { ascending: true });
      for (const [k, v] of Object.entries(where ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v as string);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []).map((r) => fix(table, r)));
      if (!data || data.length < PAGE) return out;
    }
  }

  async get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null> {
    const { data, error } = await this.db.from(table).select("*").eq("id", id).maybeSingle();
    if (error) {
      // An id that is not a uuid is simply not found.
      if (error.code === "22P02") return null;
      throw new Error(error.message);
    }
    return data ? fix(table, data) : null;
  }

  async insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]> {
    if (!rows.length) return [];
    const { data, error } = await this.db.from(table).insert(rows as never[]).select("*");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => fix(table, r));
  }

  async insertIgnore<T extends TableName>(table: T, rows: Partial<Tables[T]>[], conflict: (keyof Tables[T])[]): Promise<Tables[T][]> {
    if (!rows.length) return [];
    const { data, error } = await this.db
      .from(table)
      .upsert(rows as never[], { onConflict: ["owner_id", ...conflict.map(String)].join(","), ignoreDuplicates: true })
      .select("*");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => fix(table, r));
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T] | null> {
    const { data, error } = await this.db.from(table).update(patch as never).eq("id", id).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fix(table, data) : null;
  }

  async remove(table: TableName, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const { data, error } = await this.db.from(table).delete().in("id", ids).select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async reserveBudget(req: ReserveRequest): Promise<ReserveResult> {
    const { data, error } = await this.db.rpc("reserve_budget", {
      p_owner: this.ownerId,
      p_action: req.actionId,
      p_key: req.key,
      p_job: req.jobId,
      p_amount: req.amountUsd,
      p_now: req.now.toISOString(),
      p_day_start: dayStart(req.now).toISOString(),
      p_month_start: monthStart(req.now).toISOString(),
      p_soft_seconds: RESERVATION_SOFT_SECONDS,
      p_hard_seconds: RESERVATION_HARD_SECONDS,
    });
    if (error) throw new Error(`reserve budget: ${error.message}`);
    const r = data as { ok: boolean; reason?: string; scope?: BudgetScope; daily: Window; monthly: Window };
    const budget = statusOf(r);
    if (r.ok) return { ok: true, budget };
    if (r.reason === "duplicate") return { ok: false, reason: "duplicate" };
    return { ok: false, reason: "budget", scope: r.scope ?? "daily", budget };
  }

  async settleReservation(key: string, at: Date): Promise<void> {
    const { error } = await this.db.rpc("settle_reservation", { p_owner: this.ownerId, p_key: key, p_now: at.toISOString() });
    if (error) throw new Error(`settle reservation: ${error.message}`);
  }

  async releaseReservation(key: string, at: Date): Promise<void> {
    const { error } = await this.db.rpc("release_reservation", { p_owner: this.ownerId, p_key: key, p_now: at.toISOString() });
    if (error) throw new Error(`release reservation: ${error.message}`);
  }

  async holdReservation(key: string, loootRunId: string): Promise<void> {
    const { error } = await this.db.rpc("hold_reservation", { p_owner: this.ownerId, p_key: key, p_looot_run_id: loootRunId });
    if (error) throw new Error(`hold reservation: ${error.message}`);
  }

  async listExpiredReservations(at: Date): Promise<Reservation[]> {
    const { data, error } = await this.db.from("budget_reservations").select("*").eq("state", "reserved").lte("expires_at", at.toISOString()).order("created_at", { ascending: true }).limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      key: r.idempotency_key,
      actionId: r.action_id,
      jobId: r.job_id,
      amountUsd: Number(r.amount_usd),
      state: r.state,
      loootRunId: r.looot_run_id,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      hardExpiresAt: r.hard_expires_at,
    }));
  }

  async budgetStatus(at: Date): Promise<BudgetStatus> {
    const { data, error } = await this.db.rpc("budget_status", { p_owner: this.ownerId, p_day_start: dayStart(at).toISOString(), p_month_start: monthStart(at).toISOString() });
    if (error) throw new Error(`budget status: ${error.message}`);
    return statusOf(data as { daily: Window; monthly: Window });
  }
}
