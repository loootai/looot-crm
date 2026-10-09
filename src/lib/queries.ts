import { JOBS, type JobId, type PriceMap, round6 } from "./jobs";
import { dayDiff, fullName } from "./format";
import { STEP_JOB, watchedPages } from "./plan";
import { ageDays, basePoints, decayed, DEFAULT_WEIGHTS, KIND_CAPS, scoreCompany, WINDOW_DAYS, type ScoreResult } from "./score";
import { loadSettings } from "./runner";
import type { Store } from "./store/types";
import {
  OPEN_STAGES,
  SIGNAL_KINDS,
  STAGES,
  type Action,
  type Activity,
  type Company,
  type Contact,
  type Deal,
  type DealContact,
  type Run,
  type Signal,
  type SignalBaseline,
  type SignalKind,
  type Stage,
  type Weights,
} from "./types";

const DAY = 86_400_000;
const byNewest = <T extends { created_at: string }>(a: T, b: T) => (a.created_at < b.created_at ? 1 : -1);

/** Current points of one signal after decay. */
export function pointsNow(s: Pick<Signal, "kind" | "tag" | "occurred_at">, w: Weights, now: Date): number {
  return decayed(basePoints(s.kind, s.tag, w), ageDays(s.occurred_at, now));
}

/**
 * The headline signal of a company: the kind that adds the most points right now (newest evidence
 * wins a tie), shown as its newest signal. Several open roles read "Hiring 3: <newest role>".
 * Null when nothing counts in the 90-day window.
 */
export function topSignal(signals: Signal[], w: Weights, now: Date): { kind: SignalKind; title: string } | null {
  const live = signals.filter((s) => ageDays(s.occurred_at, now) <= WINDOW_DAYS);
  if (!live.length) return null;
  const { breakdown, newest } = scoreCompany(live, w, now);
  let kind: SignalKind | null = null;
  for (const k of SIGNAL_KINDS) {
    if (!newest[k]) continue;
    if (kind === null || breakdown[k] > breakdown[kind] || (breakdown[k] === breakdown[kind] && newest[k]! > newest[kind]!)) kind = k;
  }
  if (!kind) return null;
  const mine = live.filter((s) => s.kind === kind).sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  const title = kind === "hiring" && mine.length > 1 ? `Hiring ${mine.length}: ${mine[0].title}` : kind === "tech" && mine.length > 1 ? `${mine[0].title}, ${mine.length - 1} more` : mine[0].title;
  return { kind, title };
}

/* ---------- Shell ---------- */

export interface SearchIndex {
  companies: { id: string; name: string; domain: string }[];
  people: { id: string; name: string; sub: string }[];
  deals: { id: string; name: string; sub: string }[];
}

export async function searchIndex(store: Store): Promise<SearchIndex> {
  const [companies, contacts, deals] = await Promise.all([store.all("companies"), store.all("contacts"), store.all("deals")]);
  const name = new Map(companies.map((c) => [c.id, c.name]));
  return {
    companies: companies.map((c) => ({ id: c.id, name: c.name, domain: c.domain })).sort((a, b) => a.name.localeCompare(b.name)),
    people: contacts.map((c) => ({ id: c.id, name: fullName(c), sub: [c.title, c.company_id ? name.get(c.company_id) : null].filter(Boolean).join(", ") })),
    deals: deals.map((d) => ({ id: d.id, name: d.name, sub: name.get(d.company_id) ?? "" })),
  };
}

/* ---------- Companies ---------- */

export interface CompanyRow {
  id: string;
  name: string;
  domain: string;
  industry: string | null;
  employees: number | null;
  score: number;
  spark: number[];
  topSignal: { kind: SignalKind; title: string } | null;
  openValueCents: number;
  bestStage: Stage | null;
  contacts: number;
  hasEmail: boolean;
  lastActivity: string | null;
  intentCheckedAt: string | null;
}

