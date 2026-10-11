import type { TableName, Tables } from "../types";
import { DEFAULT_WEIGHTS } from "../score";
import type { BudgetStatus, Reservation, ReserveRequest, ReserveResult } from "../budget";

/**
 * The one data interface the app uses. Two implementations: Supabase (row level security does the
 * owner filter) and an in-memory demo store. Pages and route handlers only see this interface.
 */
export interface Store {
  readonly demo: boolean;
  /** All rows of a table the signed-in user owns, optionally filtered by equal columns. */
  all<T extends TableName>(table: T, where?: Partial<Tables[T]>): Promise<Tables[T][]>;
  get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null>;
  insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]>;
  /** Inserts rows and skips the ones that hit the unique key made of `conflict` columns (plus the owner). */
  insertIgnore<T extends TableName>(table: T, rows: Partial<Tables[T]>[], conflict: (keyof Tables[T])[]): Promise<Tables[T][]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T] | null>;
  remove(table: TableName, ids: string[]): Promise<number>;

  /**
   * Holds the most one paid call can cost against the daily and the monthly budget, in one atomic
   * step. Two simultaneous callers cannot both pass. The budgets come from the settings row, never
   * from the caller.
   */
  reserveBudget(req: ReserveRequest): Promise<ReserveResult>;
  /** The run row holds the real cost now. The reservation stops counting. Only a reserved row changes. */
  settleReservation(key: string, at: Date): Promise<void>;
  /** The call failed or was refused. The reservation stops counting. Only a reserved row changes. */
  releaseReservation(key: string, at: Date): Promise<void>;
  /** The call is accepted but not finished. Remembers the looot run id; the reservation keeps counting. */
  holdReservation(key: string, loootRunId: string): Promise<void>;
  /** Reserved rows past their soft expiry, oldest first. */
  listExpiredReservations(at: Date): Promise<Reservation[]>;
  /** Used, held and left for today and this month. */
  budgetStatus(at: Date): Promise<BudgetStatus>;
}

/** Column defaults, the same values the migration sets. The demo store applies them on insert. */
export const ROW_DEFAULTS: { [T in TableName]: Partial<Tables[T]> } = {
  companies: {
    industry: null,
    employees: null,
    hq: null,
    description: null,
    linkedin_url: null,
    tech: [],
    watched_pages: [],
    score: 0,
    score_updated_at: null,
    intent_checked_at: null,
    enriched_at: null,
    updated_at: null,
  },
  contacts: {
    company_id: null,
    first_name: null,
    last_name: null,
    title: null,
    email: null,
    email_status: "unchecked",
    email_checked_at: null,
    phone: null,
    phone_found_at: null,
    linkedin_url: null,
    source: "manual",
  },
  deals: {
    stage: "lead",
    amount_cents: 0,
    currency: "USD",
    close_date: null,
    next_step: null,
    next_step_due: null,
    position: 0,
    closed_reason: null,
    stage_changed_at: null,
  },
  deal_contacts: { role: "other" },
  activities: { company_id: null, contact_id: null, deal_id: null, body: null, due_at: null, done_at: null, meta: {} },
  signals: { url: null, detail: null, tag: null, run_id: null, read_at: null },
  signal_baselines: { hash: null, content: null, checked_at: null },
  score_history: {},
  actions: { target_count: 1, target_label: null, estimate_usd: 0, actual_usd: 0, status: "running", finished_at: null },
  runs: { step: null, target_type: null, target_id: null, looot_run_id: null, status: null, outcome: null, cap_usd: null, cost_usd: 0, error: null, note: null },
  settings: { role_keywords: [], default_pages: ["/pricing", "/careers"], weights: DEFAULT_WEIGHTS, action_ceiling_usd: null, daily_budget_usd: 5, monthly_budget_usd: 50 },
};
