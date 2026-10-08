import type { Metadata } from "next";
import { Page, PersonAvatar } from "@/components/common";
import { DataSection, SettingsForm } from "@/components/settings-client";
import { readLimits } from "@/lib/limits";
import { loadSettings } from "@/lib/runner";
import { DEFAULT_WEIGHTS } from "@/lib/score";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { store, user } = await requireSession();
  const settings = await loadSettings(store);
  const limits = readLimits();
  return (
    <Page className="max-w-[960px]">
      <h1 className="sr-only">Settings</h1>
      <section aria-labelledby="profile-h" className="border-b border-border pb-6">
        <h2 id="profile-h" className="text-base font-semibold">Profile</h2>
        <div className="mt-3 flex items-center gap-3">
          <PersonAvatar name={user.name} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-13 text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <p className="mt-3 max-w-xl text-13 text-muted-foreground">{store.demo ? "Demo account. Nothing you change here leaves this server process." : "One workspace per sign-in. Row level security keeps every row to the account that created it."}</p>
      </section>
      <SettingsForm
        initial={{ role_keywords: settings.role_keywords, default_pages: settings.default_pages, weights: settings.weights ?? DEFAULT_WEIGHTS, action_ceiling_usd: settings.action_ceiling_usd }}
        perActionMax={limits.perActionMaxUsd}
        bulkMax={limits.bulkMaxRecords}
      />
      <DataSection demo={store.demo} />
    </Page>
  );
}
