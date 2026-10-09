import { costOf, LoootError, TERMINAL_STATUSES, type LoootRun } from "./looot";
import { round6, type PriceMap } from "./jobs";
import { buildPlan, idempotencyKey, type Plan, type PlanLine, type StepId } from "./plan";
import { applyResult, type Candidate } from "./apply";
import { DEFAULT_WEIGHTS, scoreCompany } from "./score";
import { fullName, usd4 } from "./format";
import type { Store } from "./store/types";
import type { Action, ActionKind, ActionStatus, Company, Contact, Run, Settings } from "./types";

/** The one looot call the runner needs. The real client and the demo client both fit. */
export interface LoootLike {
  runAndWait(jobId: string, input: Record<string, unknown>, idempotencyKey: string, maxCostUsd: number): Promise<LoootRun>;
}

export interface ActionRequest {
  actionKey: string;
  kind: ActionKind;
  targetIds: string[];
  steps?: StepId[];
  maxCostUsd: number;
  options?: { keywords?: string[]; limit?: number };
}

export interface ActionResult {
  action: Action;
  runs: Run[];
  /** People found by a find_people action. Shown for the user to pick from, saved only on their choice. */
  candidates?: Candidate[];
  replayed: boolean;
}

export interface RunnerDeps {
  store: Store;
  looot: LoootLike;
  prices: PriceMap;
  /** Hard ceiling per action from the environment. */
  perActionMaxUsd: number;
  now?: () => Date;
}

export const DEFAULT_SETTINGS: Pick<Settings, "role_keywords" | "default_pages" | "weights" | "action_ceiling_usd"> = {
  role_keywords: [],
  default_pages: ["/pricing", "/careers"],
  weights: DEFAULT_WEIGHTS,
  action_ceiling_usd: null,
};

export async function loadSettings(store: Store) {
  const [s] = await store.all("settings");
  return s ?? { ...DEFAULT_SETTINGS, id: "", created_at: "" };
}

/** Loads the targets of a request and builds its plan. Used by the quote route and by the runner, so both see the same lines. */
export async function planFor(store: Store, req: Omit<ActionRequest, "actionKey" | "maxCostUsd">, prices: PriceMap): Promise<{ plan: Plan; companies: Company[]; contacts: Contact[] }> {
  const settings = await loadSettings(store);
  const onCompanies = req.kind === "intent_refresh" || req.kind === "company_enrich";
  const ids = new Set(req.targetIds);
  const allCompanies = await store.all("companies");
  const companies = onCompanies ? allCompanies.filter((c) => ids.has(c.id)) : [];
  const contacts = onCompanies ? [] : (await store.all("contacts")).filter((c) => ids.has(c.id));
  const companyOf = new Map(allCompanies.map((c) => [c.id, c]));
  const plan = buildPlan({ kind: req.kind, companies, contacts, companyOf, steps: req.steps, prices, settings, options: req.options });
  return { plan, companies, contacts };
}

/** The most an action may spend: what the user confirmed, clamped to the env ceiling and to the ceiling in Settings. */
export function clampMax(requested: number, perActionMaxUsd: number, settingsCeiling: number | null | undefined): number {
  let max = Math.min(requested, perActionMaxUsd);
  if (settingsCeiling && settingsCeiling > 0) max = Math.min(max, settingsCeiling);
  return round6(Math.max(0, max));
}

/**
 * Runs a paid action. The plan is rebuilt here from record ids, never taken from the client.
 * Each run's cap is min(job cap, confirmed max minus what was already spent). When that is below
 * the run's estimate, the run and everything after it is skipped and the action ends as
 * stopped_at_max, so the total can never pass the confirmed max. A run whose end is unknown (still
 * running at the poll deadline, or the request got no answer) keeps its cap held out of what is
 * left, because looot may still charge it. Posting the same actionKey again returns the stored
 * action and calls looot zero times.
 */