export async function companyRows(store: Store, now: Date = new Date()): Promise<CompanyRow[]> {
  const [companies, contacts, deals, signals, activities, history, settings] = await Promise.all([
    store.all("companies"),
    store.all("contacts"),
    store.all("deals"),
    store.all("signals"),
    store.all("activities"),
    store.all("score_history"),
    loadSettings(store),
  ]);
  const w = settings.weights ?? DEFAULT_WEIGHTS;
  const group = <T extends { company_id: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) if (r.company_id) m.set(r.company_id, [...(m.get(r.company_id) ?? []), r]);
    return m;
  };
  const gc = group(contacts);
  const gd = group(deals);
  const gs = group(signals);
  const ga = group(activities);
  const gh = group(history);
  return companies.map((c) => {
    const open = (gd.get(c.id) ?? []).filter((d) => OPEN_STAGES.includes(d.stage));
    const top = topSignal(gs.get(c.id) ?? [], w, now);
    const best = open.reduce<Stage | null>((b, d) => (b === null || STAGES.indexOf(d.stage) > STAGES.indexOf(b) ? d.stage : b), null);
    const acts = ga.get(c.id) ?? [];
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      employees: c.employees,
      score: c.score,
      spark: (gh.get(c.id) ?? []).sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-12).map((h) => h.score),
      topSignal: top,
      openValueCents: open.reduce((s, d) => s + d.amount_cents, 0),
      bestStage: best,
      contacts: (gc.get(c.id) ?? []).length,
      hasEmail: (gc.get(c.id) ?? []).some((p) => !!p.email),
      lastActivity: acts.length ? acts.reduce((m, a) => (a.created_at > m ? a.created_at : m), acts[0].created_at) : null,
      intentCheckedAt: c.intent_checked_at,
    };
  });
}

/* ---------- Company page ---------- */

export type SectionState = "never" | "data" | "baseline" | "empty" | "error";
export interface IntentSection {
  kind: SignalKind;
  jobId: JobId;
  price: number;
  runs: number;
  state: SectionState;
  checkedAt: string | null;
  lastCost: number | null;
  error: string | null;
  note: string | null;
  signals: Signal[];
}

export interface TimelineEntry {
  id: string;
  at: string;
  type: "activity" | "signal";
  kind: string;
  body: string;
  who: string | null;
  dealName: string | null;
  dueAt: string | null;
  doneAt: string | null;
  meta: Record<string, unknown>;
}

export function timelineOf(activities: Activity[], signals: Signal[], contacts: Contact[], deals: Deal[]): TimelineEntry[] {
  const person = new Map(contacts.map((c) => [c.id, fullName(c)]));
  const deal = new Map(deals.map((d) => [d.id, d.name]));
  const a: TimelineEntry[] = activities.map((x) => ({
    id: x.id,
    at: x.created_at,
    type: "activity",
    kind: x.kind,
    body: x.body ?? "",
    who: x.contact_id ? (person.get(x.contact_id) ?? null) : null,
    dealName: x.deal_id ? (deal.get(x.deal_id) ?? null) : null,
    dueAt: x.due_at,
    doneAt: x.done_at,
    meta: x.meta ?? {},
  }));
  const s: TimelineEntry[] = signals.map((x) => ({ id: x.id, at: x.occurred_at, type: "signal", kind: x.kind, body: x.title, who: null, dealName: null, dueAt: null, doneAt: null, meta: {} }));
  return [...a, ...s].sort((x, y) => (x.at < y.at ? 1 : -1));
}

export interface CompanyDetail {
  company: Company;
  contacts: Contact[];
  deals: Deal[];
  timeline: TimelineEntry[];
  score: ScoreResult;
  history: { at: string; score: number }[];
  sections: IntentSection[];
  roleKeywords: string[];
  weights: Weights;
  lastActivityOf: Record<string, string>;
}

export async function companyDetail(store: Store, id: string, prices: PriceMap, now: Date = new Date()): Promise<CompanyDetail | null> {
  const company = await store.get("companies", id);
  if (!company) return null;
  const [contacts, deals, activities, signals, baselines, history, runs, settings] = await Promise.all([
    store.all("contacts", { company_id: id }),
    store.all("deals", { company_id: id }),
    store.all("activities", { company_id: id }),
    store.all("signals", { company_id: id }),
    store.all("signal_baselines", { company_id: id }),
    store.all("score_history", { company_id: id }),
    store.all("runs", { target_id: id }),
    loadSettings(store),
  ]);
  const w = settings.weights ?? DEFAULT_WEIGHTS;
  const pages = watchedPages(company, settings.default_pages).length;
  const lastActivityOf: Record<string, string> = {};
  for (const a of activities) if (a.contact_id && (!lastActivityOf[a.contact_id] || a.created_at > lastActivityOf[a.contact_id])) lastActivityOf[a.contact_id] = a.created_at;
  return {
    company,
    contacts: contacts.sort((a, b) => fullName(a).localeCompare(fullName(b))),
    deals: deals.sort(byNewest),
    timeline: timelineOf(activities, signals, contacts, deals),
    score: scoreCompany(signals, w, now),
    history: history.sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-12).map((h) => ({ at: h.at, score: h.score })),
    sections: SIGNAL_KINDS.map((kind) => sectionOf(kind, company, signals, baselines, runs, prices, pages)),
    roleKeywords: settings.role_keywords,
    weights: w,
    lastActivityOf,
  };
}

