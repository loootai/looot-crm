"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contactTimeline, dealDetail, type DealDetail, type TimelineEntry } from "@/lib/queries";
import { DEFAULT_SETTINGS } from "@/lib/runner";
import { getSession, IS_DEMO, resolveGate, type Session, type Store } from "@/lib/store";
import { serverSupabase } from "@/lib/supabase/server";
import { createPipelineRows, loadPipelines, PIPELINE_TEMPLATES, stageKey, templateStages } from "@/lib/pipelines";
import { ActivityInput, addActivityRow, ContactInput, createCompanyRow, createContactRow, createDealRow, DealInput, DealPatch, id, moveDealRow, text, updateDealRow, type Result } from "@/lib/records";
import { TABLE_NAMES, type Stage, type TeamRefusal, type TeamResult } from "@/lib/types";

export type { Result };

async function withStore<T = object>(fn: (store: Store, session: Session) => Promise<Result<T>>): Promise<Result<T>> {
  const gate = await resolveGate();
  if (gate.kind === "setup") return { ok: false, error: "Set LOOOT_CRM_ALLOWED_EMAILS on the server first." };
  if (gate.kind === "denied") return { ok: false, error: "You are not authorised for this workspace." };
  if (gate.kind !== "ok") return { ok: false, error: "Sign in first." };
  const session = gate.session;
  try {
    const out = await fn(session.store, session);
    if (out.ok) revalidatePath("/", "layout");
    return out;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}


export async function createCompany(input: { name: string; domain: string }): Promise<Result<{ id: string }>> {
  return withStore<{ id: string }>((store) => createCompanyRow(store, input));
}

const CompanyPatch = z.object({ name: text(120).min(1), industry: text(120).nullable(), employees: z.number().int().min(0).max(5_000_000).nullable(), hq: text(120).nullable(), description: text(600).nullable() }).partial();

export async function updateCompany(companyId: string, patch: z.infer<typeof CompanyPatch>): Promise<Result> {
  return withStore(async (store) => {
    const p = CompanyPatch.safeParse(patch);
    if (!p.success) return { ok: false, error: "That value is not valid." };
    const row = await store.update("companies", companyId, { ...p.data, updated_at: new Date().toISOString() });
    return row ? { ok: true } : { ok: false, error: "Company not found." };
  });
}

export async function deleteRecords(table: "companies" | "contacts" | "deals", ids: string[]): Promise<Result<{ removed: number }>> {
  return withStore<{ removed: number }>(async (store) => {
    if (!["companies", "contacts", "deals"].includes(table)) return { ok: false, error: "Unknown table." };
    const parsed = z.array(id).min(1).max(500).safeParse(ids);
    if (!parsed.success) return { ok: false, error: "Nothing selected." };
    return { ok: true, removed: await store.remove(table, parsed.data) };
  });
}

export async function createContact(input: z.input<typeof ContactInput>): Promise<Result<{ id: string }>> {
  return withStore<{ id: string }>((store) => createContactRow(store, input));
}

const CandidateInput = z.array(z.object({ first_name: text(80), last_name: text(80), title: text(160).nullable(), linkedin_url: text(300).nullable(), company_id: id.nullable() })).min(1).max(25);

/** Saves the people the user picked from a "find more people" result. Skips ones already in the CRM. */
export async function addCandidates(input: z.input<typeof CandidateInput>): Promise<Result<{ added: number }>> {
  return withStore<{ added: number }>(async (store) => {
    const p = CandidateInput.safeParse(input);
    if (!p.success) return { ok: false, error: "Pick at least one person." };
    const existing = await store.all("contacts");
    const fresh = p.data.filter(
      (c) => !existing.some((e) => (c.linkedin_url && e.linkedin_url === c.linkedin_url) || (e.company_id === c.company_id && `${e.first_name} ${e.last_name}`.toLowerCase() === `${c.first_name} ${c.last_name}`.toLowerCase())),
    );
    if (fresh.length) await store.insert("contacts", fresh.map((c) => ({ ...c, source: "looot" as const })));
    return { ok: true, added: fresh.length };
  });
}

export async function createDeal(input: z.input<typeof DealInput>): Promise<Result<{ id: string }>> {
  return withStore<{ id: string }>((store) => createDealRow(store, input));
}

/** Moves a deal to a stage of its pipeline (and a position inside it) and writes a stage-change activity when the stage differs. */
export async function moveDeal(dealId: string, stage: Stage, position?: number, reason?: string): Promise<Result> {
  return withStore((store) => moveDealRow(store, dealId, stage, position, reason));
}

/* ---------- Pipelines ---------- */

const CURRENCY = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const StageInput = z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/).nullable(), label: text(40).min(1), kind: z.enum(["open", "won", "lost"]) });
const PipelineInput = z.object({ name: text(60).min(1), template: z.string().max(40), currency: CURRENCY });

