import { randomUUID } from "node:crypto";
import { TABLE_NAMES, type TableName, type Tables } from "../types";
import { ROW_DEFAULTS, type Store } from "./types";

export type DemoData = { [T in TableName]: Tables[T][] };

export function emptyData(): DemoData {
  return Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as DemoData;
}

/** In-memory store. Used by demo mode (seeded) and by the tests (empty or seeded). */
export class MemoryStore implements Store {
  readonly demo = true;
  constructor(readonly data: DemoData = emptyData()) {}

  async all<T extends TableName>(table: T, where?: Partial<Tables[T]>): Promise<Tables[T][]> {
    const rows = this.data[table] as Tables[T][];
    if (!where) return [...rows];
    const keys = Object.keys(where) as (keyof Tables[T])[];
    return rows.filter((r) => keys.every((k) => r[k] === where[k]));
  }

  async get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null> {
    return (this.data[table] as Tables[T][]).find((r) => r.id === id) ?? null;
  }

  async insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]> {
    const made = rows.map(
      (r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...structuredClone(ROW_DEFAULTS[table]), ...r }) as Tables[T],
    );
    (this.data[table] as Tables[T][]).push(...made);
    return made;
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
    return row;
  }

  async remove(table: TableName, ids: string[]): Promise<number> {
    const set = new Set(ids);
    const before = this.data[table].length;
    (this.data as Record<string, { id: string }[]>)[table] = this.data[table].filter((r) => !set.has(r.id));
    const removed = before - this.data[table].length;
    if (removed) this.#cascade(table, set);
    return removed;
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
    if (table === "actions") d.runs = d.runs.filter((r) => !ids.has(r.action_id));
  }
}
