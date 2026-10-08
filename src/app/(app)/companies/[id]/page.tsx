import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { CompanyActions, CompanyTabs, DetailsFields, ScoreWhy, TechChips } from "@/components/company/client";
import { IntentTab } from "@/components/company/IntentTab";
import { EmptyState, Monogram, Page } from "@/components/common";
import { PeopleTable } from "@/components/people/PeopleTable";
import { Composer, Timeline } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dueLabel, fullName, money, num, shortDate } from "@/lib/format";
import { readLimits } from "@/lib/limits";
import { fetchPrices } from "@/lib/prices";
import { companyDetail } from "@/lib/queries";
import { requireSession } from "@/lib/store";
import { OPEN_STAGES, STAGE_LABEL } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { store } = await requireSession();
  const c = await store.get("companies", id);
  return { title: c?.name ?? "Company" };
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requireSession();
  const prices = await fetchPrices();
  const now = new Date();
  const detail = await companyDetail(store, id, prices.prices, now);
  if (!detail) {
    return (
      <Page>
        <EmptyState title="This company does not exist" actions={<Button asChild><Link href="/companies">Go to Companies</Link></Button>}>
          This company does not exist or belongs to another account.
        </EmptyState>
      </Page>
    );
  }
  const { company, contacts, deals } = detail;
  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const people = contacts.map((c) => ({ ...c, name: fullName(c), companyName: company.name, companyDomain: company.domain, lastActivity: detail.lastActivityOf[c.id] ?? null }));
  const signalCount = detail.sections.reduce((s, x) => s + x.signals.length, 0);

  const rail = (
    <div className="grid gap-6">
      <section aria-labelledby="details-h">
        <h2 id="details-h" className="text-13 font-semibold">Details</h2>
        <div className="mt-1"><DetailsFields company={company} /></div>
      </section>
      <section aria-labelledby="open-h">
        <h2 id="open-h" className="text-13 font-semibold">Open deals</h2>
        {open.length ? (
          <ul className="mt-1 border-t border-border">
            {open.map((d) => (
              <li key={d.id} className="border-b border-border py-2">
                <Link href={`/pipeline?deal=${d.id}`} className="block rounded-sm text-13 font-medium hover:underline">{d.name}</Link>
                <p className="tnum mt-0.5 flex gap-2 text-xs text-muted-foreground"><span>{STAGE_LABEL[d.stage]}</span><span className="font-mono">{money(d.amount_cents)}</span></p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-13 text-muted-foreground">No open deal.</p>}
      </section>
      <section aria-labelledby="tech-h">
        <h2 id="tech-h" className="mb-2 text-13 font-semibold">Tech stack</h2>
        <TechChips tech={company.tech} />
      </section>
    </div>
  );

  return (
    <Page>
      <Link href="/companies" className="mb-3 inline-flex items-center gap-1.5 rounded-sm text-13 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Companies
      </Link>
      <header className="flex flex-wrap items-start gap-x-6 gap-y-4 border-b border-border pb-5">
        <div className="flex min-w-0 flex-1 basis-80 items-start gap-3">
          <Monogram name={company.name} seed={company.domain} size={40} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-[-0.01em]">{company.name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-13 text-muted-foreground">
              <a href={`https://${company.domain}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">{company.domain}<ExternalLink className="size-3" aria-hidden /></a>
              {company.industry && <span>{company.industry}</span>}
              {company.employees ? <span className="tnum">{num(company.employees)} employees</span> : null}
              {company.hq && <span>{company.hq}</span>}
            </p>
          </div>
        </div>
        <ScoreWhy score={detail.score} weights={detail.weights} />
        <CompanyActions company={{ id: company.id, name: company.name }} />
      </header>

      <div className="mt-5 grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="max-lg:hidden">{rail}</aside>
        <div className="min-w-0">
          <CompanyTabs
            counts={{ people: contacts.length, deals: deals.length, signals: signalCount }}
            tabs={{
              details: rail,
              timeline: (
                <div className="grid max-w-3xl gap-5">
                  <Composer companyId={company.id} />
                  <Timeline entries={detail.timeline} intentHref={`/companies/${company.id}?tab=intent`} />
                </div>
              ),
              intent: <IntentTab detail={detail} now={now} />,
              people: <PeopleTable rows={people} prices={prices.prices} roleKeywords={detail.roleKeywords} companies={[{ id: company.id, name: company.name }]} bulkMax={readLimits().bulkMaxRecords} scoped={{ id: company.id, name: company.name }} />,
              deals: deals.length ? (
                <ul className="border-t border-border">
                  {deals.map((d) => {
                    const due = d.next_step_due ? dueLabel(d.next_step_due, now) : null;
                    const closed = d.stage === "won" || d.stage === "lost";
                    return (
                      <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border py-2.5">
                        <Link href={`/pipeline?deal=${d.id}`} className="min-w-0 flex-1 basis-64 truncate text-13 font-medium hover:underline">{d.name}</Link>
                        <Badge tone={d.stage === "won" ? "positive" : d.stage === "lost" ? "muted" : "neutral"}>{STAGE_LABEL[d.stage]}</Badge>
                        <span className="tnum w-20 text-right font-mono text-xs">{money(d.amount_cents)}</span>
                        <span className="w-full text-xs text-muted-foreground sm:w-72">
                          {closed ? (d.closed_reason ? `Reason: ${d.closed_reason}` : `Closed ${shortDate(d.close_date)}`) : d.next_step ? (<>{d.next_step}{due && <span className={due.overdue ? "font-medium text-warning" : ""}> · {due.overdue ? due.text : `due ${due.text}`}</span>}</>) : <span className="font-medium text-warning">No next step</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : <EmptyState title="No deal yet" className="py-6">Create one with New deal, or press <kbd className="font-mono">n</kbd>.</EmptyState>,
            }}
          />
        </div>
      </div>
    </Page>
  );
}
