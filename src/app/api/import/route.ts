import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { bad, sessionOr401 } from "@/lib/api";
import { buildImport, IMPORT_FIELDS, parseCsv, type Mapping } from "@/lib/csv";
import { ImportSchema } from "@/lib/schemas";

/** Imports companies and their contacts from CSV text. Free. Domains already in the CRM are skipped. */
export async function POST(request: Request) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const parsed = ImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("The request is not valid.");
  const mapping: Mapping = {};
  for (const f of IMPORT_FIELDS) if (parsed.data.mapping[f] !== undefined) mapping[f] = parsed.data.mapping[f];
  if (mapping.domain === undefined) return bad("Pick the column that holds the company domain.");
  const { store } = session;
  const rows = parseCsv(parsed.data.csv).slice(parsed.data.hasHeader ? 1 : 0);
  const existing = (await store.all("companies")).map((c) => c.domain);
  const plan = buildImport(rows, mapping, existing);
  const made = await store.insertIgnore("companies", plan.companies.map((c) => ({ name: c.name, domain: c.domain })), ["domain"]);
  const idOf = new Map(made.map((c) => [c.domain, c.id]));
  const contacts = plan.companies.flatMap((c) => (idOf.has(c.domain) ? c.contacts.map((p) => ({ ...p, company_id: idOf.get(c.domain)!, source: "csv" as const })) : []));
  const seen = new Set((await store.all("contacts")).map((c) => c.linkedin_url).filter(Boolean));
  const fresh = contacts.filter((c) => !c.linkedin_url || (!seen.has(c.linkedin_url) && seen.add(c.linkedin_url)));
  if (fresh.length) await store.insert("contacts", fresh);
  revalidatePath("/", "layout");
  return NextResponse.json({ companies: made.length, contacts: fresh.length, duplicates: plan.duplicates, invalid: plan.invalid });
}
