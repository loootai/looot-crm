import type { Metadata } from "next";
import Link from "next/link";
import { ChipLink, EmptyState, ErrorPanel, Monogram, Page, ScoreChip, SectionTitle, SignalIcon } from "@/components/common";
import { RampDot, StackedBar } from "@/components/charts";
import { DueCheck, LinkButton, MarkGroupRead, RefreshIntentButton, SignalActions } from "@/components/today-client";
import { dueLabel, money, relative } from "@/lib/format";
import { todayData } from "@/lib/queries";
import { requireSession } from "@/lib/store";
import { KIND_LABEL, SIGNAL_KINDS, STAGE_LABEL, type SignalKind } from "@/lib/types";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ kind?: string; score?: string; state?: string }> }) {
  const sp = await searchParams;
  const { store, user } = await requireSession();
  if (store.demo && sp.state === "error") {
    return (
      <Page>
        <ErrorPanel message="The signals could not be read. Check the database connection, then try again." requestId="req_demo_7f3a91" action={<LinkButton href="/">Try again</LinkButton>} />
      </Page>
    );
  }
  const kinds = (sp.kind ?? "").split(",").filter((k): k is SignalKind => (SIGNAL_KINDS as readonly string[]).includes(k));
  const minScore = sp.score === "60" ? 60 : undefined;
  const now = new Date();
  const data = await todayData(store, { kinds, minScore }, now);
  const empty = (store.demo && sp.state === "empty") || data.companies === 0;

  if (empty) {
    return (
      <Page>
        <EmptyState
          title="Start with your accounts"
          actions={
            <>
              <LinkButton href="/companies?import=1" variant="primary">Import a CSV</LinkButton>
              <LinkButton href="/companies?new=1">Add a company</LinkButton>
            </>
          }
        >
          <p>Add the companies you sell to. Each one gets an Intent tab with five public signals: hiring, funding, tech stack, news and site changes.</p>
          <p className="mt-2">About $0.03 per account for all five signals. Import is free. You see the price before every run and a failed run costs nothing.</p>
        </EmptyState>
      </Page>
    );
  }

  const href = (next: { kind?: SignalKind; score?: boolean }) => {
    const k = next.kind ? (kinds.includes(next.kind) ? kinds.filter((x) => x !== next.kind) : [...kinds, next.kind]) : kinds;
    const s = next.score ? !minScore : !!minScore;
    const q = new URLSearchParams();
    if (k.length) q.set("kind", k.join(","));
    if (s) q.set("score", "60");
    return q.size ? `/?${q}` : "/";
  };
  const first = user.name.split(" ")[0];
  const overdue = data.due.filter((d) => dueLabel(d.dueAt, now).overdue).length;
  const unread = data.groups.reduce((s, g) => s + g.signals.length + g.more, 0);

  return (
    <Page>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Good morning, {first}</h1>
        <p className="mt-0.5 text-13 text-muted-foreground">
          {unread} new {unread === 1 ? "signal" : "signals"} on {data.groups.length} {data.groups.length === 1 ? "account" : "accounts"}, {data.due.length} due{overdue ? `, ${overdue} overdue` : ""}.
        </p>
      </div>
      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-12">
        <section aria-labelledby="signals-h" className="order-2 min-w-0 lg:order-1 lg:col-span-7">
          <SectionTitle>
            <span id="signals-h">New signals</span>
          </SectionTitle>
          <div className="scroll-thin -mx-4 mt-2 flex gap-1.5 relative overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter signals">
            {SIGNAL_KINDS.map((k) => (
              <ChipLink key={k} href={href({ kind: k })} active={kinds.includes(k)}>
                <SignalIcon kind={k} className="size-3.5 text-current" />
                {KIND_LABEL[k]}
              </ChipLink>
            ))}
            <ChipLink href={href({ score: true })} active={!!minScore}>
              Score 60+
            </ChipLink>
          </div>
          {data.groups.length === 0 ? (
            kinds.length || minScore ? (
              <EmptyState title="No signal matches these filters" actions={<LinkButton href="/">Clear filters</LinkButton>} />
            ) : (
              <EmptyState title="No signals yet" actions={<RefreshIntentButton ids={data.refreshTargets} label={`Refresh intent on ${data.refreshTargets.length} accounts`} />}>
                Refresh intent on your top accounts. The quote shows the cost before anything runs.
              </EmptyState>
            )
          ) : (
            <div className="mt-3 border-t border-border">
              {data.groups.map((g) => (
                <article key={g.companyId} className="border-b border-border py-3">
                  <header className="flex items-center gap-2">
                    <Monogram name={g.name} seed={g.domain} />
                    <Link href={`/companies/${g.companyId}?tab=intent`} className="truncate text-sm font-semibold hover:underline">
                      {g.name}
                    </Link>
                    <ScoreChip score={g.score} />
                    {g.delta !== null && g.delta !== 0 && (
                      <span className={`tnum whitespace-nowrap text-xs ${g.delta > 0 ? "text-positive" : "text-muted-foreground"}`}>
                        {g.delta > 0 ? "up" : "down"} {Math.abs(g.delta)}
                        <span className="max-sm:hidden"> this week</span>
                      </span>
                    )}
                    <span className="ml-auto max-sm:hidden">
                      <MarkGroupRead ids={g.signals.map((s) => s.id)} />
                    </span>
                  </header>
                  <ul className="mt-1.5">
                    {g.signals.map((s) => (
                      <li key={s.id} className="group flex min-h-8 items-center gap-2.5 rounded-sm pl-8 hover:bg-muted/60 max-sm:pl-0">
                        <SignalIcon kind={s.kind} />
                        <span className="min-w-0 flex-1 truncate text-13">
                          <span className="sr-only">{KIND_LABEL[s.kind]}: </span>
                          {s.title}
                        </span>
                        <span className="tnum shrink-0 whitespace-nowrap text-xs text-muted-foreground">{relative(s.occurred_at, now)}</span>
                        <SignalActions signalId={s.id} companyId={g.companyId} title={s.title} url={s.url} />
                      </li>
                    ))}
                  </ul>
                  {g.more > 0 && (
                    <Link href={`/companies/${g.companyId}?tab=intent`} className="ml-8 mt-1 inline-block text-xs font-medium text-primary hover:underline max-sm:ml-0">
                      {g.more} more on the Intent tab
                    </Link>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="order-1 grid min-w-0 content-start gap-8 lg:order-2 lg:col-span-5">
          <section aria-labelledby="due-h">
            <SectionTitle aside={<span className="tnum text-xs text-muted-foreground">{data.due.length} open</span>}>
              <span id="due-h">Due today</span>
            </SectionTitle>
            {data.due.length === 0 ? (
              <p className="mt-2 border-t border-border py-4 text-13 text-muted-foreground">Nothing due. Tasks and deal next steps show here on their day.</p>
            ) : (
              <ul className="mt-2 border-t border-border">
                {data.due.map((d) => {
                  const due = dueLabel(d.dueAt, now);
                  return (
                    <li key={`${d.type}-${d.id}`} className="flex gap-3 border-b border-border py-2.5">
                      <DueCheck id={d.id} type={d.type} title={d.title} />
                      <div className="min-w-0 flex-1">
                        <p className="text-13 leading-snug">{d.title}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          <span className={due.overdue ? "font-medium text-warning" : ""}>{due.overdue ? due.text : `Due ${due.text}`}</span>
                          {d.dealId && d.dealName ? (
                            <Link href={`/pipeline?deal=${d.dealId}`} className="truncate hover:underline">
                              {d.dealName}
                            </Link>
                          ) : (
                            d.companyName && <span>{d.companyName}</span>
                          )}
                          <span>{d.type === "task" ? "Task" : "Next step"}</span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="pipe-h">
            <SectionTitle aside={<Link href="/pipeline" className="text-xs font-medium text-primary hover:underline">Open the board</Link>}>
              <span id="pipe-h">Pipeline</span>
            </SectionTitle>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">Open pipeline</dt>
                <dd className="tnum mt-1 text-[32px] font-semibold leading-none tracking-[-0.02em]">{money(data.openValueCents)}</dd>
                <dd className="mt-1.5 text-xs text-muted-foreground">in {data.openDeals} deals</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Closing in 30 days</dt>
                <dd className="tnum mt-1 text-[32px] font-semibold leading-none tracking-[-0.02em]">{money(data.closing30.valueCents)}</dd>
                <dd className="mt-1.5 text-xs text-muted-foreground">in {data.closing30.deals} deals</dd>
              </div>
            </dl>
            <StackedBar className="mt-4" label="Open pipeline by stage" segments={data.stages.map((s) => ({ label: STAGE_LABEL[s.stage], value: s.valueCents }))} />
            <table className="mt-2 w-full text-13">
              <thead className="sr-only">
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">Deals</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.stages.map((s, i) => (
                  <tr key={s.stage}>
                    <th scope="row" className="h-8 border-b border-border text-left font-normal">
                      <span className="flex items-center gap-2">
                        <RampDot i={i} />
                        {STAGE_LABEL[s.stage]}
                      </span>
                    </th>
                    <td className="tnum h-8 border-b border-border text-right text-muted-foreground">
                      {s.deals} {s.deals === 1 ? "deal" : "deals"}
                    </td>
                    <td className="tnum h-8 w-28 border-b border-border text-right font-mono text-xs">{money(s.valueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </Page>
  );
}
