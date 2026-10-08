import { createHash } from "node:crypto";
import { JOBS, type JobId, type PriceMap, round6 } from "./jobs";
import { fullName } from "./format";
import type { ActionKind, Company, Contact, Settings } from "./types";

export const STEP_IDS = ["hiring", "news", "tech", "funding", "site", "enrich", "email", "verify", "phone", "search"] as const;
export type StepId = (typeof STEP_IDS)[number];

export const STEP_JOB: Record<StepId, JobId> = {
  hiring: "jobs.search",
  news: "news.search",
  tech: "company.technographics",
  funding: "company.funding",
  site: "web.scrape.markdown",
  enrich: "company.enrich",
  email: "people.email.find",
  verify: "people.email.verify",
  phone: "people.phone.find",
  search: "people.search",
};

export const STEP_LABEL: Record<StepId, string> = {
  hiring: "Hiring",
  news: "News",
  tech: "Tech stack",
  funding: "Funding",
  site: "Site changes",
  enrich: "Company details",
  email: "Find work email",
  verify: "Verify email",
  phone: "Find phone",
  search: "Find people",
};

/** Steps each action kind runs, in order. */
export const KIND_STEPS: Record<ActionKind, StepId[]> = {
  intent_refresh: ["hiring", "news", "tech", "funding", "site"],
  company_enrich: ["enrich"],
  contact_enrich: ["email", "verify", "phone"],
  email_verify: ["verify"],
  find_people: ["search"],
};

export interface PlanLine {
  step: StepId;
  jobId: JobId;
  targetType: "company" | "contact";
  targetId: string;
  targetLabel: string;
  input: Record<string, unknown>;
  /** Estimate for this one run. */
  quote: number;
  /** The most looot may charge for this run. */
  cap: number;
  /** Set for page reads: the page URL, hashed into the idempotency key. */
  url?: string;
}

export interface Plan {
  kind: ActionKind;
  title: string;
  targetLabel: string;
  targetCount: number;
  lines: PlanLine[];
  estimate: number;
  worstCase: number;
}

export interface PlanInput {
  kind: ActionKind;
  companies?: Company[];
  contacts?: Contact[];
  /** Company of each contact, by id. Needed for the domain. */
  companyOf?: Map<string, Company>;
  steps?: StepId[];
  prices: PriceMap;
  settings: Pick<Settings, "role_keywords" | "default_pages">;
  options?: { keywords?: string[]; limit?: number };
}

const TITLES: Record<ActionKind, string> = {
  intent_refresh: "Refresh intent",
  company_enrich: "Enrich company",
  contact_enrich: "Enrich",
  email_verify: "Verify emails",
  find_people: "Find more people like",
};

/** Pages to watch for a company: its own list, or the default paths on its domain. */
export function watchedPages(company: Pick<Company, "domain" | "watched_pages">, defaults: string[]): string[] {
  if (company.watched_pages?.length) return company.watched_pages;
  return defaults.map((p) => `https://${company.domain}${p.startsWith("/") ? p : `/${p}`}`);
}

/**
 * Builds the list of looot runs an action would make, with the estimate and the worst case.
 * Built on the server from record ids. Spends nothing. Contact steps that would find a value the
 * contact already has are left out.
 */
