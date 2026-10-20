"use server";

import { redirect } from "next/navigation";
import { redirectAllowed } from "@/lib/mcp/consent";
import { resolveGate } from "@/lib/store";
import { serverSupabase } from "@/lib/supabase/server";

/** Approve or deny an OAuth request from the consent page. Approval rechecks the allow-list and the redirect host on the server. */
async function decide(form: FormData, approve: boolean) {
  const id = String(form.get("authorization_id") ?? "");
  if (!id) redirect("/oauth/consent");
  const gate = await resolveGate();
  if (gate.kind !== "ok") redirect("/login");
  const db = await serverSupabase();
  if (approve) {
    const { data } = await db.auth.oauth.getAuthorizationDetails(id);
    if (!data || !("authorization_id" in data) || !redirectAllowed(data.redirect_uri)) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`);
  }
  const { data, error } = approve ? await db.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true }) : await db.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=1`);
  redirect(data.redirect_url);
}

export async function approveConsent(form: FormData) {
  await decide(form, true);
}

export async function denyConsent(form: FormData) {
  await decide(form, false);
}
