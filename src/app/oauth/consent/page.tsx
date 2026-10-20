import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { redirectAllowed, redirectHost } from "@/lib/mcp/consent";
import { IS_DEMO, resolveGate } from "@/lib/store";
import { serverSupabase } from "@/lib/supabase/server";
import { approveConsent, denyConsent } from "./actions";

export const metadata: Metadata = { title: "Connect an app" };
export const dynamic = "force-dynamic";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <h1 className="text-xl font-semibold tracking-[-0.01em]">{title}</h1>
      {children}
    </main>
  );
}

/**
 * The consent page of the Supabase OAuth 2.1 server, where an MCP client such as Claude asks to act as
 * the signed-in person. Only clients that redirect to an allowed host (MCP_ALLOWED_REDIRECT_HOSTS) can
 * be approved; anything else can only be denied.
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string; error?: string }> }) {
  const sp = await searchParams;
  if (IS_DEMO) return <Shell title="Not available in demo mode"><p className="mt-2 text-13 text-muted-foreground">Connecting apps needs a real Supabase project.</p></Shell>;
  const id = sp.authorization_id ?? "";
  if (!id) return <Shell title="This link is incomplete"><p className="mt-2 text-13 text-muted-foreground">Start the connection again from the app you are connecting.</p></Shell>;
  const gate = await resolveGate();
  if (gate.kind === "anon") redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
  if (gate.kind === "setup") redirect("/setup");
  if (gate.kind === "denied") redirect("/not-authorised");
  const db = await serverSupabase();
  const { data, error } = await db.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return <Shell title="This request has expired"><p className="mt-2 text-13 text-muted-foreground">Start the connection again from the app you are connecting.</p></Shell>;
  if (!("authorization_id" in data)) redirect(data.redirect_url);
  const host = redirectHost(data.redirect_uri) ?? data.redirect_uri;
  const allowed = redirectAllowed(data.redirect_uri);
  const scopes = data.scope.split(" ").filter(Boolean);
  return (
    <Shell title={allowed ? `Connect ${data.client.name || "an app"} to ${gate.session.workspace.name}?` : "This app cannot be connected"}>
      <div className="mt-4 rounded-md border border-border-strong bg-surface p-4">
        <p className="text-xs text-muted-foreground">It will send you back to</p>
        <p className="mt-0.5 break-all font-mono text-base font-semibold">{host}</p>
      </div>
      {allowed ? (
        <div className="mt-4 grid gap-2 text-13">
          <p>
            <span className="font-medium">{data.client.name || "This app"}</span> will act as <span className="font-medium">{gate.session.user.email}</span>: it can read the companies, people and pipelines in this workspace, add people, companies, cards and notes, move cards and set next steps.
          </p>
          <p className="text-muted-foreground">It cannot delete anything, change the team, the budget or settings, or run paid looot actions. Every change it makes shows in the history. You can disconnect it in that app&apos;s settings at any time.</p>
          {scopes.length > 0 && <p className="text-xs text-muted-foreground">Requested scopes: {scopes.join(", ")}</p>}
        </div>
      ) : (
        <p className="mt-4 text-13">
          <span className="font-mono font-semibold">{host}</span> is not on this workspace&apos;s list of allowed apps, so it cannot be approved. If you expected it, ask the person who runs this CRM to add it to <code className="font-mono text-xs">MCP_ALLOWED_REDIRECT_HOSTS</code>.
        </p>
      )}
      {sp.error && <p role="alert" className="mt-3 text-13 text-danger">That did not go through. Try again.</p>}
      <div className="mt-6 flex gap-2">
        {allowed && (
          <form action={approveConsent}>
            <input type="hidden" name="authorization_id" value={data.authorization_id} />
            <Button type="submit" variant="primary">Approve</Button>
          </form>
        )}
        <form action={denyConsent}>
          <input type="hidden" name="authorization_id" value={data.authorization_id} />
          <Button type="submit" variant="outline">Deny</Button>
        </form>
      </div>
    </Shell>
  );
}
