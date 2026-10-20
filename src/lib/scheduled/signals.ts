import { loadPipelines } from "../pipelines";
import { executeAction, planFor, type LoootLike } from "../runner";
import type { PriceMap } from "../jobs";
import type { Store } from "../store/types";
import type { Company, Deal } from "../types";
import { CRON_KEY_PREFIX, day, runAllowance, weekOf, weekSpend, type CronConfig } from "./config";

export type SweepStep = "news" | "hiring";

/** One open card on a watched board, with its company. */
export interface WatchedCard {
  deal: Deal;
  company: Company;
  board: string;
  owner: string | null;
}

/** A signal the run found, as the Slack summary shows it. */
export interface FoundSignal {
  company: string;
  board: string;
  owner: string | null;
  kind: "news" | "hiring";
  tag: string | null;
  title: string;
  url: string | null;
}

export interface SweepReport {
  step: SweepStep;
  status: "ran" | "replayed" | "skipped";
  /** Why the run was skipped, or the budget note when it stopped early. */
  reason?: string;
  companies: number;
  estimateUsd: number;
  spentUsd: number;
  signals: FoundSignal[];
}

export interface SweepDeps {
  store: Store;
  looot: LoootLike & { balance?: () => Promise<number | null> };
  prices: PriceMap;
  perActionMaxUsd: number;
  config: CronConfig;
  now: Date;
}

/**
 * Who a card's next step is for, when it starts with a name and a colon ("Maya Okafor: contact Dana").
 * Generic openings such as "Next:" are not names.
 */
export function ownerOf(nextStep: string | null | undefined): string | null {
  const m = nextStep?.match(/^\s*([^:]{2,40}):/);
  if (!m) return null;
  const who = m[1].trim();
  if (/^(next|todo|to do|note|follow up|pitch)\b/i.test(who)) return null;
  return /^\p{Lu}/u.test(who) ? who : null;
}

/** Open cards on the named boards, one per company (the first board in the list wins). Person boards are ignored. */
export async function watchedCards(store: Store, boards: string[]): Promise<WatchedCard[]> {
  const pipelines = (await loadPipelines(store)).filter((p) => p.subject === "company" && boards.includes(p.name));
  pipelines.sort((a, b) => boards.indexOf(a.name) - boards.indexOf(b.name));
  if (!pipelines.length) return [];
  const [deals, companies] = await Promise.all([store.all("deals"), store.all("companies")]);
  const byId = new Map(companies.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: WatchedCard[] = [];
  for (const p of pipelines) {
    const open = new Set(p.stages.filter((s) => s.kind === "open").map((s) => s.key));
    for (const d of deals) {
      if (d.pipeline_id !== p.id || !open.has(d.stage) || !d.company_id || seen.has(d.company_id)) continue;
      const company = byId.get(d.company_id);
      if (!company) continue;
      seen.add(d.company_id);
      out.push({ deal: d, company, board: p.name, owner: ownerOf(d.next_step) });
    }
  }
  return out;
}

/**
 * One scheduled signal check: news on the signal boards, or hiring on the hiring boards. Uses the
 * same paid path as the Intent tab (executeAction), so every call is quoted, capped, reserved
 * against the workspace budget and recorded on the Spend page. On top of that it keeps to the run
 * cap and the weekly cap of scheduled jobs, and skips when the looot balance cannot cover the
 * estimate. The key holds the date (news) or the week (hiring), so a repeated cron call replays.
 */
export async function runSignalSweep(deps: SweepDeps, step: SweepStep): Promise<SweepReport> {
  const { store, config, now } = deps;
  const boards = step === "news" ? config.signalBoards : config.hiringBoards;
  const cards = (await watchedCards(store, boards))
    .sort((a, b) => (a.company.intent_checked_at ?? "").localeCompare(b.company.intent_checked_at ?? ""))
    .slice(0, config.maxCompanies);
  const base = { step, companies: cards.length, spentUsd: 0, signals: [] as FoundSignal[] };
  if (!cards.length) return { ...base, status: "skipped", reason: `No open cards on ${boards.join(", ")}.`, estimateUsd: 0 };

  const keywords = step === "news" ? config.newsKeywords : config.hiringKeywords;
  const req = { kind: "intent_refresh" as const, targetIds: cards.map((c) => c.company.id), steps: [step], options: { keywords } };
  const { plan } = await planFor(store, req, deps.prices);
  const allowance = runAllowance(config, await weekSpend(store, now));
  const actionKey = `${CRON_KEY_PREFIX}${step}:${step === "news" ? day(now) : weekOf(now)}`;
  const [already] = await store.all("actions", { action_key: actionKey });
  if (!already) {
    const cheapest = Math.min(...plan.lines.map((l) => l.quote));
    if (allowance < cheapest) return { ...base, status: "skipped", reason: `The weekly cap of scheduled jobs is used up ($${config.weekCapUsd.toFixed(2)}).`, estimateUsd: plan.estimate };
    const balance = deps.looot.balance ? await deps.looot.balance().catch(() => null) : null;
    if (balance !== null && balance < Math.min(plan.estimate, allowance)) {
      return { ...base, status: "skipped", reason: `The looot balance ($${balance.toFixed(2)}) is below the estimate ($${plan.estimate.toFixed(4)}). Top up at looot.ai.`, estimateUsd: plan.estimate };
    }
  }

  const out = await executeAction({ store, looot: deps.looot, prices: deps.prices, perActionMaxUsd: deps.perActionMaxUsd, now: () => now }, { actionKey, ...req, maxCostUsd: already ? Number(already.max_cost_usd) : allowance });
  const runIds = new Set(out.runs.map((r) => r.id));
  const byCompany = new Map(cards.map((c) => [c.company.id, c]));
  const signals = (await store.all("signals"))
    .filter((s) => s.run_id && runIds.has(s.run_id))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .map((s): FoundSignal => {
      const card = byCompany.get(s.company_id);
      return { company: card?.company.name ?? "?", board: card?.board ?? "", owner: card?.owner ?? null, kind: s.kind as "news" | "hiring", tag: s.tag ?? null, title: s.title, url: s.url ?? null };
    });
  const stopped = out.action.status === "stopped_at_max" ? (out.refusal ?? "Stopped at the run's cap.") : undefined;
  return { ...base, status: out.replayed ? "replayed" : "ran", reason: stopped, estimateUsd: plan.estimate, spentUsd: Number(out.action.actual_usd), signals };
}
