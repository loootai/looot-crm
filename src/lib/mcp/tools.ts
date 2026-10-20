import { z } from "zod";
import { fullName } from "../format";
import { isClosed, loadPipelines, type PipelineView } from "../pipelines";
import { pipelineTags } from "../queries";
import { addActivityRow, createCompanyRow, createContactRow, createDealRow, moveDealRow, updateDealRow, type Result } from "../records";
import type { Store } from "../store/types";
import type { Activity, Deal } from "../types";

/**
 * The CRM as MCP tools. Each tool runs on a Store, so the signed-in person's row level security (or the
 * demo store) bounds what it reads and writes, and writes go through the same functions as the app.
 * Deliberately non-destructive: no deletes, no team, budget or settings changes, and no paid looot
 * actions (those stay in the app, behind its quote and budget). Every write records an activity, owned
 * by the signed-in person (the database default), tagged `via: "mcp"`.
 */
export interface CrmTool {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  readOnly: boolean;
  run: (store: Store, args: Record<string, unknown>) => Promise<unknown>;
}

/** A refusal the caller can act on. Returned to the client as a tool error with this message. */
export class ToolError extends Error {}

const need = <T extends object>(r: Result<T>): { ok: true } & T => {
  if (!r.ok) throw new ToolError(r.error);
  return r;
};

const ID = z.string().min(1).max(80);
/** Tags every activity an MCP write records, so the history shows the change came through Claude. */
const VIA = { via: "mcp" };
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

/** A pipeline by id or by name (case-insensitive). */
function findPipeline(pipelines: PipelineView[], ref: string): PipelineView {
  const p = pipelines.find((x) => x.id === ref) ?? pipelines.find((x) => x.name.toLowerCase() === ref.trim().toLowerCase());
  if (!p) throw new ToolError(`No pipeline called "${ref}". Pipelines: ${pipelines.map((x) => x.name).join(", ")}.`);
  return p;
}

/** A stage of a pipeline by key or by label (case-insensitive). */
function findStage(p: PipelineView, ref: string): string {
  const s = p.stages.find((x) => x.key === ref) ?? p.stages.find((x) => x.label.toLowerCase() === ref.trim().toLowerCase());
  if (!s) throw new ToolError(`"${ref}" is not a stage of ${p.name}. Stages: ${p.stages.map((x) => x.label).join(", ")}.`);
  return s.key;
}

const activityOut = (a: Activity) => ({ id: a.id, kind: a.kind, at: a.created_at, text: a.body ?? (a.meta as { label?: string; toLabel?: string } | null)?.label ?? (a.meta as { toLabel?: string } | null)?.toLabel ?? null });

async function dealsOut(store: Store, deals: Deal[], pipelines?: PipelineView[]) {
  const ps = pipelines ?? (await loadPipelines(store));
  return deals.map((d) => {
    const p = ps.find((x) => x.id === d.pipeline_id);
    const s = p?.stages.find((x) => x.key === d.stage);
    return { deal_id: d.id, name: d.name, pipeline: p?.name ?? null, stage: s?.label ?? d.stage, closed: isClosed(s?.kind), next_step: d.next_step, next_step_due: d.next_step_due, ...(p?.trackAmount ? { amount: d.amount_cents / 100, currency: d.currency } : {}) };
  });
}

