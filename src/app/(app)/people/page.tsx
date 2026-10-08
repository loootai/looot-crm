import type { Metadata } from "next";
import { ErrorPanel, Page } from "@/components/common";
import { PeopleTable } from "@/components/people/PeopleTable";
import { LinkButton } from "@/components/today-client";
import { readLimits } from "@/lib/limits";
import { fetchPrices } from "@/lib/prices";
import { personRows } from "@/lib/queries";
import { loadSettings } from "@/lib/runner";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const sp = await searchParams;
  const { store } = await requireSession();
  if (store.demo && sp.state === "error") {
    return (
      <Page>
        <ErrorPanel message="The people list could not be read. Check the database connection, then try again." requestId="req_demo_91be07" action={<LinkButton href="/people">Try again</LinkButton>} />
      </Page>
    );
  }
  const [rows, companies, prices, settings] = await Promise.all([personRows(store), store.all("companies"), fetchPrices(), loadSettings(store)]);
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return (
    <Page>
      <h1 className="sr-only">People</h1>
      <PeopleTable
        rows={rows}
        prices={prices.prices}
        roleKeywords={settings.role_keywords}
        companies={companies.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name))}
        bulkMax={readLimits().bulkMaxRecords}
        demoEmpty={store.demo && sp.state === "empty"}
      />
    </Page>
  );
}
