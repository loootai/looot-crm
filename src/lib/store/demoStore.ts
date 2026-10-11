import { randomUUID } from "node:crypto";
import { TABLE_NAMES, type TableName, type Tables } from "../types";
import { dayStart, monthStart, overBudget, RESERVATION_HARD_SECONDS, RESERVATION_SOFT_SECONDS, windowOf, type BudgetStatus, type Reservation, type ReserveRequest, type ReserveResult } from "../budget";
import { ROW_DEFAULTS, type Store } from "./types";

export type DemoData = { [T in TableName]: Tables[T][] };

export function emptyData(): DemoData {
  return Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as DemoData;
}

/**
 * In-memory store. Used by demo mode (seeded) and by the tests (empty or seeded).
 * Reads and writes return copies, as a database does. A caller that reads a row, updates it, then
 * compares the two must see the old values in the first one.
 */
export class MemoryStore implements Store {
  readonly demo = true;
  #res: Reservation[] = [];
  constructor(readonly data: DemoData = emptyData()) {}

  async all<T extends TableName>(table: T, where?: Partial<Tables[T]>): Promise<Tables[T][]> {
    const rows = this.data[table] as Tables[T][];
    if (!where) return rows.map((r) => ({ ...r }));
    const keys = Object.keys(where) as (keyof Tables[T])[];
    return rows.filter((r) => keys.every((k) => r[k] === where[k])).map((r) => ({ ...r }));
  }

  async get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null> {
    const row = (this.data[table] as Tables[T][]).find((r) => r.id === id);
    return row ? { ...row } : null;
  }

