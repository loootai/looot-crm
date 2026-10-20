import { budgetRefusal } from "../budget";
import { costOf, LoootError, type LoootRun } from "../looot";
import { loadPipelines } from "../pipelines";
import { round6 } from "../jobs";
import type { Store } from "../store/types";
import { CRON_KEY_PREFIX, runAllowance, weekOf, weekSpend, type CronConfig } from "./config";

/** The provider that filters people by country, title and company industry. Priced per result returned. */
export const PROSPECT_ENDPOINT = "icypeas-find-people";
export const PROSPECT_PRICE_PER_RESULT = 0.00038;
/** The provider holds at least 100 results' worth while a run is open, so that is what is reserved. */
export const PROSPECT_HOLD_USD = round6(100 * PROSPECT_PRICE_PER_RESULT);
/** People asked for per run. More than are added, so the ones already in the CRM can be skipped. */
export const PROSPECT_PAGE = 50;

/** The people search for a configuration: the country, titles and (when set) industries. */
export function prospectQuery(config: Pick<CronConfig, "prospectCountry" | "prospectTitles" | "prospectIndustries">) {
  const query: Record<string, unknown> = { location: { include: [config.prospectCountry] }, currentJobTitle: { include: config.prospectTitles } };
  if (config.prospectIndustries.length) query["currentCompany.industry"] = { include: config.prospectIndustries };
  return { query, pagination: { size: PROSPECT_PAGE } };
}

