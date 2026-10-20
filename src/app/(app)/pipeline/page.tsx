import type { Metadata } from "next";
import { ErrorPanel, Page } from "@/components/common";
import { Board } from "@/components/pipeline/Board";
import { LinkButton } from "@/components/today-client";
import { fullName } from "@/lib/format";
import { loadPipelines } from "@/lib/pipelines";
import { dealCards } from "@/lib/queries";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ state?: string; p?: string; deal?: string }> }) {
  const sp = await searchParams;
  const { store } = await requireSession();
  if (store.demo && sp.state === "error") {
    return (
      <Page>
        <ErrorPanel message="The deals could not be read. Check the database connection, then try again." requestId="req_demo_5d02ac" action={<LinkButton href="/pipeline">Try again</LinkButton>} />
      </Page>
    );
  }
  const pipelines = await loadPipelines(store);
  // A link to a deal without ?p= opens the board the deal is on.
  const dealPipeline = !sp.p && sp.deal ? (await store.get("deals", sp.deal))?.pipeline_id : undefined;
  const pipeline = pipelines.find((p) => p.id === (sp.p ?? dealPipeline)) ?? pipelines[0];
  const [deals, companies, contacts] = await Promise.all([store.demo && sp.state === "empty" ? [] : dealCards(store, pipeline.id), store.all("companies"), pipeline.subject === "person" ? store.all("contacts") : []]);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return (
    <div className="flex min-h-[calc(100dvh-104px)] flex-col pb-2 pt-4 lg:min-h-[calc(100dvh-100px)]">
      <h1 className="sr-only">Pipeline: {pipeline.name}</h1>
      <Board
        key={pipeline.id}
        pipeline={pipeline}
        pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
        deals={deals}
        companies={companies.map((c) => ({ id: c.id, name: c.name })).sort(byName)}
        people={contacts.map((c) => ({ id: c.id, name: fullName(c) })).sort(byName)}
      />
    </div>
  );
}
