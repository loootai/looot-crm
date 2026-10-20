import { z } from "zod";
import { cleanDomain } from "./format";
import { isClosed, loadPipelines, type PipelineView } from "./pipelines";
import { loadSettings } from "./runner";
import type { Store } from "./store/types";
import type { Stage } from "./types";

/**
 * Writes that more than one surface makes: the app's server actions and the MCP tools. Each takes a
 * Store, so row level security (or the demo store) decides what it reaches, and each writes the same
 * rows and activities whichever surface called it.
 */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const id = z.string().min(1).max(80);
export const text = (max: number) => z.string().trim().max(max);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function createCompanyRow(store: Store, input: { name: string; domain: string; industry?: string | null }): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  const domain = cleanDomain(input.domain);
  if (!name) return { ok: false, error: "Enter the company name." };
  if (!domain) return { ok: false, error: "Enter a domain such as example.com." };
  const settings = await loadSettings(store);
  const industry = input.industry?.trim().slice(0, 120) || null;
  const made = await store.insertIgnore("companies", [{ name, domain, industry, watched_pages: settings.default_pages.map((p) => `https://${domain}${p}`) }], ["domain"]);
  if (!made.length) return { ok: false, error: `${domain} is already in your companies.` };
  return { ok: true, id: made[0].id };
}

export const ContactInput = z.object({ company_id: id.nullable(), first_name: text(80).min(1), last_name: text(80), title: text(120).nullable(), email: z.string().trim().email().max(200).nullable().or(z.literal("").transform(() => null)), linkedin_url: text(300).nullable() });

export async function createContactRow(store: Store, input: z.input<typeof ContactInput>): Promise<Result<{ id: string }>> {
  const p = ContactInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Enter a first name and a valid email, or leave the email empty." };
  if (p.data.company_id && !(await store.get("companies", p.data.company_id))) return { ok: false, error: "Company not found." };
  const [row] = await store.insert("contacts", [{ ...p.data, linkedin_url: p.data.linkedin_url || null, title: p.data.title || null, source: "manual" }]);
  return { ok: true, id: row.id };
}

export const DealInput = z.object({
  pipeline_id: id,
  company_id: id.nullable().optional(),
  contact_id: id.nullable().optional(),
  name: text(160).min(1),
  amount: z.number().min(0).max(1e10),
  stage: z.string().min(1).max(40),
  close_date: DATE.nullable(),
  next_step: text(200).nullable().optional(),
});

export async function pipelineOf(store: Store, pipelineId: string): Promise<PipelineView | undefined> {
  return (await loadPipelines(store)).find((p) => p.id === pipelineId);
}

/** The end of a stage column, so a new or moved card lands last. */
export async function endOf(store: Store, pipelineId: string, stage: Stage): Promise<number> {
  const inStage = await store.all("deals", { pipeline_id: pipelineId, stage });
  return inStage.reduce((m, d) => Math.max(m, d.position), 0) + 1000;
}

/** `meta` is merged into the activity a write records, e.g. `{ via: "mcp" }`, so the history says where a change came from. */
type Meta = Record<string, unknown>;

export async function createDealRow(store: Store, input: z.input<typeof DealInput>, meta: Meta = {}): Promise<Result<{ id: string }>> {
  const p = DealInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Enter a deal name and pick who it is with." };
  const pipeline = await pipelineOf(store, p.data.pipeline_id);
  if (!pipeline) return { ok: false, error: "That pipeline does not exist." };
  const stage = pipeline.stages.find((s) => s.key === p.data.stage);
  if (!stage) return { ok: false, error: "Pick a stage of this pipeline." };
  let companyId = p.data.company_id || null;
  const contactId = pipeline.subject === "person" ? p.data.contact_id || null : null;
  if (pipeline.subject === "person") {
    const person = contactId ? await store.get("contacts", contactId) : null;
    if (!person) return { ok: false, error: "Pick a person." };
    companyId = person.company_id;
  } else if (!companyId || !(await store.get("companies", companyId))) return { ok: false, error: "Pick a company." };
  const now = new Date().toISOString();
  const [row] = await store.insert("deals", [
    {
      pipeline_id: pipeline.id,
      company_id: pipeline.subject === "person" ? null : companyId,
      contact_id: contactId,
      name: p.data.name,
      stage: stage.key,
      amount_cents: pipeline.trackAmount ? Math.round(p.data.amount * 100) : 0,
      currency: pipeline.currency,
      close_date: p.data.close_date,
      next_step: p.data.next_step || null,
      position: await endOf(store, pipeline.id, stage.key),
      stage_changed_at: now,
    },
  ]);
  await store.insert("activities", [{ kind: "stage_change", company_id: companyId, contact_id: contactId, deal_id: row.id, meta: { ...meta, from: null, to: stage.key, toLabel: stage.label } }]);
  return { ok: true, id: row.id };
}

