/** Row types, one per table in supabase/migrations. Dates are ISO strings. */

/** The stages of the default Sales pipeline, the only stages before 0.2. Other pipelines define their own in pipeline_stages. */
export const STAGES = ["lead", "qualified", "demo", "proposal", "won", "lost"] as const;
/** A stage key. Which keys exist depends on the deal's pipeline. */
export type Stage = string;
export const OPEN_STAGES: Stage[] = ["lead", "qualified", "demo", "proposal"];
export const STAGE_LABEL: Record<string, string> = {
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
  /** The user who created the row. Null when that user was deleted. */
  owner_id?: string | null;
  /** The team workspace the row belongs to. Row level security compares it with the signed-in user's. */
  workspace_id?: string;
  created_at: string;
}

export type WorkspaceRole = "owner" | "member";

/** A person in the workspace, or an invitation not claimed yet (joined_at null). */
export interface WorkspaceMember {
  email: string;
  role: WorkspaceRole;
  joined_at: string | null;
  created_at: string;
}

/** The workspace of the signed-in user and their role in it. */
export interface WorkspaceInfo {
  id: string;
  name: string;
  role: WorkspaceRole;
}

export type TeamRefusal = "invalid" | "already" | "has_workspace" | "self" | "not_found" | "forbidden";
export type TeamResult = { ok: true } | { ok: false; reason: TeamRefusal };

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
  pipeline_id: string;
  /** Null for a deal about a person (contact_id set). */
  company_id: string | null;
  /** The person a deal is about, in a pipeline of people. */
  contact_id: string | null;
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

export type StageKind = "open" | "won" | "lost";
export type PipelineSubject = "company" | "person";

export interface Pipeline extends Base {
  name: string;
  position: number;
  /** What a card is about: a company or a person. */
  subject: PipelineSubject;
  /** Whether deals in this pipeline carry an amount. */
  track_amount: boolean;
  /** ISO 4217 code of the amounts, such as USD or EUR. */
  currency: string;
}

export interface PipelineStage extends Base {
  pipeline_id: string;
  /** Stable. deals.stage stores it. */
  key: string;
  label: string;
  position: number;
  kind: StageKind;
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
  /** The most the whole workspace may spend in one UTC day. Reserved against before every paid call. */
  daily_budget_usd: number;
  /** The most the whole workspace may spend in one UTC month. Reserved against before every paid call. */
  monthly_budget_usd: number;
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
  pipelines: Pipeline;
  pipeline_stages: PipelineStage;
}
export type TableName = keyof Tables;
/** In dependency order: a table only refers to tables before it, so deleting in reverse never hits a foreign key. */
export const TABLE_NAMES: TableName[] = [
  "pipelines",
  "pipeline_stages",
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