function sectionOf(kind: SignalKind, company: Company, signals: Signal[], baselines: SignalBaseline[], runs: Run[], prices: PriceMap, pages: number): IntentSection {
  const jobId = STEP_JOB[kind];
  const mine = signals.filter((s) => s.kind === kind).sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  const kindRuns = runs.filter((r) => r.job_id === jobId && r.outcome !== "skipped").sort(byNewest);
  const last = kindRuns[0] ?? null;
  // Runs of the same action for this kind (two page reads count together).
  const sameAction = last ? kindRuns.filter((r) => r.action_id === last.action_id) : [];
  const failed = sameAction.find((r) => r.outcome === "failed");
  const checkedAt = last?.created_at ?? company.intent_checked_at;
  const hasBaseline = baselines.some((b) => b.kind === kind);
  const state: SectionState = !checkedAt ? "never" : failed && sameAction.every((r) => r.outcome === "failed") ? "error" : mine.length ? "data" : hasBaseline ? "baseline" : "empty";
  const runCount = kind === "site" ? Math.max(1, pages) : 1;
  return {
    kind,
    jobId,
    price: round6(prices[jobId] * runCount),
    runs: runCount,
    state,
    checkedAt,
    lastCost: last ? round6(sameAction.reduce((s, r) => s + r.cost_usd, 0)) : null,
    error: failed?.error ?? null,
    note: last?.note ?? null,
    signals: mine,
  };
}

/* ---------- People ---------- */

export interface PersonRow extends Contact {
  name: string;
  companyName: string | null;
  companyDomain: string | null;
  lastActivity: string | null;
  /** When a looot run found this contact's work email. Null when the email was typed or imported. */
  emailFoundAt: string | null;
}

export async function personRows(store: Store, companyId?: string): Promise<PersonRow[]> {
  const [contacts, companies, activities, finds] = await Promise.all([store.all("contacts", companyId ? { company_id: companyId } : undefined), store.all("companies"), store.all("activities"), store.all("runs", { job_id: "people.email.find", outcome: "data" })]);
  const found = new Map<string, string>();
  for (const r of finds) if (r.target_id && (!found.has(r.target_id) || r.created_at > found.get(r.target_id)!)) found.set(r.target_id, r.created_at);
  const co = new Map(companies.map((c) => [c.id, c]));
  const last = new Map<string, string>();
  for (const a of activities) if (a.contact_id && (!last.has(a.contact_id) || a.created_at > last.get(a.contact_id)!)) last.set(a.contact_id, a.created_at);
  return contacts.map((c) => ({
    ...c,
    name: fullName(c),
    companyName: c.company_id ? (co.get(c.company_id)?.name ?? null) : null,
    companyDomain: c.company_id ? (co.get(c.company_id)?.domain ?? null) : null,
    lastActivity: last.get(c.id) ?? null,
    // Contacts that looot created carry no find run of their own. Their email came with the search.
    emailFoundAt: c.email ? (found.get(c.id) ?? (c.source === "looot" ? (c.email_checked_at ?? c.created_at) : null)) : null,
  }));
}

export async function contactTimeline(store: Store, contactId: string): Promise<TimelineEntry[]> {
  const [acts, contacts, deals] = await Promise.all([store.all("activities", { contact_id: contactId }), store.all("contacts"), store.all("deals")]);
  return timelineOf(acts, [], contacts, deals);
}

/* ---------- Pipeline and deals ---------- */

export interface DealCard {
  id: string;
  name: string;
  stage: Stage;
  amountCents: number;
  closeDate: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
  position: number;
  companyId: string;
  companyName: string;
  companyDomain: string;
  score: number;
}