export const CRM_TOOLS: CrmTool[] = [
  {
    name: "search",
    title: "Search the CRM",
    description: "Find companies (by name or domain) and people (by name, title or company). Returns ids for the other tools and the pipelines each record is in.",
    input: { query: z.string().trim().min(1).max(120).describe("Words to look for, e.g. 'harborline' or 'pentester'"), limit: z.number().int().min(1).max(50).optional().describe("Most results per kind, default 15") },
    readOnly: true,
    run: async (store, a) => {
      const q = String(a.query).toLowerCase();
      const limit = (a.limit as number | undefined) ?? 15;
      const [companies, contacts, deals, pipelines] = await Promise.all([store.all("companies"), store.all("contacts"), store.all("deals"), loadPipelines(store)]);
      const coName = new Map(companies.map((c) => [c.id, c.name]));
      return {
        companies: companies
          .filter((c) => `${c.name} ${c.domain}`.toLowerCase().includes(q))
          .slice(0, limit)
          .map((c) => ({ company_id: c.id, name: c.name, domain: c.domain, industry: c.industry, pipelines: pipelineTags(deals.filter((d) => d.company_id === c.id), pipelines) })),
        people: contacts
          .filter((c) => `${fullName(c)} ${c.title ?? ""} ${c.company_id ? coName.get(c.company_id) ?? "" : ""}`.toLowerCase().includes(q))
          .slice(0, limit)
          .map((c) => ({ person_id: c.id, name: fullName(c), title: c.title, company: c.company_id ? (coName.get(c.company_id) ?? null) : null, company_id: c.company_id, pipelines: pipelineTags(deals.filter((d) => d.contact_id === c.id || (!!c.company_id && d.company_id === c.company_id)), pipelines) })),
      };
    },
  },
  {
    name: "get_company",
    title: "Get a company",
    description: "A company with its people, its cards on every pipeline and its latest notes and activity.",
    input: { company_id: ID },
    readOnly: true,
    run: async (store, a) => {
      const c = await store.get("companies", String(a.company_id));
      if (!c) throw new ToolError("Company not found.");
      const [contacts, deals, acts] = await Promise.all([store.all("contacts", { company_id: c.id }), store.all("deals", { company_id: c.id }), store.all("activities", { company_id: c.id })]);
      return {
        company_id: c.id, name: c.name, domain: c.domain, industry: c.industry, hq: c.hq, description: c.description, linkedin_url: c.linkedin_url,
        people: contacts.map((p) => ({ person_id: p.id, name: fullName(p), title: p.title, email: p.email, linkedin_url: p.linkedin_url })),
        cards: await dealsOut(store, deals),
        activity: acts.sort((x, y) => (x.created_at < y.created_at ? 1 : -1)).slice(0, 20).map(activityOut),
      };
    },
  },
  {
    name: "get_person",
    title: "Get a person",
    description: "A person with their company, the cards about them or their company, and their latest notes and activity.",
    input: { person_id: ID },
    readOnly: true,
    run: async (store, a) => {
      const p = await store.get("contacts", String(a.person_id));
      if (!p) throw new ToolError("Person not found.");
      const [company, deals, acts] = await Promise.all([p.company_id ? store.get("companies", p.company_id) : null, store.all("deals"), store.all("activities", { contact_id: p.id })]);
      const mine = deals.filter((d) => d.contact_id === p.id || (!!p.company_id && d.company_id === p.company_id));
      return {
        person_id: p.id, name: fullName(p), title: p.title, email: p.email, phone: p.phone, linkedin_url: p.linkedin_url,
        company: company ? { company_id: company.id, name: company.name, domain: company.domain } : null,
        cards: await dealsOut(store, mine),
        activity: acts.sort((x, y) => (x.created_at < y.created_at ? 1 : -1)).slice(0, 20).map(activityOut),
      };
    },
  },
  {
    name: "list_pipelines",
    title: "List pipelines",
    description: "Every pipeline (board) with its stages in order and how many cards sit in each stage.",
    input: {},
    readOnly: true,
    run: async (store) => {
      const [pipelines, deals] = await Promise.all([loadPipelines(store), store.all("deals")]);
      return pipelines.map((p) => ({
        pipeline_id: p.id, name: p.name, cards_are_about: p.subject, tracks_amount: p.trackAmount, currency: p.currency,
        stages: p.stages.map((s) => ({ key: s.key, label: s.label, kind: s.kind, cards: deals.filter((d) => d.pipeline_id === p.id && d.stage === s.key).length })),
      }));
    },
  },
  {
    name: "list_cards",
    title: "List cards on a pipeline",
    description: "The cards on one pipeline, optionally only one stage, with who each card is about and its next step.",
    input: { pipeline: z.string().min(1).max(80).describe("Pipeline name or id"), stage: z.string().min(1).max(40).optional().describe("Stage label or key"), limit: z.number().int().min(1).max(500).optional().describe("Default 200") },
    readOnly: true,
    run: async (store, a) => {
      const pipelines = await loadPipelines(store);
      const p = findPipeline(pipelines, String(a.pipeline));
      const stage = a.stage ? findStage(p, String(a.stage)) : null;
      const [deals, companies, contacts] = await Promise.all([store.all("deals", { pipeline_id: p.id }), store.all("companies"), store.all("contacts")]);
      const co = new Map(companies.map((c) => [c.id, c.name]));
      const pe = new Map(contacts.map((c) => [c.id, fullName(c)]));
      const order = new Map(p.stages.map((s, i) => [s.key, i]));
      const rows = deals.filter((d) => !stage || d.stage === stage).sort((x, y) => (order.get(x.stage) ?? 99) - (order.get(y.stage) ?? 99) || x.position - y.position);
      const out = await dealsOut(store, rows.slice(0, (a.limit as number | undefined) ?? 200), pipelines);
      return {
        pipeline: p.name,
        total: rows.length,
        cards: out.map((c, i) => {
          const d = rows[i];
          return { ...c, about: d.contact_id ? { person_id: d.contact_id, name: pe.get(d.contact_id) ?? null } : { company_id: d.company_id, name: d.company_id ? (co.get(d.company_id) ?? null) : null } };
        }),
      };
    },
  },
  {
    name: "move_card",
    title: "Move a card",
    description: "Move a card to another stage of its pipeline. Records the move in the activity history, like dragging it on the board.",
    input: { deal_id: ID, stage: z.string().min(1).max(40).describe("Stage label or key, e.g. 'Contacted'"), reason: z.string().max(200).optional().describe("Why, when moving to a won or lost stage") },
    readOnly: false,
    run: async (store, a) => {
      const deal = await store.get("deals", String(a.deal_id));
      if (!deal) throw new ToolError("Card not found.");
      const p = findPipeline(await loadPipelines(store), deal.pipeline_id);
      const stage = findStage(p, String(a.stage));
      need(await moveDealRow(store, deal.id, stage, undefined, a.reason as string | undefined, VIA));
      return { ok: true, deal_id: deal.id, pipeline: p.name, stage: p.stages.find((s) => s.key === stage)?.label };
    },
  },
  {
    name: "add_note",
    title: "Add a note",
    description: "Add a note to a company, a person or a card. A note on a card or a person also shows on their company.",
    input: { body: z.string().trim().min(1).max(4000), company_id: ID.optional(), person_id: ID.optional(), deal_id: ID.optional() },
    readOnly: false,
    run: async (store, a) => {
      const dealId = (a.deal_id as string | undefined) ?? null;
      let personId = (a.person_id as string | undefined) ?? null;
      let companyId = (a.company_id as string | undefined) ?? null;
      if (!dealId && !personId && !companyId) throw new ToolError("Say which company, person or card the note is about.");
      if (dealId) {
        const d = await store.get("deals", dealId);
        if (!d) throw new ToolError("Card not found.");
        personId ??= d.contact_id;
        companyId ??= d.company_id;
      }
      if (personId) {
        const p = await store.get("contacts", personId);
        if (!p) throw new ToolError("Person not found.");
        companyId ??= p.company_id;
      }
      if (companyId && !(await store.get("companies", companyId))) throw new ToolError("Company not found.");
      need(await addActivityRow(store, { kind: "note", body: String(a.body), company_id: companyId, contact_id: personId, deal_id: dealId }, VIA));
      return { ok: true };
    },
  },
  {
    name: "set_next_step",
    title: "Set a card's next step",
    description: "Set or clear the next step on a card, with an optional due date. An empty text clears it.",
    input: { deal_id: ID, next_step: z.string().max(200), due: DATE.optional().describe("YYYY-MM-DD") },
    readOnly: false,
    run: async (store, a) => {
      const step = String(a.next_step).trim();
      const due = step ? ((a.due as string | undefined) ?? null) : null;
      const deal = await store.get("deals", String(a.deal_id));
      if (!deal) throw new ToolError("Card not found.");
      need(await updateDealRow(store, deal.id, { next_step: step || null, next_step_due: due }));
      const companyId = deal.company_id ?? (deal.contact_id ? ((await store.get("contacts", deal.contact_id))?.company_id ?? null) : null);
      need(await addActivityRow(store, { kind: "note", body: step ? `Next step: ${step}${due ? ` (due ${due})` : ""}` : "Next step cleared", company_id: companyId, contact_id: deal.contact_id, deal_id: deal.id }, { ...VIA, change: "next_step" }));
      return { ok: true };
    },
  },
  {
    name: "add_person",
    title: "Add a person",
    description: "Add a person, optionally at a company already in the CRM. Refuses a duplicate (same LinkedIn URL, or same name at the same company) and returns the existing id.",
    input: { first_name: z.string().trim().min(1).max(80), last_name: z.string().trim().max(80).optional(), title: z.string().trim().max(120).optional(), company_id: ID.optional(), linkedin_url: z.string().trim().max(300).optional(), email: z.string().trim().email().max(200).optional() },
    readOnly: false,
    run: async (store, a) => {
      const first = String(a.first_name), last = (a.last_name as string | undefined) ?? "";
      const companyId = (a.company_id as string | undefined) ?? null;
      const li = (a.linkedin_url as string | undefined) || null;
      const same = (await store.all("contacts")).find((c) => (li && c.linkedin_url === li) || (c.company_id === companyId && `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim().toLowerCase() === `${first} ${last}`.trim().toLowerCase()));
      if (same) throw new ToolError(`${fullName(same)} is already in the CRM (person_id ${same.id}).`);
      const r = need(await createContactRow(store, { company_id: companyId, first_name: first, last_name: last, title: (a.title as string | undefined) ?? null, email: (a.email as string | undefined) ?? null, linkedin_url: li }));
      need(await addActivityRow(store, { kind: "note", body: "Added through Claude", company_id: companyId, contact_id: r.id }, { ...VIA, change: "add_person" }));
      return { ok: true, person_id: r.id };
    },
  },
  {
    name: "add_company",
    title: "Add a company",
    description: "Add a company by name and website domain. Refuses a domain that is already in the CRM.",
    input: { name: z.string().trim().min(1).max(120), domain: z.string().trim().min(1).max(200).describe("e.g. example.com"), industry: z.string().trim().max(120).optional() },
    readOnly: false,
    run: async (store, a) => {
      const r = need(await createCompanyRow(store, { name: String(a.name), domain: String(a.domain), industry: (a.industry as string | undefined) ?? null }));
      need(await addActivityRow(store, { kind: "note", body: "Added through Claude", company_id: r.id }, { ...VIA, change: "add_company" }));
      return { ok: true, company_id: r.id };
    },
  },
  {
    name: "add_card",
    title: "Add a card to a pipeline",
    description: "Put a company or a person on a pipeline at a stage. Use company_id on company pipelines and person_id on people pipelines (see list_pipelines).",
    input: { pipeline: z.string().min(1).max(80).describe("Pipeline name or id"), stage: z.string().min(1).max(40).describe("Stage label or key"), name: z.string().trim().min(1).max(160).describe("Card title"), company_id: ID.optional(), person_id: ID.optional(), next_step: z.string().trim().max(200).optional(), amount: z.number().min(0).max(1e10).optional().describe("Deal value, on pipelines that track an amount") },
    readOnly: false,
    run: async (store, a) => {
      const p = findPipeline(await loadPipelines(store), String(a.pipeline));
      const stage = findStage(p, String(a.stage));
      if (p.subject === "person" && !a.person_id) throw new ToolError(`${p.name} holds people: give a person_id.`);
      if (p.subject === "company" && !a.company_id) throw new ToolError(`${p.name} holds companies: give a company_id.`);
      const r = need(await createDealRow(store, { pipeline_id: p.id, company_id: (a.company_id as string | undefined) ?? null, contact_id: (a.person_id as string | undefined) ?? null, name: String(a.name), amount: (a.amount as number | undefined) ?? 0, stage, close_date: null, next_step: (a.next_step as string | undefined) ?? null }, VIA));
      return { ok: true, deal_id: r.id, pipeline: p.name };
    },
  },
];

/** Runs a tool and shapes the answer the way MCP expects, turning refusals into tool errors. */
export async function callCrmTool(store: Store, tool: CrmTool, args: Record<string, unknown>) {
  try {
    const out = await tool.run(store, args);
    return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 1) }] };
  } catch (e) {
    const message = e instanceof ToolError ? e.message : "Something went wrong. Try again, or check the CRM in the browser.";
    if (!(e instanceof ToolError)) console.error("mcp tool failed", tool.name, e);
    return { isError: true, content: [{ type: "text" as const, text: message }] };
  }
}