/** Moves a deal to a stage of its pipeline (and a position inside it) and writes a stage-change activity when the stage differs. */
export async function moveDealRow(store: Store, dealId: string, stage: Stage, position?: number, reason?: string, meta: Meta = {}): Promise<Result> {
  const deal = await store.get("deals", dealId);
  if (!deal) return { ok: false, error: "Deal not found." };
  const pipeline = await pipelineOf(store, deal.pipeline_id);
  const to = pipeline?.stages.find((s) => s.key === stage);
  if (!pipeline || !to) return { ok: false, error: "Unknown stage." };
  const fromStage = pipeline.stages.find((s) => s.key === deal.stage);
  const pos = position === undefined || !Number.isFinite(position) ? await endOf(store, pipeline.id, stage) : position;
  const changed = deal.stage !== stage;
  const closed = isClosed(to.kind);
  await store.update("deals", dealId, {
    stage,
    position: pos,
    ...(changed ? { stage_changed_at: new Date().toISOString(), closed_reason: closed ? (reason?.trim().slice(0, 200) || null) : null } : {}),
  });
  if (changed) {
    const fromLabel = fromStage?.label ?? deal.stage;
    await store.insert("activities", [
      {
        kind: "stage_change",
        company_id: deal.company_id ?? (deal.contact_id ? ((await store.get("contacts", deal.contact_id))?.company_id ?? null) : null),
        contact_id: deal.contact_id,
        deal_id: deal.id,
        body: closed && reason ? reason.trim().slice(0, 200) : null,
        meta: { ...meta, from: deal.stage, to: stage, fromLabel, toLabel: to.label, label: `${fromLabel} to ${to.label}` },
      },
    ]);
  }
  return { ok: true };
}

export const DealPatch = z.object({ name: text(160).min(1), amount: z.number().min(0).max(1e10), close_date: DATE.nullable(), next_step: text(200).nullable(), next_step_due: DATE.nullable() }).partial();

export async function updateDealRow(store: Store, dealId: string, patch: z.infer<typeof DealPatch>): Promise<Result> {
  const p = DealPatch.safeParse(patch);
  if (!p.success) return { ok: false, error: "That value is not valid." };
  const { amount, ...rest } = p.data;
  const row = await store.update("deals", dealId, { ...rest, ...(rest.next_step === "" ? { next_step: null } : {}), ...(amount === undefined ? {} : { amount_cents: Math.round(amount * 100) }) });
  return row ? { ok: true } : { ok: false, error: "Deal not found." };
}

export const ActivityInput = z.object({ kind: z.enum(["note", "call", "meeting", "task"]), body: text(4000).min(1), company_id: id.nullable(), contact_id: id.nullable().optional(), deal_id: id.nullable().optional(), due_at: DATE.nullable().optional() });

export async function addActivityRow(store: Store, input: z.input<typeof ActivityInput>, meta: Meta = {}): Promise<Result> {
  const p = ActivityInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Write something first." };
  await store.insert("activities", [
    { kind: p.data.kind, body: p.data.body, company_id: p.data.company_id, contact_id: p.data.contact_id ?? null, deal_id: p.data.deal_id ?? null, due_at: p.data.kind === "task" && p.data.due_at ? `${p.data.due_at}T17:00:00.000Z` : null, meta },
  ]);
  return { ok: true };
}
