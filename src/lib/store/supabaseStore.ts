import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TableName, Tables } from "../types";
import type { Store } from "./types";

const PAGE = 1000;
const NUMERIC: Partial<Record<TableName, string[]>> = {
  actions: ["estimate_usd", "max_cost_usd", "actual_usd"],
  runs: ["cap_usd", "cost_usd"],
  settings: ["action_ceiling_usd"],
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
  constructor(private readonly db: SupabaseClient) {}

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
}