export async function executeAction(deps: RunnerDeps, req: ActionRequest): Promise<ActionResult> {
  const { store, looot } = deps;
  const now = deps.now ?? (() => new Date());

  const [existing] = await store.all("actions", { action_key: req.actionKey });
  if (existing) return { action: existing, runs: await store.all("runs", { action_id: existing.id }), replayed: true };

  const settings = await loadSettings(store);
  const { plan } = await planFor(store, req, deps.prices);
  const max = clampMax(req.maxCostUsd, deps.perActionMaxUsd, settings.action_ceiling_usd);

  const inserted = await store.insertIgnore(
    "actions",
    [{ action_key: req.actionKey, kind: req.kind, target_count: plan.targetCount, target_label: plan.targetLabel, estimate_usd: plan.estimate, max_cost_usd: max, actual_usd: 0, status: "running" }],
    ["action_key"],
  );
  if (!inserted.length) {
    // Another request with the same key won the insert. Return what it stored.
    const [other] = await store.all("actions", { action_key: req.actionKey });
    return { action: other, runs: await store.all("runs", { action_id: other.id }), replayed: true };
  }
  let action = inserted[0];

  let spent = 0;
  /** Caps of runs whose end is unknown. Counted against the max, never shown as spent. */
  let held = 0;
  let stopped = false;
  let fatal: string | null = null;
  const outcomes: Run["outcome"][] = [];
  const candidates: Candidate[] = [];
  const touchedCompanies = new Set<string>();
  const perTarget = new Map<string, { label: string; type: string; cost: number; notes: string[] }>();
  // What earlier steps found for a contact in this action, so verify can use a fresh email.
  const found = new Map<string, { email?: string | null }>();

  const record = async (line: PlanLine, row: Partial<Run>) => {
    const [r] = await store.insert("runs", [
      { action_id: action.id, job_id: line.jobId, step: line.step, target_type: line.targetType, target_id: line.targetId, idempotency_key: idempotencyKey(req.actionKey, line), cap_usd: line.cap, cost_usd: 0, ...row },
    ]);
    outcomes.push(r.outcome);
    return r;
  };

  for (const line of plan.lines) {
    if (stopped || fatal) {
      await record(line, { outcome: "skipped", note: fatal ? "Not run" : "Stopped at the max" });
      continue;
    }
    let input = line.input;
    if (line.step === "verify") {
      const email = (line.input.email as string) || found.get(line.targetId)?.email;
      if (!email) {
        await record(line, { outcome: "skipped", note: "No email to verify" });
        continue;
      }
      input = { email };
    }
    const left = round6(Math.max(0, max - spent - held));
    const cap = round6(Math.min(line.cap, left));
    if (cap < line.quote) {
      stopped = true;
      await record(line, { outcome: "skipped", cap_usd: cap, note: `Left of the max: ${usd4(left)}. This step needs ${usd4(line.quote)}.` });
      continue;
    }
    const row = await record(line, { status: "running", cap_usd: cap, outcome: null });
    outcomes.pop();
    let patch: Partial<Run>;
    try {
      const run = await looot.runAndWait(line.jobId, input, row.idempotency_key, cap);
      const cost = round6(Math.max(0, costOf(run) ?? 0));
      spent = round6(spent + cost);
      if (run.status === "completed") {
        const applied = await applyResult({ store, line, run, settings, now: now(), runId: row.id });
        if (applied.email !== undefined) found.set(line.targetId, { email: applied.email });
        if (applied.candidates) candidates.push(...applied.candidates);
        patch = { looot_run_id: run.runId, status: run.status, outcome: applied.outcome, cost_usd: cost, note: applied.note ?? null };
      } else {
        const blocked = run.status === "blocked";
        const open = !TERMINAL_STATUSES.has(run.status);
        if (open) held = round6(held + cap);
        const msg = open
          ? `The run did not finish in time (status ${run.status}). It may still complete, so ${usd4(cap)} of the max is held.`
          : (run.error?.message ?? (blocked ? "Balance too low. Top up at looot.ai" : (TERMINAL_HINT[run.status] ?? "The run failed.")));
        if (blocked) fatal = msg;
        patch = { looot_run_id: run.runId, status: run.status, outcome: "failed", cost_usd: cost, error: msg };
      }
    } catch (e) {
      const err = e instanceof LoootError ? e : null;
      const msg = err?.code === "missing_token" ? "LOOOT_TOKEN is not set on the server. Add it to .env.local" : err?.status === 402 ? "Balance too low. Top up at looot.ai" : e instanceof Error ? e.message : "The request to looot failed";
      if (err && (err.code === "missing_token" || err.status === 401 || err.status === 402 || err.status === 403)) fatal = msg;
      // looot answered with a refusal (4xx, or no token to send): nothing ran. Anything else may have reached looot.
      const refused = !!err && (err.code === "missing_token" || (err.status >= 400 && err.status < 500));
      if (!refused) held = round6(held + cap);
      patch = { status: "failed", outcome: "failed", cost_usd: 0, error: refused ? msg : `${msg}. No answer came back, so ${usd4(cap)} of the max is held.` };
    }
    await store.update("runs", row.id, patch);
    outcomes.push(patch.outcome ?? null);
    if (line.targetType === "company" && req.kind === "intent_refresh") touchedCompanies.add(line.targetId);
    const t = perTarget.get(line.targetId) ?? { label: line.targetLabel, type: line.targetType, cost: 0, notes: [] };
    t.cost = round6(t.cost + (patch.cost_usd ?? 0));
    if (patch.note) t.notes.push(patch.note);
    perTarget.set(line.targetId, t);
    // Keep the running total on the action, so a status poll shows it and a crash leaves the true spend.
    action = (await store.update("actions", action.id, { actual_usd: Math.min(spent, max) })) ?? action;
  }

  for (const id of touchedCompanies) await rescore(store, id, settings.weights ?? DEFAULT_WEIGHTS, now());
  await logEnrichment(store, req.kind, perTarget);

  const ran = outcomes.filter((o) => o && o !== "skipped");
  const status: ActionStatus = stopped
    ? "stopped_at_max"
    : !ran.length || ran.every((o) => o === "failed")
      ? plan.lines.length
        ? "failed"
        : "done"
      : ran.every((o) => o === "data")
        ? "done"
        : "partial";
  action = (await store.update("actions", action.id, { status, actual_usd: Math.min(spent, max), finished_at: now().toISOString() })) ?? action;
  return { action, runs: await store.all("runs", { action_id: action.id }), candidates: req.kind === "find_people" ? candidates : undefined, replayed: false };
}

