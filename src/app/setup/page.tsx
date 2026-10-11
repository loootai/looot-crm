import type { Metadata } from "next";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Set the allow-list" };
export const dynamic = "force-dynamic";

/** Shown to every signed-in user while the operator has not set who may use this workspace. */
export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <h1 className="text-xl font-semibold tracking-[-0.01em]">One setting is missing</h1>
      <p className="mt-2 text-13 text-muted-foreground">
        This workspace is closed until its owner says who may use it. Anyone who can sign up to the Supabase project could otherwise read the data and spend the looot balance.
      </p>
      <p className="mt-4 text-13">Set one or both of these on the server, then restart or redeploy.</p>
      <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">{`LOOOT_CRM_ALLOWED_EMAILS=you@example.com,teammate@example.com\nLOOOT_CRM_ALLOWED_DOMAINS=example.com`}</pre>
      <p className="mt-3 text-xs text-muted-foreground">Comma separated, case-insensitive, exact match. Until then the data, settings and spending routes answer 503.</p>
      <form action={signOut} className="mt-6">
        <Button type="submit" variant="outline" size="sm">Sign out</Button>
      </form>
    </main>
  );
}
