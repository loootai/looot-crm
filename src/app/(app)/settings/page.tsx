import type { Metadata } from "next";
import { Page, PersonAvatar } from "@/components/common";
import { DataSection, SettingsForm } from "@/components/settings-client";
import { PipelinesSection, type StageCounts } from "@/components/pipelines-client";
import { TeamSection } from "@/components/team-client";
import { loadPipelines, primaryPipeline } from "@/lib/pipelines";
import { emailAllowed } from "@/lib/access";
import { readLimits } from "@/lib/limits";
import { loadSettings } from "@/lib/runner";
import { DEFAULT_WEIGHTS } from "@/lib/score";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { store, user, workspace } = await requireSession();
  const [settings, members, pipelines, deals] = await Promise.all([loadSettings(store), store.members(), loadPipelines(store), store.all("deals")]);
  const counts: StageCounts = {};
  for (const d of deals) (counts[d.pipeline_id] ??= {})[d.stage] = (counts[d.pipeline_id]?.[d.stage] ?? 0) + 1;
  const owner = workspace.role === "owner";
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
        <p className="mt-3 max-w-xl text-13 text-muted-foreground">{store.demo ? "Demo account. Nothing you change here leaves this server process." : "Row level security keeps every row inside your workspace. People outside it see none of them."}</p>
      </section>
      <SettingsForm
        initial={{ role_keywords: settings.role_keywords, default_pages: settings.default_pages, weights: settings.weights ?? DEFAULT_WEIGHTS, action_ceiling_usd: settings.action_ceiling_usd, daily_budget_usd: settings.daily_budget_usd ?? 5, monthly_budget_usd: settings.monthly_budget_usd ?? 50 }}
        perActionMax={limits.perActionMaxUsd}
        bulkMax={limits.bulkMaxRecords}
        canEditBudget={owner}
      />
      <TeamSection
        name={workspace.name}
        role={workspace.role}
        demo={store.demo}
        members={members.map((m) => ({ email: m.email, role: m.role, joined: !!m.joined_at, you: m.email === user.email.toLowerCase(), allowed: emailAllowed(m.email) }))}
      />
      <PipelinesSection key={pipelines.map((p) => `${p.id}:${p.name}:${p.stages.map((st) => `${st.key}=${st.label}/${st.kind}`).join(",")}`).join("|")} pipelines={pipelines} counts={counts} defaultCurrency={primaryPipeline(pipelines)?.currency ?? "USD"} />
      <DataSection demo={store.demo} owner={owner} />
    </Page>
  );
}
