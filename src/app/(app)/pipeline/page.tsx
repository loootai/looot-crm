import type { Metadata } from "next";
import { ErrorPanel, Page } from "@/components/common";
import { Board } from "@/components/pipeline/Board";
import { LinkButton } from "@/components/today-client";
import { dealCards } from "@/lib/queries";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const sp = await searchParams;
  const { store } = await requireSession();
  if (store.demo && sp.state === "error") {
    return (
      <Page>
        <ErrorPanel message="The deals could not be read. Check the database connection, then try again." requestId="req_demo_5d02ac" action={<LinkButton href="/pipeline">Try again</LinkButton>} />
      </Page>
    );
  }
  const [deals, companies] = await Promise.all([store.demo && sp.state === "empty" ? [] : dealCards(store), store.all("companies")]);
  return (
    <div className="flex min-h-[calc(100dvh-48px)] flex-col pb-20 pt-4 sm:pb-2">
      <h1 className="sr-only">Pipeline</h1>
      <Board deals={deals} companies={companies.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name))} />
    </div>
  );
}
