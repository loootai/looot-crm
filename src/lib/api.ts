import "server-only";
import { NextResponse } from "next/server";
import { DemoLooot } from "@/demo/demoLooot";
import { loootFromEnv } from "./looot";
import { demoStore, IS_DEMO, resolveGate, type Session } from "./store";
import { allowCall, spendRateLimit } from "./rateLimit";
import type { LoootLike } from "./runner";

/**
 * The session for a route handler, or the refusal to send: 401 not signed in, 403 signed in but not
 * on the allow-list, 503 when the operator has set no allow-list. Every private route starts here.
 */
export async function sessionOr401(): Promise<Session | NextResponse> {
  const g = await resolveGate();
  if (g.kind === "ok") return g.session;
  if (g.kind === "setup") return NextResponse.json({ error: { code: "setup_required", message: "Set LOOOT_CRM_ALLOWED_EMAILS on the server, then try again." } }, { status: 503 });
  if (g.kind === "denied") return NextResponse.json({ error: { code: "forbidden", message: "You are not authorised for this workspace." } }, { status: 403 });
  return NextResponse.json({ error: { code: "unauthorized", message: "Sign in first." } }, { status: 401 });
}

/** A 429 answer when this user already made too many calls to a spending route this minute, else null. */
export function rateLimited(bucket: string, session: Session): NextResponse | null {
  if (session.store.demo || allowCall(bucket, session.user.id, spendRateLimit())) return null;
  return bad("Too many requests. Wait a minute and try again.", 429, "rate_limited");
}

/** The looot client for this request. Demo mode never reads LOOOT_TOKEN and never calls looot. */
export function loootForRequest(): LoootLike {
  return IS_DEMO ? new DemoLooot(demoStore()) : loootFromEnv();
}

export const hasToken = () => IS_DEMO || !!process.env.LOOOT_TOKEN;

export function bad(message: string, status = 400, code = "bad_request") {
  return NextResponse.json({ error: { code, message } }, { status });
}