export async function dealCards(store: Store): Promise<DealCard[]> {
  const [deals, companies] = await Promise.all([store.all("deals"), store.all("companies")]);
  const co = new Map(companies.map((c) => [c.id, c]));
  return deals
    .map((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stage,
      amountCents: d.amount_cents,
      closeDate: d.close_date,
      nextStep: d.next_step,
      nextStepDue: d.next_step_due,
      position: d.position,
      companyId: d.company_id,
      companyName: co.get(d.company_id)?.name ?? "Unknown company",
      companyDomain: co.get(d.company_id)?.domain ?? "",
      score: co.get(d.company_id)?.score ?? 0,
    }))
    .sort((a, b) => a.position - b.position);
}

export interface DealDetail {
  deal: Deal;
  company: Company;
  whyNow: Signal[];
  people: { contact: Contact; role: DealContact["role"] }[];
  timeline: TimelineEntry[];
}

export async function dealDetail(store: Store, id: string, now: Date = new Date()): Promise<DealDetail | null> {
  const deal = await store.get("deals", id);
  if (!deal) return null;
  const company = await store.get("companies", deal.company_id);
  if (!company) return null;
  const [links, contacts, activities, signals, deals] = await Promise.all([
    store.all("deal_contacts", { deal_id: id }),
    store.all("contacts", { company_id: company.id }),
    store.all("activities", { deal_id: id }),
    store.all("signals", { company_id: company.id }),
    store.all("deals", { company_id: company.id }),
  ]);
  const whyNow = signals
    .filter((s) => ageDays(s.occurred_at, now) <= WINDOW_DAYS)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
    .slice(0, 2);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return {
    deal,
    company,
    whyNow,
    people: links.filter((l) => byId.has(l.contact_id)).map((l) => ({ contact: byId.get(l.contact_id)!, role: l.role })),
    timeline: timelineOf(activities, [], contacts, deals),
  };
}

/* ---------- Today ---------- */

export interface SignalGroup {
  companyId: string;
  name: string;
  domain: string;
  score: number;
  delta: number | null;
  signals: Signal[];
  more: number;
}
export interface DueItem {
  id: string;
  type: "task" | "next_step";
  title: string;
  dueAt: string;
  companyId: string | null;
  companyName: string | null;
  dealId: string | null;
  dealName: string | null;
}
export interface TodayData {
  groups: SignalGroup[];
  due: DueItem[];
  stages: { stage: Stage; deals: number; valueCents: number }[];
  openValueCents: number;
  openDeals: number;
  closing30: { deals: number; valueCents: number };
  companies: number;
  refreshTargets: string[];
}

export async function todayData(store: Store, filter: { kinds?: SignalKind[]; minScore?: number } = {}, now: Date = new Date()): Promise<TodayData> {
  const [companies, signals, deals, activities, history] = await Promise.all([store.all("companies"), store.all("signals"), store.all("deals"), store.all("activities"), store.all("score_history")]);
  const co = new Map(companies.map((c) => [c.id, c]));
  const weekAgo = now.getTime() - 7 * DAY;
  const groups: SignalGroup[] = [];
  const unread = signals.filter((s) => !s.read_at && (!filter.kinds?.length || filter.kinds.includes(s.kind)));
  for (const c of companies) {
    if (filter.minScore && c.score < filter.minScore) continue;
    const mine = unread.filter((s) => s.company_id === c.id).sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    if (!mine.length) continue;
    const past = history.filter((h) => h.company_id === c.id && new Date(h.at).getTime() <= weekAgo).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    groups.push({ companyId: c.id, name: c.name, domain: c.domain, score: c.score, delta: past ? c.score - past.score : null, signals: mine.slice(0, 3), more: Math.max(0, mine.length - 3) });
  }
  groups.sort((a, b) => b.score - a.score);

  const dealById = new Map(deals.map((d) => [d.id, d]));
  const due: DueItem[] = [];
  for (const a of activities) {
    if (a.kind !== "task" || a.done_at || !a.due_at || dayDiff(a.due_at, now) > 0) continue;
    const d = a.deal_id ? dealById.get(a.deal_id) : undefined;
    due.push({ id: a.id, type: "task", title: a.body ?? "Task", dueAt: a.due_at, companyId: a.company_id, companyName: a.company_id ? (co.get(a.company_id)?.name ?? null) : null, dealId: d?.id ?? null, dealName: d?.name ?? null });
  }
  for (const d of deals) {
    if (!OPEN_STAGES.includes(d.stage) || !d.next_step || !d.next_step_due || dayDiff(d.next_step_due, now) > 0) continue;
    due.push({ id: d.id, type: "next_step", title: d.next_step, dueAt: d.next_step_due, companyId: d.company_id, companyName: co.get(d.company_id)?.name ?? null, dealId: d.id, dealName: d.name });
  }
  due.sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));

  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const closing = open.filter((d) => d.close_date && dayDiff(d.close_date, now) >= 0 && dayDiff(d.close_date, now) <= 30);
  const withOpen = [...new Set(open.map((d) => d.company_id))].map((id) => co.get(id)).filter((c): c is Company => !!c);
  return {
    groups,
    due,
    stages: OPEN_STAGES.map((stage) => {
      const ds = open.filter((d) => d.stage === stage);
      return { stage, deals: ds.length, valueCents: ds.reduce((s, d) => s + d.amount_cents, 0) };
    }),
    openValueCents: open.reduce((s, d) => s + d.amount_cents, 0),
    openDeals: open.length,
    closing30: { deals: closing.length, valueCents: closing.reduce((s, d) => s + d.amount_cents, 0) },
    companies: companies.length,
    refreshTargets: withOpen.sort((a, b) => b.score - a.score).slice(0, 10).map((c) => c.id),
  };
}

