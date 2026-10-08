import type { Metadata } from "next";
import { CompaniesTable, type CompaniesQuery } from "@/components/companies/CompaniesTable";
import { ErrorPanel, Page } from "@/components/common";
import { LinkButton } from "@/components/today-client";
import { readLimits } from "@/lib/limits";
import { companyRows, type CompanyRow } from "@/lib/queries";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Companies" };
const PAGE_SIZE = 50;

const SORTS: Record<string, (r: CompanyRow) => string | number> = {
  name: (r) => r.name.toLowerCase(),
  score: (r) => r.score,
  industry: (r) => (r.industry ?? "").toLowerCase(),
  employees: (r) => r.employees ?? 0,
  openValueCents: (r) => r.openValueCents,
  contacts: (r) => r.contacts,
  lastActivity: (r) => r.lastActivity ?? "",
  intentCheckedAt: (r) => r.intentCheckedAt ?? "",
};

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { store } = await requireSession();
  if (store.demo && sp.state === "error") {
    return (
      <Page>
        <ErrorPanel message="The companies could not be read. Check the database connection, then try again." requestId="req_demo_2c81d4" action={<LinkButton href="/companies">Try again</LinkButton>} />
      </Page>
    );
  }
  const all = store.demo && sp.state === "empty" ? [] : await companyRows(store);
  const query: CompaniesQuery = {
    q: (sp.q ?? "").trim(),
    filters: (sp.f ?? "").split(",").filter(Boolean),
    stage: sp.stage ?? "",
    sort: sp.sort && SORTS[sp.sort] ? sp.sort : "score",
    dir: sp.dir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(sp.page) || 1),
  };
  const needle = query.q.toLowerCase();
  let rows = all.filter((r) => {
    if (needle && !`${r.name} ${r.domain}`.toLowerCase().includes(needle)) return false;
    if (query.filters.includes("score60") && r.score < 60) return false;
    if (query.filters.includes("open") && !r.openValueCents && !r.bestStage) return false;
    if (query.filters.includes("noemail") && r.hasEmail) return false;
    if (query.stage && r.bestStage !== query.stage) return false;
    return true;
  });
  const key = SORTS[query.sort];
  rows = rows.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const c = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
    return query.dir === "asc" ? c : -c;
  });
  const total = rows.length;
  const pageRows = rows.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE);
  return (
    <Page>
      <h1 className="sr-only">Companies</h1>
      <CompaniesTable rows={pageRows} total={total} pageSize={PAGE_SIZE} query={query} bulkMax={readLimits().bulkMaxRecords} domains={all.map((r) => r.domain)} anyCompanies={all.length > 0} />
    </Page>
  );
}