export function buildPlan(p: PlanInput): Plan {
  const allowed = new Set<StepId>(KIND_STEPS[p.kind]);
  const steps = (p.steps?.length ? p.steps : KIND_STEPS[p.kind]).filter((s) => allowed.has(s));
  const order = KIND_STEPS[p.kind].filter((s) => steps.includes(s));
  const lines: PlanLine[] = [];
  const line = (step: StepId, targetType: "company" | "contact", targetId: string, targetLabel: string, input: Record<string, unknown>, url?: string) => {
    const jobId = STEP_JOB[step];
    lines.push({ step, jobId, targetType, targetId, targetLabel, input, quote: p.prices[jobId], cap: JOBS[jobId].cap, url });
  };

  for (const c of p.companies ?? []) {
    for (const s of order) {
      if (s === "hiring") {
        const words = p.settings.role_keywords.filter((k) => k.trim());
        line(s, "company", c.id, c.name, { query: words.length ? `${c.name} ${words.join(" OR ")}` : c.name, company: c.name });
      } else if (s === "news") line(s, "company", c.id, c.name, { query: `"${c.name}"` });
      else if (s === "tech" || s === "funding" || s === "enrich") line(s, "company", c.id, c.name, { domain: c.domain });
      else if (s === "site") for (const url of watchedPages(c, p.settings.default_pages)) line(s, "company", c.id, c.name, { url }, url);
    }
  }

  for (const c of p.contacts ?? []) {
    const company = c.company_id ? p.companyOf?.get(c.company_id) : undefined;
    const who = { first_name: c.first_name, last_name: c.last_name, domain: company?.domain, ...(c.linkedin_url ? { linkedin_url: c.linkedin_url } : {}) };
    const label = fullName(c);
    for (const s of order) {
      if (s === "email" && !c.email) line(s, "contact", c.id, label, who);
      else if (s === "verify") {
        const willFind = order.includes("email") && !c.email;
        const needs = p.kind === "email_verify" ? !!c.email : willFind || (!!c.email && c.email_status === "unchecked");
        if (needs) line(s, "contact", c.id, label, { email: c.email ?? "" });
      } else if (s === "phone" && !c.phone) line(s, "contact", c.id, label, who);
      else if (s === "search") {
        const limit = Math.max(1, Math.min(25, Math.floor(p.options?.limit ?? 10)));
        const keywords = (p.options?.keywords ?? []).map((k) => k.trim()).filter(Boolean);
        line(s, "contact", c.id, label, { domain: company?.domain, company: company?.name, job_title: keywords.join(", "), limit });
        // People search is priced per result, so the estimate follows the number asked for.
        const l = lines[lines.length - 1];
        l.quote = round6(Math.max(JOBS["people.search"].perCall, (p.prices["people.search"] / JOBS["people.search"].results) * limit));
      }
    }
  }

  const targets = [...(p.companies ?? []).map((c) => c.name), ...(p.contacts ?? []).map(fullName)];
  const noun = p.companies?.length ? "accounts" : "contacts";
  const targetLabel = targets.length === 1 ? targets[0] : `${targets.length} ${noun}`;
  return {
    kind: p.kind,
    title: p.kind === "find_people" ? `${TITLES[p.kind]} ${targetLabel}` : targets.length === 1 ? `${TITLES[p.kind]}: ${targetLabel}` : `${TITLES[p.kind]} ${targetLabel}`,
    targetLabel,
    targetCount: targets.length,
    lines,
    estimate: round6(lines.reduce((s, l) => s + l.quote, 0)),
    worstCase: round6(lines.reduce((s, l) => s + l.cap, 0)),
  };
}

/** Idempotency key of one run: crm:<actionKey>:<job id>:<target id>[:<first 12 hex of sha256(url)>]. */
export function idempotencyKey(actionKey: string, line: Pick<PlanLine, "jobId" | "targetId" | "url">): string {
  const base = `crm:${actionKey}:${line.jobId}:${line.targetId}`;
  return line.url ? `${base}:${createHash("sha256").update(line.url).digest("hex").slice(0, 12)}` : base;
}

export interface QuoteRow {
  step: StepId;
  label: string;
  jobId: JobId;
  runs: number;
  estimate: number;
  cap: number;
}

/** One row per step for the quote dialog: runs, summed estimate, summed cap. */
export function quoteRows(lines: PlanLine[]): QuoteRow[] {
  const rows = new Map<StepId, QuoteRow>();
  for (const l of lines) {
    const r = rows.get(l.step) ?? { step: l.step, label: STEP_LABEL[l.step], jobId: l.jobId, runs: 0, estimate: 0, cap: 0 };
    r.runs++;
    r.estimate = round6(r.estimate + l.quote);
    r.cap = round6(r.cap + l.cap);
    rows.set(l.step, r);
  }
  return [...rows.values()];
}