/** Adds a pipeline from a template. The stages can be changed afterwards. */
export async function createPipeline(input: z.input<typeof PipelineInput>): Promise<Result<{ id: string }>> {
  return withStore<{ id: string }>(async (store) => {
    const p = PipelineInput.safeParse(input);
    if (!p.success) return { ok: false, error: "Enter a name and a three-letter currency code such as EUR." };
    const t = PIPELINE_TEMPLATES.find((x) => x.id === p.data.template);
    if (!t) return { ok: false, error: "Pick a template." };
    const existing = await loadPipelines(store);
    const made = await createPipelineRows(store, { name: p.data.name, subject: t.subject, trackAmount: t.trackAmount, currency: p.data.currency, stages: templateStages(t), position: existing.reduce((m, x) => Math.max(m, x.position), 0) + 1000 });
    return made ? { ok: true, id: made.id } : { ok: false, error: `There is already a pipeline called ${p.data.name}.` };
  });
}

const PipelinePatch = z.object({ name: text(60).min(1), track_amount: z.boolean(), currency: CURRENCY, subject: z.enum(["company", "person"]) }).partial();

export async function updatePipeline(pipelineId: string, patch: z.input<typeof PipelinePatch>): Promise<Result> {
  return withStore(async (store) => {
    const p = PipelinePatch.safeParse(patch);
    if (!p.success) return { ok: false, error: "Check the name and the currency code." };
    const current = await store.get("pipelines", pipelineId);
    if (!current) return { ok: false, error: "Pipeline not found." };
    if (p.data.subject && p.data.subject !== current.subject && (await store.all("deals", { pipeline_id: pipelineId })).length) {
      return { ok: false, error: "This pipeline has deals, so what its cards are about cannot change." };
    }
    if (p.data.name && p.data.name !== current.name && (await store.all("pipelines", { name: p.data.name })).length) {
      return { ok: false, error: `There is already a pipeline called ${p.data.name}.` };
    }
    await store.update("pipelines", pipelineId, p.data);
    return { ok: true };
  });
}

/**
 * Saves the stages of a pipeline in the order given. A stage with a key is kept (label and kind can
 * change), one without is added, and a stage left out is deleted, which is refused while deals are in it.
 */
export async function savePipelineStages(pipelineId: string, input: z.input<typeof StageInput>[]): Promise<Result> {
  return withStore(async (store) => {
    const p = z.array(StageInput).min(1).max(12).safeParse(input);
    if (!p.success) return { ok: false, error: "A pipeline has 1 to 12 stages, each with a name of up to 40 characters." };
    if (!p.data.some((s) => s.kind === "open")) return { ok: false, error: "Keep at least one open stage." };
    const labels = p.data.map((s) => s.label.toLowerCase());
    if (new Set(labels).size !== labels.length) return { ok: false, error: "Two stages have the same name." };
    const [pipeline, rows, deals] = await Promise.all([store.get("pipelines", pipelineId), store.all("pipeline_stages", { pipeline_id: pipelineId }), store.all("deals", { pipeline_id: pipelineId })]);
    if (!pipeline) return { ok: false, error: "Pipeline not found." };
    const keep = new Set(p.data.map((s) => s.key).filter(Boolean));
    for (const gone of rows.filter((r) => !keep.has(r.key))) {
      const n = deals.filter((d) => d.stage === gone.key).length;
      if (n) return { ok: false, error: `${gone.label} still has ${n} ${n === 1 ? "deal" : "deals"}. Move ${n === 1 ? "it" : "them"} to another stage first.` };
    }
    const taken = new Set(rows.map((r) => r.key));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const removed = rows.filter((r) => !keep.has(r.key)).map((r) => r.id);
    if (removed.length) await store.remove("pipeline_stages", removed);
    for (const [i, s] of p.data.entries()) {
      const position = (i + 1) * 1000;
      const row = s.key ? byKey.get(s.key) : undefined;
      if (row) await store.update("pipeline_stages", row.id, { label: s.label, kind: s.kind, position });
      else await store.insert("pipeline_stages", [{ pipeline_id: pipelineId, key: stageKey(s.label, taken), label: s.label, kind: s.kind, position }]);
    }
    return { ok: true };
  });
}

/** Moves a pipeline one place up or down in the switcher. */
export async function movePipeline(pipelineId: string, direction: "up" | "down"): Promise<Result> {
  return withStore(async (store) => {
    const all = await loadPipelines(store);
    const i = all.findIndex((p) => p.id === pipelineId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i === -1 || j < 0 || j >= all.length) return { ok: true };
    [all[i], all[j]] = [all[j], all[i]];
    // Renumber all of them, so two pipelines with the same position still swap.
    for (const [k, x] of all.entries()) if (x.position !== (k + 1) * 1000) await store.update("pipelines", x.id, { position: (k + 1) * 1000 });
    return { ok: true };
  });
}