  async insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]> {
    const made = rows.map(
      (r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...structuredClone(ROW_DEFAULTS[table]), ...r }) as Tables[T],
    );
    (this.data[table] as Tables[T][]).push(...made);
    return made.map((r) => ({ ...r }));
  }

  async insertIgnore<T extends TableName>(table: T, rows: Partial<Tables[T]>[], conflict: (keyof Tables[T])[]): Promise<Tables[T][]> {
    const out: Tables[T][] = [];
    for (const r of rows) {
      const clash = (this.data[table] as Tables[T][]).some((e) => conflict.every((k) => e[k] === r[k]));
      if (!clash) out.push(...(await this.insert(table, [r])));
    }
    return out;
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T] | null> {
    const row = (this.data[table] as Tables[T][]).find((r) => r.id === id);
    if (!row) return null;
    if (table === "actions") {
      const next = { ...(row as Tables["actions"]), ...(patch as Partial<Tables["actions"]>) };
      // Same rule as the check constraint in the migration.
      if (next.actual_usd > next.max_cost_usd + 1e-9) throw new Error("actions_actual_within_max");
    }
    Object.assign(row, patch);
    return { ...row };
  }

  async remove(table: TableName, ids: string[]): Promise<number> {
    const set = new Set(ids);
    const before = this.data[table].length;
    (this.data as Record<string, { id: string }[]>)[table] = this.data[table].filter((r) => !set.has(r.id));
    const removed = before - this.data[table].length;
    if (removed) this.#cascade(table, set);
    return removed;
  }

  #numbers(at: Date) {
    const [settings] = this.data.settings;
    const day = dayStart(at).toISOString();
    const month = monthStart(at).toISOString();
    let spentDay = 0;
    let spentMonth = 0;
    for (const r of this.data.runs) {
      if (r.created_at >= day) spentDay += r.cost_usd;
      if (r.created_at >= month) spentMonth += r.cost_usd;
    }
    return {
      dailyBudgetUsd: settings?.daily_budget_usd ?? ROW_DEFAULTS.settings.daily_budget_usd!,
      monthlyBudgetUsd: settings?.monthly_budget_usd ?? ROW_DEFAULTS.settings.monthly_budget_usd!,
      spentDayUsd: spentDay,
      spentMonthUsd: spentMonth,
      reservedUsd: this.#res.filter((x) => x.state === "reserved").reduce((n, x) => n + x.amountUsd, 0),
    };
  }

  async budgetStatus(at: Date): Promise<BudgetStatus> {
    const n = this.#numbers(at);
    return { daily: windowOf(n.dailyBudgetUsd, n.spentDayUsd, n.reservedUsd), monthly: windowOf(n.monthlyBudgetUsd, n.spentMonthUsd, n.reservedUsd) };
  }

  // No await inside the next methods, so the check and the write cannot interleave with another caller.
  async reserveBudget(req: ReserveRequest): Promise<ReserveResult> {
    const n = this.#numbers(req.now);
    const budget: BudgetStatus = { daily: windowOf(n.dailyBudgetUsd, n.spentDayUsd, n.reservedUsd), monthly: windowOf(n.monthlyBudgetUsd, n.spentMonthUsd, n.reservedUsd) };
    if (this.#res.some((x) => x.key === req.key)) return { ok: false, reason: "duplicate" };
    const scope = overBudget({ ...n, amountUsd: req.amountUsd });
    if (scope) return { ok: false, reason: "budget", scope, budget };
    this.#res.push({
      key: req.key,
      actionId: req.actionId,
      jobId: req.jobId,
      amountUsd: req.amountUsd,
      state: "reserved",
      loootRunId: null,
      createdAt: req.now.toISOString(),
      expiresAt: new Date(req.now.getTime() + RESERVATION_SOFT_SECONDS * 1000).toISOString(),
      hardExpiresAt: new Date(req.now.getTime() + RESERVATION_HARD_SECONDS * 1000).toISOString(),
    });
    return { ok: true, budget };
  }
  async settleReservation(key: string): Promise<void> {
    const r = this.#res.find((x) => x.key === key && x.state === "reserved");
    if (r) r.state = "settled";
  }
  async releaseReservation(key: string): Promise<void> {
    const r = this.#res.find((x) => x.key === key && x.state === "reserved");
    if (r) r.state = "released";
  }
  async holdReservation(key: string, loootRunId: string): Promise<void> {
    const r = this.#res.find((x) => x.key === key && x.state === "reserved");
    if (r) r.loootRunId = loootRunId;
  }
  async listExpiredReservations(at: Date): Promise<Reservation[]> {
    const t = at.toISOString();
    return this.#res.filter((x) => x.state === "reserved" && x.expiresAt <= t).map((x) => ({ ...x }));
  }

  /** Mirrors the foreign keys of the migration: cascade or set null. */
  #cascade(table: TableName, ids: Set<string>) {
    const d = this.data;
    if (table === "companies") {
      const drop = <R extends { id: string; company_id: string | null }>(rows: R[]) => rows.filter((r) => !r.company_id || !ids.has(r.company_id));
      const contactIds = new Set(d.contacts.filter((c) => c.company_id && ids.has(c.company_id)).map((c) => c.id));
      const dealIds = new Set(d.deals.filter((x) => ids.has(x.company_id)).map((x) => x.id));
      d.contacts = drop(d.contacts);
      d.deals = drop(d.deals);
      d.activities = drop(d.activities);
      d.signals = drop(d.signals);
      d.signal_baselines = drop(d.signal_baselines);
      d.score_history = drop(d.score_history);
      d.deal_contacts = d.deal_contacts.filter((x) => !dealIds.has(x.deal_id) && !contactIds.has(x.contact_id));
    }
    if (table === "contacts") {
      d.deal_contacts = d.deal_contacts.filter((x) => !ids.has(x.contact_id));
      for (const a of d.activities) if (a.contact_id && ids.has(a.contact_id)) a.contact_id = null;
    }
    if (table === "deals") {
      d.deal_contacts = d.deal_contacts.filter((x) => !ids.has(x.deal_id));
      for (const a of d.activities) if (a.deal_id && ids.has(a.deal_id)) a.deal_id = null;
    }
    if (table === "actions") {
      d.runs = d.runs.filter((r) => !ids.has(r.action_id));
      this.#res = this.#res.filter((x) => !ids.has(x.actionId));
    }
  }
}
