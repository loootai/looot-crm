import { createHash } from "node:crypto";

export interface Item {
  url: string;
  title: string;
  date?: string;
  source?: string;
  company?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const URL_KEYS = ["url", "link", "job_url", "jobUrl", "apply_link", "applyLink", "share_link", "redirect_url"];
const TITLE_KEYS = ["title", "headline", "job_title", "jobTitle", "name", "position"];
const DATE_KEYS = ["date", "published", "publishedAt", "published_at", "pubDate", "datePublished", "posted_at", "postedAt", "date_posted", "created"];
const SOURCE_KEYS = ["source", "publisher", "site", "domain"];
const COMPANY_KEYS = ["company", "company_name", "companyName", "employer", "employer_name", "organization"];

function pick(o: Obj, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    const s = str(v) ?? (isObj(v) ? str(v.name) ?? str(v.title) : undefined);
    if (s) return s;
  }
  return undefined;
}

function toItem(o: Obj): Item | null {
  const url = pick(o, URL_KEYS);
  const title = pick(o, TITLE_KEYS);
  if (!url || !title || !/^https?:\/\//i.test(url)) return null;
  return { url, title, date: pick(o, DATE_KEYS), source: pick(o, SOURCE_KEYS), company: pick(o, COMPANY_KEYS) };
}

/**
 * Finds the list of results in a provider's answer. Providers differ (news[], articles[], organic[],
 * data.jobs[] ...), so this walks the answer breadth first and returns the first array whose
 * entries carry a link and a title.
 */
export function extractItems(result: unknown, maxDepth = 5): Item[] {
  const queue: { v: unknown; d: number }[] = [{ v: result, d: 0 }];
  while (queue.length) {
    const { v, d } = queue.shift()!;
    if (Array.isArray(v)) {
      const items = v.filter(isObj).map(toItem).filter((x): x is Item => x !== null);
      if (items.length) return dedupe(items);
      if (d < maxDepth) for (const e of v) if (isObj(e)) queue.push({ v: e, d: d + 1 });
    } else if (isObj(v) && d < maxDepth) {
      for (const child of Object.values(v)) if (typeof child === "object" && child !== null) queue.push({ v: child, d: d + 1 });
    }
  }
  return [];
}

function dedupe(items: Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}

/** Reads page text from a scrape run: normalized.markdown first, then the usual result fields. */
export function extractMarkdown(run: { normalized?: Obj | null; result?: unknown }): string | null {
  const candidates: unknown[] = [run.normalized?.markdown, run.normalized?.text];
  const r = run.result;
  if (typeof r === "string") candidates.push(r);
  if (isObj(r)) {
    candidates.push(r.markdown, r.text, r.content);
    if (isObj(r.data)) candidates.push(r.data.markdown, r.data.text, r.data.content);
  }
  for (const c of candidates) if (typeof c === "string" && c.trim()) return c;
  return null;
}

/** Removes parts of a page that change on every load (dates, times, cache-busting query strings). */
export function normalizePage(markdown: string): string {
  return markdown
    .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, "")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?(?:[ \t]?(?:am|pm)\b)?/gi, "")
    .replace(/\?(v|ver|cb|_)=[\w.-]+/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Lines present in the new page text and not in the old one, at most `max`. */
export function changedLines(before: string, after: string, max = 3): string[] {
  const old = new Set(before.split("\n"));
  return after
    .split("\n")
    .filter((l) => l.length > 2 && !old.has(l))
    .slice(0, max);
}

const TAGS: [string, RegExp][] = [
  ["funding", /\b(raises?|raised|funding|series [a-f]\b|seed round|investment led by)/i],
  ["leadership", /\b(appoints?|names? .{0,40}\b(ceo|cto|cfo|coo|cmo|cro|chief|president|vp)\b|joins as|steps down|new (ceo|cto|cfo))/i],
  ["launch", /\b(launch(es|ed)?|introduc(es|ed)|unveil(s|ed)|releases?|rolls out)\b/i],
  ["partnership", /\b(partner(s|ship)?|teams up|integration with)\b/i],
];

/** Tags a news headline: funding, leadership, launch, partnership or other. */
export function tagHeadline(title: string): string {
  for (const [tag, re] of TAGS) if (re.test(title)) return tag;
  return "other";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(inc|ltd|llc|gmbh|sas|corp|co)\b/g, "").trim();

/** True when a job posting is from the account (by employer name) and matches one of the role words. */
export function isMatchingJob(item: Item, companyName: string, roleKeywords: string[]): boolean {
  if (item.company && !norm(item.company).includes(norm(companyName)) && !norm(companyName).includes(norm(item.company))) {
    return false;
  }
  if (!roleKeywords.length) return true;
  const t = item.title.toLowerCase();
  return roleKeywords.some((k) => k.trim() && t.includes(k.trim().toLowerCase()));
}

/** True when a headline names the company. Search providers return loose matches, so the app filters on its side. */
export function mentionsCompany(title: string, companyName: string): boolean {
  const n = norm(companyName);
  const first = n.split(" ").slice(0, 2).join(" ");
  return norm(title).includes(first);
}

/** Breadth-first search for the first non-empty value stored under one of `keys` (case and underscore insensitive). */
export function deepFind(root: unknown, keys: string[], maxDepth = 5): unknown {
  const want = new Set(keys.map((k) => k.toLowerCase().replace(/_/g, "")));
  const queue: { v: unknown; d: number }[] = [{ v: root, d: 0 }];
  while (queue.length) {
    const { v, d } = queue.shift()!;
    if (Array.isArray(v)) {
      if (d < maxDepth) for (const e of v.slice(0, 50)) queue.push({ v: e, d: d + 1 });
    } else if (isObj(v)) {
      for (const [k, val] of Object.entries(v)) {
        if (want.has(k.toLowerCase().replace(/_/g, "")) && val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && !val.length)) return val;
      }
      if (d < maxDepth) for (const val of Object.values(v)) if (typeof val === "object" && val !== null) queue.push({ v: val, d: d + 1 });
    }
  }
  return undefined;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads a work email from an email finder answer. Returns null when no provider field holds one. */
export function extractEmail(result: unknown): string | null {
  const v = deepFind(result, ["email", "work_email", "professional_email", "email_address", "emails"]);
  const first = Array.isArray(v) ? v[0] : v;
  const s = str(first) ?? (isObj(first) ? str(first.email) ?? str(first.value) ?? str(first.address) : undefined);
  return s && EMAIL_RE.test(s) ? s.toLowerCase() : null;
}

/** Maps a verifier answer onto verified, risky or invalid. Returns null when the answer has no status. */
export function extractEmailStatus(result: unknown): "verified" | "risky" | "invalid" | null {
  const v = deepFind(result, ["status", "result", "state", "verdict", "deliverability", "email_status", "is_valid", "valid", "deliverable"]);
  if (typeof v === "boolean") return v ? "verified" : "invalid";
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (/^(valid|deliverable|verified|ok|safe|good)$/.test(s)) return "verified";
  if (/(invalid|undeliverable|bounce|bad|disposable|not[_ ]?found|does[_ ]not[_ ]exist)/.test(s)) return "invalid";
  if (/(risky|catch|accept[_ -]?all|unknown|unverifiable|role|greylist)/.test(s)) return "risky";
  return null;
}

/** Reads a phone number from a phone finder answer. */
export function extractPhone(result: unknown): string | null {
  const v = deepFind(result, ["phone", "mobile", "mobile_phone", "phone_number", "mobile_number", "direct_dial", "phones", "phone_numbers"]);
  const first = Array.isArray(v) ? v[0] : v;
  const s = str(first) ?? (isObj(first) ? str(first.number) ?? str(first.phone) ?? str(first.value) ?? str(first.sanitized_number) : undefined);
  return s && s.replace(/\D/g, "").length >= 7 ? s : null;
}

export interface CompanyFields {
  industry?: string;
  employees?: number;
  hq?: string;
  description?: string;
  linkedin_url?: string;
}

/** Reads the company fields the CRM keeps from an enrichment answer. Missing fields are left out. */
export function extractCompany(result: unknown): CompanyFields {
  const out: CompanyFields = {};
  const industry = deepFind(result, ["industry", "industries", "sector"]);
  out.industry = str(Array.isArray(industry) ? industry[0] : industry);
  const emp = deepFind(result, ["employees", "employee_count", "employees_count", "headcount", "num_employees", "staff_count", "size"]);
  const n = typeof emp === "number" ? emp : typeof emp === "string" ? Number(emp.replace(/[^\d]/g, " ").trim().split(/\s+/)[0]) : NaN;
  if (Number.isFinite(n) && n > 0) out.employees = Math.round(n);
  const loc = deepFind(result, ["headquarters", "hq", "location", "city"]);
  out.hq = str(loc) ?? (isObj(loc) ? [str(loc.city), str(loc.state) ?? str(loc.region), str(loc.country)].filter(Boolean).slice(0, 2).join(", ") || undefined : undefined);
  out.description = str(deepFind(result, ["description", "short_description", "summary", "about"]))?.slice(0, 400);
  const li = str(deepFind(result, ["linkedin_url", "linkedin", "linkedin_profile_url"]));
  if (li && /linkedin\./i.test(li)) out.linkedin_url = li.startsWith("http") ? li : `https://${li}`;
  for (const k of Object.keys(out) as (keyof CompanyFields)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/**
 * Reads named technologies from a technographics answer. Returns null when the provider sent
 * category counts only (the free BuiltWith endpoint does), because a list is needed to compare.
 */
export function extractTech(result: unknown): string[] | null {
  const v = deepFind(result, ["technologies", "technology_names", "tech", "tech_stack", "techstack", "tools", "technologies_found"]);
  if (!Array.isArray(v)) return null;
  const names = v
    .map((e) => str(e) ?? (isObj(e) ? str(e.name) ?? str(e.technology) ?? str(e.title) ?? (isObj(e.technology) ? str(e.technology.name) : undefined) : undefined))
    .filter((x): x is string => !!x);
  return names.length ? [...new Set(names)].sort((a, b) => a.localeCompare(b)) : null;
}

export interface FundingRound {
  date: string | null;
  type: string;
  amount: string | null;
  investors: string | null;
}

/** Reads funding rounds from a funding answer. A round needs at least a type or an amount. */
export function extractFunding(result: unknown): FundingRound[] {
  const v = deepFind(result, ["funding_rounds", "rounds", "fundings", "funding_events", "financing_events", "funding"]);
  const list = Array.isArray(v) ? v : isObj(v) ? [v] : [];
  const out: FundingRound[] = [];
  for (const e of list) {
    if (!isObj(e)) continue;
    const type = str(e.type) ?? str(e.round) ?? str(e.funding_type) ?? str(e.series) ?? str(e.financing_type) ?? str(e.name);
    const rawAmount = e.amount ?? e.money_raised ?? e.raised_amount ?? e.amount_usd ?? e.raised ?? e.amount_normalized;
    const amount = typeof rawAmount === "number" ? formatAmount(rawAmount) : str(rawAmount) ?? null;
    if (!type && !amount) continue;
    const inv = e.investors ?? e.lead_investors ?? e.investor_names;
    const investors = Array.isArray(inv) ? inv.map((i) => str(i) ?? (isObj(i) ? str(i.name) : undefined)).filter(Boolean).join(", ") || null : str(inv) ?? null;
    out.push({ date: str(e.date) ?? str(e.announced_on) ?? str(e.announced_date) ?? str(e.financing_date) ?? str(e.found_at) ?? null, type: type ?? "Funding round", amount, investors });
  }
  return out;
}

function formatAmount(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

export interface Person {
  name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  linkedin_url: string | null;
}

/** Reads people from a people search answer: the first array whose entries carry a name. */
export function extractPeople(result: unknown, maxDepth = 5): Person[] {
  const toPerson = (o: Obj): Person | null => {
    const first = str(o.first_name) ?? str(o.firstName);
    const last = str(o.last_name) ?? str(o.lastName);
    const name = str(o.name) ?? str(o.full_name) ?? str(o.fullName) ?? ([first, last].filter(Boolean).join(" ") || undefined);
    if (!name || name.split(" ").length < 2) return null;
    const title = str(o.title) ?? str(o.job_title) ?? str(o.jobTitle) ?? str(o.headline) ?? str(o.position) ?? null;
    const li = str(o.linkedin_url) ?? str(o.linkedin) ?? str(o.linkedinUrl) ?? str(o.profile_url) ?? null;
    const parts = name.split(" ");
    return { name, first_name: first ?? parts[0], last_name: last ?? parts.slice(1).join(" "), title, linkedin_url: li };
  };
  const queue: { v: unknown; d: number }[] = [{ v: result, d: 0 }];
  while (queue.length) {
    const { v, d } = queue.shift()!;
    if (Array.isArray(v)) {
      const people = v.filter(isObj).map(toPerson).filter((x): x is Person => x !== null);
      if (people.length) return people;
      if (d < maxDepth) for (const e of v) if (isObj(e)) queue.push({ v: e, d: d + 1 });
    } else if (isObj(v) && d < maxDepth) {
      for (const child of Object.values(v)) if (typeof child === "object" && child !== null) queue.push({ v: child, d: d + 1 });
    }
  }
  return [];
}

/** True when a title contains one of the keywords. An empty keyword list matches everything. */
export function titleMatches(title: string | null, keywords: string[]): boolean {
  const ks = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (!ks.length) return true;
  const t = (title ?? "").toLowerCase();
  return ks.some((k) => t.includes(k));
}

/** Lines in `before` that are gone from `after`, at most `max`. */
export function removedLines(before: string, after: string, max = 3): string[] {
  return changedLines(after, before, max);
}