/** Deletes an empty pipeline. The last one stays, so the board always has stages. */
export async function deletePipeline(pipelineId: string): Promise<Result> {
  return withStore(async (store) => {
    const all = await loadPipelines(store);
    if (all.length <= 1) return { ok: false, error: "Keep at least one pipeline." };
    const n = (await store.all("deals", { pipeline_id: pipelineId })).length;
    if (n) return { ok: false, error: `This pipeline still has ${n} ${n === 1 ? "deal" : "deals"}. Delete or move ${n === 1 ? "it" : "them"} first.` };
    const stages = await store.all("pipeline_stages", { pipeline_id: pipelineId });
    await store.remove("pipeline_stages", stages.map((s) => s.id));
    return (await store.remove("pipelines", [pipelineId])) ? { ok: true } : { ok: false, error: "Pipeline not found." };
  });
}

export async function updateDeal(dealId: string, patch: z.infer<typeof DealPatch>): Promise<Result> {
  return withStore((store) => updateDealRow(store, dealId, patch));
}

export async function addActivity(input: z.input<typeof ActivityInput>): Promise<Result> {
  return withStore((store) => addActivityRow(store, input));
}

export async function setTaskDone(activityId: string, done: boolean): Promise<Result> {
  return withStore(async (store) => ((await store.update("activities", activityId, { done_at: done ? new Date().toISOString() : null })) ? { ok: true } : { ok: false, error: "Task not found." }));
}

export async function clearNextStep(dealId: string): Promise<Result> {
  return withStore(async (store) => ((await store.update("deals", dealId, { next_step: null, next_step_due: null })) ? { ok: true } : { ok: false, error: "Deal not found." }));
}

export async function markSignalsRead(ids: string[]): Promise<Result> {
  return withStore(async (store) => {
    const at = new Date().toISOString();
    for (const s of ids.slice(0, 200)) await store.update("signals", s, { read_at: at });
    return { ok: true };
  });
}

const SettingsInput = z.object({
  role_keywords: z.array(text(60).min(1)).max(20),
  default_pages: z.array(z.string().trim().regex(/^\/[\w\-./]*$/).max(80)).max(6),
  weights: z.object({ funding: z.number().min(0).max(100), hiring: z.number().min(0).max(100), tech: z.number().min(0).max(100), news_tagged: z.number().min(0).max(100), news_other: z.number().min(0).max(100), site: z.number().min(0).max(100) }),
  action_ceiling_usd: z.number().positive().max(1000).nullable(),
  daily_budget_usd: z.number().min(0).max(9999),
  monthly_budget_usd: z.number().min(0).max(9999),
});

export async function saveSettings(input: z.input<typeof SettingsInput>): Promise<Result> {
  return withStore(async (store) => {
    const p = SettingsInput.safeParse(input);
    if (!p.success) return { ok: false, error: "Check the values: page paths start with /, weights are 0 to 100." };
    const [row] = await store.all("settings");
    if (row) await store.update("settings", row.id, p.data);
    else await store.insert("settings", [{ ...DEFAULT_SETTINGS, ...p.data }]);
    return { ok: true };
  });
}

/** Deletes every row in the workspace. Owner only. The sign-ins and the members stay. */
export async function deleteAllData(confirm: string): Promise<Result> {
  return withStore(async (store, session) => {
    if (session.workspace.role !== "owner") return { ok: false, error: "Only the workspace owner can delete all data." };
    if (confirm !== "delete") return { ok: false, error: "Type delete to confirm." };
    for (const t of [...TABLE_NAMES].reverse()) {
      const rows = await store.all(t);
      for (let i = 0; i < rows.length; i += 200) await store.remove(t, rows.slice(i, i + 200).map((r) => r.id));
    }
    return { ok: true };
  });
}

const TEAM_ERRORS: Record<TeamRefusal, string> = {
  invalid: "Enter a valid email address.",
  already: "That email is already in this workspace.",
  has_workspace: "That person already works in another workspace with data in it. They need to delete that data first, or use another email.",
  self: "You cannot remove yourself.",
  not_found: "That email is not in this workspace.",
  forbidden: "Only the workspace owner can change the team.",
};
const team = (r: TeamResult): Result => (r.ok ? { ok: true } : { ok: false, error: TEAM_ERRORS[r.reason] });

export async function inviteMember(email: string): Promise<Result> {
  return withStore(async (store) => team(await store.inviteMember(z.string().max(254).catch("").parse(email))));
}

export async function removeMember(email: string): Promise<Result> {
  return withStore(async (store) => team(await store.removeMember(z.string().max(254).catch("").parse(email))));
}

export async function renameWorkspace(name: string): Promise<Result> {
  return withStore(async (store) => team(await store.renameWorkspace(z.string().max(200).catch("").parse(name))));
}

/** Read for the contact drawer. */
export async function loadContactTimeline(contactId: string): Promise<TimelineEntry[]> {
  const session = await getSession();
  return session ? contactTimeline(session.store, contactId) : [];
}

/** Read for the deal sheet. */
export async function loadDeal(dealId: string): Promise<DealDetail | null> {
  const session = await getSession();
  return session ? dealDetail(session.store, dealId) : null;
}

export async function signOut() {
  if (!IS_DEMO) await (await serverSupabase()).auth.signOut();
  redirect(IS_DEMO ? "/" : "/login");
}
