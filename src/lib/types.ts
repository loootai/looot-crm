/** Row types, one per table in supabase/migrations. Dates are ISO strings. */

export const STAGES = ["lead", "qualified", "demo", "proposal", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ["lead", "qualified", "demo", "proposal"];
export const STAGE_LABEL: Record<Stage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  demo: "Demo",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export const SIGNAL_KINDS = ["funding", "hiring", "tech", "news", "site"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];
export const KIND_LABEL: Record<SignalKind, string> = {
  funding: "Funding",
  hiring: "Hiring",
  tech: "Tech",
  news: "News",
  site: "Site",
};

export type EmailStatus = "unchecked" | "verified" | "risky" | "invalid" | "not_found";
export type ActivityKind = "note" | "call" | "meeting" | "task" | "stage_change" | "enrichment";
export type ActionKind = "intent_refresh" | "contact_enrich" | "company_enrich" | "find_people" | "email_verify";
export type ActionStatus = "running" | "done" | "partial" | "failed" | "stopped_at_max";
export type RunOutcome = "data" | "no_result" | "failed" | "skipped";

interface Base {
  id: string;
  owner_id?: string;
  created_at: string;
}

export interface Company extends Base {
  name: string;
  domain: string;
  industry: string | null;
  employees: number | null;
  hq: string | null;
  description: string | null;
  linkedin_url: string | null;
  tech: string[];
  watched_pages: string[];
  score: number;
  score_updated_at: string | null;
  intent_checked_at: string | null;
  enriched_at: string | null;
  updated_at: string | null;
}

export interface Contact extends Base {
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  email_status: EmailStatus;
  email_checked_at: string | null;
  phone: string | null;
  phone_found_at: string | null;
  linkedin_url: string | null;
  source: "manual" | "csv" | "looot";
}

export interface Deal extends Base {
  company_id: string;
  name: string;
  stage: Stage;
  amount_cents: number;
  currency: string;
  close_date: string | null;
  next_step: string | null;
  next_step_due: string | null;
  position: number;
  closed_reason: string | null;
  stage_changed_at: string | null;
}

export interface DealContact extends Base {
  deal_id: string;
  contact_id: string;
  role: "champion" | "buyer" | "user" | "other";
}

export interface Activity extends Base {
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  kind: ActivityKind;
  body: string | null;
  due_at: string | null;
  done_at: string | null;
  meta: Record<string, unknown>;
}

export interface Signal extends Base {
  company_id: string;
  kind: SignalKind;
  title: string;
  url: string | null;
  detail: string | null;
  tag: string | null;
  occurred_at: string;
  points: number;
  dedupe_key: string;
  run_id: string | null;
  read_at: string | null;
}

export interface SignalBaseline extends Base {
  company_id: string;
  kind: string;
  key: string;
  hash: string | null;
  content: string | null;
  checked_at: string | null;
}

export interface ScoreHistory extends Base {
  company_id: string;
  score: number;
  breakdown: Record<string, number>;
  at: string;
}

export interface Action extends Base {
  action_key: string;
  kind: ActionKind;
  target_count: number;
  target_label: string | null;
  estimate_usd: number;
  max_cost_usd: number;
  actual_usd: number;
  status: ActionStatus;
  finished_at: string | null;
}

export interface Run extends Base {
  action_id: string;
  job_id: string;
  step: string | null;
  target_type: string | null;
  target_id: string | null;
  idempotency_key: string;
  looot_run_id: string | null;
  status: string | null;
  outcome: RunOutcome | null;
  cap_usd: number | null;
  cost_usd: number;
  error: string | null;
  note: string | null;
}

export interface Weights {
  funding: number;
  hiring: number;
  tech: number;
  news_tagged: number;
  news_other: number;
  site: number;
}

export interface Settings extends Base {
  role_keywords: string[];
  default_pages: string[];
  weights: Weights;
  action_ceiling_usd: number | null;
}

export interface Tables {
  companies: Company;
  contacts: Contact;
  deals: Deal;
  deal_contacts: DealContact;
  activities: Activity;
  signals: Signal;
  signal_baselines: SignalBaseline;
  score_history: ScoreHistory;
  actions: Action;
  runs: Run;
  settings: Settings;
}
export type TableName = keyof Tables;
export const TABLE_NAMES: TableName[] = [
  "companies",
  "contacts",
  "deals",
  "deal_contacts",
  "activities",
  "signals",
  "signal_baselines",
  "score_history",
  "actions",
  "runs",
  "settings",
];