export interface Lead {
  name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  linkedin: string | null;
  company: string;
  industry: string | null;
  employees: number | null;
  website: string | null;
  companyAddress: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Finds the `leads` array in a people-search result, wherever the envelope put it. */
function findLeads(v: unknown, depth = 0): unknown[] | null {
  if (depth > 5 || typeof v !== "object" || v === null) return null;
  if (Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.leads)) return o.leads;
  for (const child of Object.values(o)) {
    const found = findLeads(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Reads the people of a search result. Rows without a full name or a company are dropped. */
export function parseLeads(result: unknown): Lead[] {
  const out: Lead[] = [];
  for (const row of findLeads(result) ?? []) {
    if (typeof row !== "object" || row === null) continue;
    const o = row as Record<string, unknown>;
    const first = str(o.firstname) ?? str(o.first_name), last = str(o.lastname) ?? str(o.last_name);
    const company = str(o.lastCompanyName) ?? str(o.company);
    if (!first || !last || !company) continue;
    const size = typeof o.lastCompanySize === "number" ? o.lastCompanySize : null;
    out.push({
      name: `${first} ${last}`,
      first_name: first,
      last_name: last,
      title: str(o.lastJobTitle) ?? str(o.headline),
      linkedin: str(o.profileUrl),
      company,
      industry: str(o.lastCompanyIndustry),
      employees: size,
      website: str(o.lastCompanyWebsite),
      companyAddress: str(o.lastCompanyAddress),
    });
  }
  return out;
}

/** The bare host of a website (no www), or null when it is not a URL or is a link shortener. */
export function domainOf(website: string | null): string | null {
  if (!website) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".") || /(^|\.)(lnkd\.in|bit\.ly|t\.co|tinyurl\.com|linktr\.ee)$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/** A LinkedIn profile URL in one form, so the same person matches however it was written. */
export const normLinkedIn = (u: string | null | undefined) =>
  u ? u.toLowerCase().replace(/^https?:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com/, "linkedin.com").replace(/[?#].*$/, "").replace(/\/+$/, "") : null;
const normName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\b(s\.?a\.?|sgps|lda|ltd|inc|plc|gmbh|group|grupo)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** The country's top-level domain (GB uses .uk) and its English name, for telling local organisations apart. */
function localMarks(country: string): { tld: string; name: string | null } {
  const cc = country.toUpperCase();
  let name: string | null = null;
  try {
    name = new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? null;
  } catch {
    name = null;
  }
  return { tld: `.${cc === "GB" ? "uk" : cc.toLowerCase()}`, name: name && name !== cc ? name : null };
}

/** Whether a lead's organisation is based in `country`: a website on its domain, or an address that names it. */
export function isLocal(l: Lead, country: string): boolean {
  if (!country) return false;
  const { tld, name } = localMarks(country);
  return Boolean(domainOf(l.website)?.endsWith(tld) || (name && (l.companyAddress ?? "").toLowerCase().includes(name.toLowerCase())));
}

/** Organisations based in `country` first, then larger ones; `localOnly` drops the rest. */
export function rankLeads(leads: Lead[], country: string, localOnly = false): Lead[] {
  const local = (l: Lead) => (isLocal(l, country) ? 1 : 0);
  return leads.filter((l) => !localOnly || isLocal(l, country)).sort((a, b) => local(b) - local(a) || (b.employees ?? 0) - (a.employees ?? 0));
}

/** Leads whose person and company are both new to the CRM, one per company. */
export function newLeads(leads: Lead[], existing: { companies: { name: string; domain: string }[]; contacts: { linkedin_url: string | null }[] }): Lead[] {
  const people = new Set(existing.contacts.map((c) => normLinkedIn(c.linkedin_url)).filter(Boolean));
  const domains = new Set(existing.companies.map((c) => c.domain.toLowerCase().replace(/^www\./, "")));
  const names = new Set(existing.companies.map((c) => normName(c.name)).filter(Boolean));
  const out: Lead[] = [];
  for (const l of leads) {
    const d = domainOf(l.website), n = normName(l.company);
    if (people.has(normLinkedIn(l.linkedin)) || (d && domains.has(d)) || (n && names.has(n))) continue;
    out.push(l);
    if (d) domains.add(d);
    if (n) names.add(n);
  }
  return out;
}

export interface ProspectReport {
  status: "ran" | "replayed" | "skipped";
  reason?: string;
  found: number;
  added: Lead[];
  spentUsd: number;
  reviewer: string;
}

export interface ProspectDeps {
  store: Store;
  looot: { runEndpoint(endpointId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<LoootRun>; balance?: () => Promise<number | null> };
  config: CronConfig;
  now: Date;
}

/** " (Banking, about 2356 people)", or "" when neither is known. */
const about = (l: Lead) => {
  const parts = [l.industry, l.employees ? `about ${l.employees} people` : null].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
};

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "company";

/**
 * The weekly prospect search: people with the configured titles in the configured country (and
 * industries, when set). Adds up
 * to `prospectsPerRun` new people as cards at the first open stage of the prospect board, for the
 * reviewer to pick or decline. Looks up no emails. Recorded as a find_people action, reserved
 * against the workspace budget like any paid call, and kept within the scheduled jobs' caps.
 */
export async function runProspects(deps: ProspectDeps): Promise<ProspectReport> {
  const { store, config, now } = deps;
  const base = { found: 0, added: [] as Lead[], spentUsd: 0, reviewer: config.prospectReviewer };
  const board = (await loadPipelines(store)).find((p) => p.name === config.prospectBoard && p.subject === "company");
  const first = board?.stages.find((s) => s.kind === "open");
  if (!board || !first) return { ...base, status: "skipped", reason: `No company board named "${config.prospectBoard}" with an open stage.` };
  if (!config.prospectCountry) return { ...base, status: "skipped", reason: "Set CRON_PROSPECT_COUNTRY (a two-letter country code) to run the prospect search." };

  const actionKey = `${CRON_KEY_PREFIX}prospects:${weekOf(now)}`;
  const [already] = await store.all("actions", { action_key: actionKey });
  if (already) return { ...base, status: "replayed", spentUsd: Number(already.actual_usd) };

  const allowance = runAllowance(config, await weekSpend(store, now));
  if (allowance < PROSPECT_HOLD_USD) return { ...base, status: "skipped", reason: `The weekly cap of scheduled jobs leaves $${allowance.toFixed(4)}; a prospect search holds $${PROSPECT_HOLD_USD.toFixed(4)}.` };
  const balance = deps.looot.balance ? await deps.looot.balance().catch(() => null) : null;
  if (balance !== null && balance < PROSPECT_HOLD_USD) return { ...base, status: "skipped", reason: `The looot balance ($${balance.toFixed(2)}) is below what a search holds. Top up at looot.ai.` };

  const estimate = round6(PROSPECT_PAGE * PROSPECT_PRICE_PER_RESULT);
  const [action] = await store.insertIgnore("actions", [{ action_key: actionKey, kind: "find_people", target_count: 1, target_label: `Weekly prospects for ${config.prospectBoard}`, estimate_usd: estimate, max_cost_usd: PROSPECT_HOLD_USD, actual_usd: 0, status: "running" }], ["action_key"]);
  if (!action) return { ...base, status: "replayed" };
  const key = `crm:${actionKey}:people.search:prospects`;
  const reserved = await store.reserveBudget({ actionId: action.id, key, jobId: "people.search", amountUsd: PROSPECT_HOLD_USD, now });
  if (!reserved.ok) {
    const reason = reserved.reason === "budget" ? budgetRefusal(reserved.scope, reserved.budget, PROSPECT_HOLD_USD) : "This search already ran.";
    await store.update("actions", action.id, { status: "failed", finished_at: now.toISOString() });
    return { ...base, status: "skipped", reason };
  }
  const [row] = await store.insert("runs", [{ action_id: action.id, job_id: "people.search", step: "search", target_type: null, target_id: null, idempotency_key: key, cap_usd: PROSPECT_HOLD_USD, cost_usd: 0, status: "running", outcome: null }]);

  let run: LoootRun;
  try {
    run = await deps.looot.runEndpoint(PROSPECT_ENDPOINT, prospectQuery(config), key);
  } catch (e) {
    const refused = e instanceof LoootError && e.status >= 400 && e.status < 500;
    const msg = e instanceof Error ? e.message : "The request to looot failed";
    await store.update("runs", row.id, { status: refused ? "failed" : "no_answer", outcome: refused ? "failed" : null, error: msg });
    if (refused) await store.releaseReservation(key, now);
    await store.update("actions", action.id, { status: refused ? "failed" : "partial", finished_at: now.toISOString() });
    return { ...base, status: "skipped", reason: msg };
  }
  const cost = round6(Math.min(PROSPECT_HOLD_USD, Math.max(0, costOf(run) ?? 0)));
  if (run.status !== "completed") {
    await store.update("runs", row.id, { looot_run_id: run.runId, status: run.status, outcome: "failed", cost_usd: cost, error: run.error?.message ?? `Run ${run.status}` });
    if (cost > 0) await store.settleReservation(key, now);
    else await store.releaseReservation(key, now);
    await store.update("actions", action.id, { status: "failed", actual_usd: cost, finished_at: now.toISOString() });
    return { ...base, status: "skipped", reason: run.error?.message ?? `The search ended as ${run.status}.`, spentUsd: cost };
  }

  const leads = parseLeads(run.result);
  const [companies, contacts] = await Promise.all([store.all("companies"), store.all("contacts")]);
  const picked = newLeads(rankLeads(leads, config.prospectCountry, config.prospectLocalOnly), { companies, contacts }).slice(0, config.prospectsPerRun);
  const taken = new Set(companies.map((c) => c.domain));
  const deals = await store.all("deals", { pipeline_id: board.id });
  const top = deals.reduce((m, d) => Math.max(m, Number(d.position) || 0), 0);
  for (const [i, l] of picked.entries()) {
    let domain = domainOf(l.website) ?? `${slug(l.company)}.invalid`;
    if (taken.has(domain)) domain = `${slug(l.company)}-${i}.invalid`;
    taken.add(domain);
    const [company] = await store.insert("companies", [{ name: l.company, domain, industry: l.industry, employees: l.employees, hq: l.companyAddress }]);
    const [contact] = await store.insert("contacts", [{ company_id: company.id, first_name: l.first_name, last_name: l.last_name, title: l.title, linkedin_url: l.linkedin, source: "looot" }]);
    const [deal] = await store.insert("deals", [{ pipeline_id: board.id, company_id: company.id, name: config.prospectCardName, stage: first.key, currency: board.currency, next_step: `${config.prospectReviewer}: review prospect (pick or decline)`, position: top + (i + 1) * 1000 }]);
    await store.insert("activities", [
      {
        kind: "note",
        company_id: company.id,
        contact_id: contact.id,
        deal_id: deal.id,
        body: `Found by the weekly prospect search: ${l.name}, ${l.title ?? "no title"}${about(l)}. No email looked up yet.`,
        meta: { import: "cron:prospects" },
      },
    ]);
  }
  await store.update("runs", row.id, { looot_run_id: run.runId, status: run.status, outcome: leads.length ? "data" : "no_result", cost_usd: cost, note: `${leads.length} found, ${picked.length} added` });
  await store.settleReservation(key, now);
  await store.update("actions", action.id, { status: "done", actual_usd: cost, finished_at: now.toISOString() });
  return { ...base, status: "ran", found: leads.length, added: picked, spentUsd: cost };
}
