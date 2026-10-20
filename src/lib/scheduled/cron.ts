import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SupabaseStore } from "../store/supabaseStore";
import type { Store } from "../store/types";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anything else is refused, and so is every call while the secret is unset. */
export function cronAuthError(req: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const secret = env.CRON_SECRET;
  if (!secret || secret.length < 16) return json(503, { error: { code: "setup_required", message: "Set CRON_SECRET (16+ characters) on the server." } });
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return json(401, { error: { code: "unauthorized", message: "Wrong or missing cron secret." } });
  return null;
}

/**
 * The store for a scheduled job. The job signs in as a bot user that is a member of the workspace
 * (CRON_BOT_EMAIL, CRON_BOT_PASSWORD), so row level security, the column defaults and the budget
 * functions work exactly as for a person. No service-role key is needed. When CRON_WORKSPACE_ID is
 * set, the bot's workspace must be that one.
 */
export async function cronStore(env: Record<string, string | undefined> = process.env): Promise<Store | Response> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = env.CRON_BOT_EMAIL, password = env.CRON_BOT_PASSWORD;
  if (!url || !key || !email || !password) return json(503, { error: { code: "setup_required", message: "Set CRON_BOT_EMAIL and CRON_BOT_PASSWORD for the scheduled jobs." } });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signIn } = await db.auth.signInWithPassword({ email, password });
  if (signIn) return json(500, { error: { code: "bot_sign_in", message: "The scheduled jobs' bot user could not sign in." } });
  const { data: joined, error } = await db.rpc("join_workspace");
  const ws = (joined as { workspace_id?: string } | null)?.workspace_id;
  if (error || !ws) return json(500, { error: { code: "workspace", message: "The bot user has no workspace." } });
  if (env.CRON_WORKSPACE_ID && env.CRON_WORKSPACE_ID !== ws) return json(500, { error: { code: "workspace", message: "The bot user is in a different workspace than CRON_WORKSPACE_ID." } });
  return new SupabaseStore(db, ws);
}