const TERMINAL_HINT: Record<string, string> = {
  failed: "The provider returned an error.",
  stopped: "The run was stopped before it finished.",
};

/** Recomputes a company's score from its signals and writes a score_history row. */
export async function rescore(store: Store, companyId: string, weights: Settings["weights"], now: Date) {
  const signals = await store.all("signals", { company_id: companyId });
  const { score, breakdown } = scoreCompany(signals, weights, now);
  const at = now.toISOString();
  await store.update("companies", companyId, { score, score_updated_at: at, intent_checked_at: at, updated_at: at });
  await store.insert("score_history", [{ company_id: companyId, score, breakdown, at }]);
  return score;
}

async function logEnrichment(store: Store, kind: ActionKind, perTarget: Map<string, { label: string; type: string; cost: number; notes: string[] }>) {
  if (kind !== "contact_enrich" && kind !== "company_enrich" && kind !== "email_verify") return;
  const contacts = kind === "company_enrich" ? [] : await store.all("contacts");
  const rows = [...perTarget.entries()].map(([id, t]) => {
    const contact = contacts.find((c) => c.id === id);
    const what = t.notes.length ? t.notes.join(", ") : "nothing found";
    return {
      kind: "enrichment" as const,
      company_id: t.type === "company" ? id : (contact?.company_id ?? null),
      contact_id: t.type === "contact" ? id : null,
      body: `${t.type === "contact" && contact ? fullName(contact) : t.label}: ${what}. ${usd4(t.cost)}.`,
    };
  });
  if (rows.length) await store.insert("activities", rows);
}