/* ---------- Spend ---------- */

export const SPEND_GROUPS = ["Intent", "Contact enrich", "Company enrich", "Find people"] as const;
export type SpendGroup = (typeof SPEND_GROUPS)[number];
export const groupOfKind = (k: Action["kind"]): SpendGroup => (k === "intent_refresh" ? "Intent" : k === "company_enrich" ? "Company enrich" : k === "find_people" ? "Find people" : "Contact enrich");

export interface SpendData {
  actions: (Action & { runs: Run[]; runTotal: number })[];
  days: { date: string; byGroup: Record<SpendGroup, number> }[];
  spent30: number;
  runs30: number;
  perContact: number | null;
  perRefresh: number | null;
  overMax: number;
}

export async function spendData(store: Store, now: Date = new Date()): Promise<SpendData> {
  const [actions, runs] = await Promise.all([store.all("actions"), store.all("runs")]);
  const byAction = new Map<string, Run[]>();
  for (const r of runs) byAction.set(r.action_id, [...(byAction.get(r.action_id) ?? []), r]);
  const rows = actions.sort(byNewest).map((a) => {
    const rs = byAction.get(a.id) ?? [];
    return { ...a, runs: rs, runTotal: round6(rs.reduce((s, r) => s + r.cost_usd, 0)) };
  });
  const days: SpendData["days"] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * DAY).toISOString().slice(0, 10);
    days.push({ date, byGroup: { Intent: 0, "Contact enrich": 0, "Company enrich": 0, "Find people": 0 } });
  }
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));
  const recent = rows.filter((a) => dayIndex.has(a.created_at.slice(0, 10)));
  for (const a of recent) {
    const d = days[dayIndex.get(a.created_at.slice(0, 10))!];
    d.byGroup[groupOfKind(a.kind)] = round6(d.byGroup[groupOfKind(a.kind)] + a.actual_usd);
  }
  const avg = (kind: Action["kind"]) => {
    const xs = rows.filter((a) => a.kind === kind && a.target_count > 0 && a.actual_usd > 0);
    const n = xs.reduce((s, a) => s + a.target_count, 0);
    return n ? round6(xs.reduce((s, a) => s + a.actual_usd, 0) / n) : null;
  };
  const fullRefresh = rows.filter((a) => a.kind === "intent_refresh" && a.runs.length > 1);
  return {
    actions: rows,
    days,
    spent30: round6(recent.reduce((s, a) => s + a.actual_usd, 0)),
    runs30: recent.reduce((s, a) => s + a.runs.filter((r) => r.outcome !== "skipped").length, 0),
    perContact: avg("contact_enrich"),
    perRefresh: fullRefresh.length ? round6(fullRefresh.reduce((s, a) => s + a.actual_usd, 0) / fullRefresh.reduce((s, a) => s + a.target_count, 0)) : null,
    overMax: rows.filter((a) => a.actual_usd > a.max_cost_usd + 1e-9 || a.runTotal > a.max_cost_usd + 1e-9).length,
  };
}

/** The price table of the Spend page: one row per job with the quote the app uses. */
export function priceTable(prices: PriceMap) {
  return (Object.keys(JOBS) as JobId[]).map((id) => ({ id, feature: JOBS[id].feature, quote: prices[id], cap: JOBS[id].cap, results: JOBS[id].results }));
}

export { KIND_CAPS };
