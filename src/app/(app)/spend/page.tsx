import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { RampDot, SpendChart } from "@/components/charts";
import { EmptyState, ErrorPanel, Page, SectionTitle } from "@/components/common";
import { ActionRow } from "@/components/spend-client";
import { LinkButton } from "@/components/today-client";
import { Table, Th } from "@/components/ui/table";
import { clock, usd4, usdCap } from "@/lib/format";
import { FALLBACK_DATE } from "@/lib/jobs";
import { fetchPrices } from "@/lib/prices";
import { priceTable, SPEND_GROUPS, spendData } from "@/lib/queries";
import { requireSession } from "@/lib/store";
import { MemoryStore } from "@/lib/store/demoStore";

export const metadata: Metadata = { title: "Spend" };

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="tnum mt-1 truncate font-mono text-2xl font-semibold leading-none tracking-[-0.02em] sm:text-[28px]">{value}</dd>
      {note && <dd className="mt-1.5 truncate text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

export default async function SpendPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const sp = await searchParams;
  const { store } = await requireSession();
  if (store.demo && sp.state === "error") {
    return (
      <Page>
        <ErrorPanel message="The spend log could not be read. Check the database connection, then try again." requestId="req_demo_c44e19" action={<LinkButton href="/spend">Try again</LinkButton>} />
      </Page>
    );
  }
  const [data, prices] = await Promise.all([spendData(store.demo && sp.state === "empty" ? new MemoryStore() : store), fetchPrices()]);
  const table = priceTable(prices.prices);
  const stopped = data.actions.filter((a) => a.status === "stopped_at_max").length;
  return (
    <Page>
      <h1 className="sr-only">Spend</h1>
      {data.overMax > 0 && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-md border border-danger bg-danger-bg px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p className="text-13"><span className="font-semibold text-danger">{data.overMax} {data.overMax === 1 ? "action" : "actions"} cost more than the max you confirmed.</span> This must never happen. The rows are marked below. Report it with the run ids.</p>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-border pb-5 md:grid-cols-4">
        <Stat label="Spent, last 30 days" value={usd4(data.spent30)} note={`${data.actions.filter((a) => a.actual_usd > 0).length} paid actions`} />
        <Stat label="Runs, last 30 days" value={String(data.runs30)} note={stopped ? `${stopped} action stopped at its max` : "none stopped at a max"} />
        <Stat label="Per enriched contact" value={data.perContact === null ? "n/a" : usd4(data.perContact)} note="average, email and phone" />
        <Stat label="Per account refresh" value={data.perRefresh === null ? "n/a" : usd4(data.perRefresh)} note="average, all five signals" />
      </dl>

      {data.actions.length === 0 ? (
        <EmptyState title="No paid action yet">Enrich a contact or refresh intent on an account and it will show here with its cost.</EmptyState>
      ) : (
        <>
          <section aria-labelledby="chart-h" className="mt-6">
            <SectionTitle aside={
              <ul className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {SPEND_GROUPS.map((g, i) => <li key={g} className="flex items-center gap-1.5"><RampDot i={i} />{g}</li>)}
              </ul>
            }>
              <span id="chart-h" className="whitespace-nowrap">Spend per day</span>
            </SectionTitle>
            <div className="mt-3"><SpendChart days={data.days} groups={SPEND_GROUPS} /></div>
          </section>

          <section aria-labelledby="actions-h" className="mt-6">
            <SectionTitle aside={<span className="text-xs text-muted-foreground">Actual never passes the max you confirmed</span>}>
              <span id="actions-h">Actions</span>
            </SectionTitle>
            <div className="scroll-thin mt-2 relative overflow-x-auto rounded-md border border-border bg-surface">
              <Table className="min-w-[860px]">
                <thead>
                  <tr>
                    <Th className="w-9 pr-0"><span className="sr-only">Expand</span></Th>
                    <Th>Time (UTC)</Th>
                    <Th>Action</Th>
                    <Th>Target</Th>
                    <Th className="text-right">Steps</Th>
                    <Th className="text-right">Estimated</Th>
                    <Th className="text-right">Max confirmed</Th>
                    <Th className="text-right">Actual</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>{data.actions.map((a) => <ActionRow key={a.id} action={a} />)}</tbody>
              </Table>
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="prices-h" className="mt-8">
        <SectionTitle>
          <span id="prices-h">Prices used by this app</span>
        </SectionTitle>
        <p className="mt-0.5 text-13 text-muted-foreground">
          {prices.source === "catalog" ? `Read from the looot catalog at ${clock(prices.readAt)} UTC.` : `Catalog unreachable, using prices saved on ${FALLBACK_DATE}.`} The estimate is the higher of the per-call price and the per-result price times the expected results. The cap is the most looot may charge for one run.
        </p>
        <div className="scroll-thin mt-2 relative overflow-x-auto rounded-md border border-border bg-surface">
          <Table className="min-w-[640px]">
            <thead><tr><Th>Feature</Th><Th>looot job</Th><Th className="text-right">Estimate per run</Th><Th className="text-right">Cap per run</Th></tr></thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.id}>
                  <td className="h-9 border-b border-border px-3">{r.feature}</td>
                  <td className="h-9 border-b border-border px-3 font-mono text-xs">{r.id}</td>
                  <td className="tnum h-9 border-b border-border px-3 text-right font-mono text-xs">{usd4(r.quote)}{r.results > 1 && <span className="text-muted-foreground"> / {r.results} results</span>}</td>
                  <td className="tnum h-9 border-b border-border px-3 text-right font-mono text-xs text-muted-foreground">{usdCap(r.cap)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
    </Page>
  );
}
