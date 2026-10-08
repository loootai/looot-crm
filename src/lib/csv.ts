import { cleanDomain } from "./format";

/** Parses CSV text (quotes, escaped quotes, CRLF) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export const IMPORT_FIELDS = ["name", "domain", "first_name", "last_name", "title", "email", "linkedin_url"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, number>>;
export const IMPORT_LIMIT = 2000;

const GUESS: Record<ImportField, RegExp> = {
  name: /^(company|company ?name|account|organi[sz]ation|name)$/i,
  domain: /^(domain|website|url|company ?(domain|website|url))$/i,
  first_name: /^(first ?name|given ?name|first)$/i,
  last_name: /^(last ?name|surname|family ?name|last)$/i,
  title: /^(title|job ?title|role|position)$/i,
  email: /^(e-?mail|work ?e-?mail|email ?address)$/i,
  linkedin_url: /^(linkedin|linkedin ?url|person ?linkedin ?url|linkedin ?profile)$/i,
};

/** Guesses which CSV column feeds each field from the header names. */
export function guessMapping(header: string[]): Mapping {
  const m: Mapping = {};
  for (const f of IMPORT_FIELDS) {
    const i = header.findIndex((h) => GUESS[f].test(h.trim().replace(/[_-]/g, " ")));
    if (i >= 0) m[f] = i;
  }
  return m;
}

export interface ImportCompany {
  name: string;
  domain: string;
  contacts: { first_name: string | null; last_name: string | null; title: string | null; email: string | null; linkedin_url: string | null }[];
}
export interface ImportPlan {
  companies: ImportCompany[];
  /** Rows dropped because the domain was missing or not a host. */
  invalid: number;
  /** Companies dropped because the domain is already in the CRM. */
  duplicates: number;
  contacts: number;
  rows: number;
}

/**
 * Turns mapped rows into companies with their contacts. Rows are grouped by domain, a domain already
 * in `existingDomains` is skipped, and anything past IMPORT_LIMIT rows is ignored.
 */
export function buildImport(rows: string[][], mapping: Mapping, existingDomains: Iterable<string> = []): ImportPlan {
  const existing = new Set([...existingDomains].map((d) => d.toLowerCase()));
  const byDomain = new Map<string, ImportCompany>();
  const skipped = new Set<string>();
  const at = (r: string[], f: ImportField) => (mapping[f] === undefined ? "" : (r[mapping[f]!] ?? "").trim());
  let invalid = 0;
  const body = rows.slice(0, IMPORT_LIMIT);
  for (const r of body) {
    const domain = cleanDomain(at(r, "domain"));
    if (!domain) {
      invalid++;
      continue;
    }
    if (existing.has(domain)) {
      skipped.add(domain);
      continue;
    }
    let c = byDomain.get(domain);
    if (!c) {
      c = { name: at(r, "name") || domain, domain, contacts: [] };
      byDomain.set(domain, c);
    }
    const first = at(r, "first_name") || null;
    const last = at(r, "last_name") || null;
    const email = at(r, "email").toLowerCase() || null;
    if (first || last || email) {
      const dupe = c.contacts.some((p) => (email && p.email === email) || (p.first_name === first && p.last_name === last));
      if (!dupe) c.contacts.push({ first_name: first, last_name: last, title: at(r, "title") || null, email, linkedin_url: at(r, "linkedin_url") || null });
    }
  }
  const companies = [...byDomain.values()];
  return { companies, invalid, duplicates: skipped.size, contacts: companies.reduce((s, c) => s + c.contacts.length, 0), rows: body.length };
}

/** Serializes rows of plain values as CSV. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
