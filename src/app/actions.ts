"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cleanDomain } from "@/lib/format";
import { contactTimeline, dealDetail, type DealDetail, type TimelineEntry } from "@/lib/queries";
import { DEFAULT_SETTINGS, loadSettings } from "@/lib/runner";
import { getSession, IS_DEMO, type Store } from "@/lib/store";
import { serverSupabase } from "@/lib/supabase/server";
import { STAGE_LABEL, STAGES, TABLE_NAMES, type Stage } from "@/lib/types";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function withStore<T = object>(fn: (store: Store) => Promise<Result<T>>): Promise<Result<T>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in first." };
  try {
    const out = await fn(session.store);
    if (out.ok) revalidatePath("/", "layout");
    return out;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

const id = z.string().min(1).max(80);
const text = (max: number) => z.string().trim().max(max);

export async function createCompany(input: { name: string; domain: string }): Promise<Result<{ id: string }>> {
  return withStore<{ id: string }>(async (store) => {
    const name = input.name.trim();
    const domain = cleanDomain(input.domain);
    if (!name) return { ok: false, error: "Enter the company name." };
    if (!domain) return { ok: false, error: "Enter a domain such as example.com." };
    const settings = await loadSettings(store);
    const made = await store.insertIgnore("companies", [{ name, domain, watched_pages: settings.default_pages.map((p) => `https://${domain}${p}`) }], ["domain"]);
    if (!made.length) return { ok: false, error: `${domain} is already in your companies.` };
    return { ok: true, id: made[0].id };
  });
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

const ContactInput = z.object({ company_id: id.nullable(), first_name: text(80).min(1), last_name: text(80), title: text(120).nullable(), email: z.string().trim().email().max(200).nullable().or(z.literal("").transform(() => null)), linkedin_url: text(300).nullable() });

export async function createContact(input: z.input<typeof ContactInput>): Promise<Result<{ id: string }>> {
  return withStore<{ id: string }>(async (store) => {
    const p = ContactInput.safeParse(input);
    if (!p.success) return { ok: false, error: "Enter a first name and a valid email, or leave the email empty." };
    const [row] = await store.insert("contacts", [{ ...p.data, linkedin_url: p.data.linkedin_url || null, title: p.data.title || null, source: "manual" }]);
    return { ok: true, id: row.id };
  });
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

const DealInput = z.object({ company_id: id, name: text(160).min(1), amount: z.number().min(0).max(1e10), stage: z.enum(STAGES), close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() });

export async function createDeal(input: z.input<typeof DealInput>): Promise<Result<{ id: string }>> {
  return withStore<{ id: string }>(async (store) => {
    const p = DealInput.safeParse(input);
    if (!p.success) return { ok: false, error: "Enter a deal name, a company and an amount." };
    const inStage = await store.all("deals", { stage: p.data.stage });
    const position = inStage.reduce((m, d) => Math.max(m, d.position), 0) + 1000;
    const now = new Date().toISOString();
    const [row] = await store.insert("deals", [{ company_id: p.data.company_id, name: p.data.name, stage: p.data.stage, amount_cents: Math.round(p.data.amount * 100), close_date: p.data.close_date, position, stage_changed_at: now }]);
    await store.insert("activities", [{ kind: "stage_change", company_id: p.data.company_id, deal_id: row.id, meta: { from: null, to: p.data.stage } }]);
    return { ok: true, id: row.id };
  });
}

/** Moves a deal to a stage (and a position inside it) and writes a stage-change activity when the stage differs. */
export async function moveDeal(dealId: string, stage: Stage, position?: number, reason?: string): Promise<Result> {
  return withStore(async (store) => {
    if (!STAGES.includes(stage)) return { ok: false, error: "Unknown stage." };
    const deal = await store.get("deals", dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    let pos = position;
    if (pos === undefined || !Number.isFinite(pos)) {
      const inStage = await store.all("deals", { stage });
      pos = inStage.reduce((m, d) => Math.max(m, d.position), 0) + 1000;
    }
    const changed = deal.stage !== stage;
    const closed = stage === "won" || stage === "lost";
    await store.update("deals", dealId, {
      stage,
      position: pos,
      ...(changed ? { stage_changed_at: new Date().toISOString(), closed_reason: closed ? (reason?.trim().slice(0, 200) || null) : null } : {}),
    });
    if (changed) {
      await store.insert("activities", [
        { kind: "stage_change", company_id: deal.company_id, deal_id: deal.id, body: closed && reason ? reason.trim().slice(0, 200) : null, meta: { from: deal.stage, to: stage, label: `${STAGE_LABEL[deal.stage]} to ${STAGE_LABEL[stage]}` } },
      ]);
    }
    return { ok: true };
  });
}

const DealPatch = z.object({ name: text(160).min(1), amount: z.number().min(0).max(1e10), close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), next_step: text(200).nullable(), next_step_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).partial();

export async function updateDeal(dealId: string, patch: z.infer<typeof DealPatch>): Promise<Result> {
  return withStore(async (store) => {
    const p = DealPatch.safeParse(patch);
    if (!p.success) return { ok: false, error: "That value is not valid." };
    const { amount, ...rest } = p.data;
    const row = await store.update("deals", dealId, { ...rest, ...(rest.next_step === "" ? { next_step: null } : {}), ...(amount === undefined ? {} : { amount_cents: Math.round(amount * 100) }) });
    return row ? { ok: true } : { ok: false, error: "Deal not found." };
  });
}

const ActivityInput = z.object({ kind: z.enum(["note", "call", "meeting", "task"]), body: text(4000).min(1), company_id: id.nullable(), contact_id: id.nullable().optional(), deal_id: id.nullable().optional(), due_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() });

export async function addActivity(input: z.input<typeof ActivityInput>): Promise<Result> {
  return withStore(async (store) => {
    const p = ActivityInput.safeParse(input);
    if (!p.success) return { ok: false, error: "Write something first." };
    await store.insert("activities", [
      { kind: p.data.kind, body: p.data.body, company_id: p.data.company_id, contact_id: p.data.contact_id ?? null, deal_id: p.data.deal_id ?? null, due_at: p.data.kind === "task" && p.data.due_at ? `${p.data.due_at}T17:00:00.000Z` : null },
    ]);
    return { ok: true };
  });
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

/** Deletes every row the signed-in user owns. The sign-in itself stays. */
export async function deleteAllData(confirm: string): Promise<Result> {
  return withStore(async (store) => {
    if (confirm !== "delete") return { ok: false, error: "Type delete to confirm." };
    for (const t of [...TABLE_NAMES].reverse()) {
      const rows = await store.all(t);
      for (let i = 0; i < rows.length; i += 200) await store.remove(t, rows.slice(i, i + 200).map((r) => r.id));
    }
    return { ok: true };
  });
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
