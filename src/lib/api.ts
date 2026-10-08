import "server-only";
import { NextResponse } from "next/server";
import { DemoLooot } from "@/demo/demoLooot";
import { loootFromEnv } from "./looot";
import { demoStore, getSession, IS_DEMO, type Session } from "./store";
import type { LoootLike } from "./runner";

/** The signed-in session for a route handler, or a 401 answer. */
export async function sessionOr401(): Promise<Session | NextResponse> {
  const s = await getSession();
  return s ?? NextResponse.json({ error: { code: "unauthorized", message: "Sign in first." } }, { status: 401 });
}

/** The looot client for this request. Demo mode never reads LOOOT_TOKEN and never calls looot. */
export function loootForRequest(): LoootLike {
  return IS_DEMO ? new DemoLooot(demoStore()) : loootFromEnv();
}

export const hasToken = () => IS_DEMO || !!process.env.LOOOT_TOKEN;

export function bad(message: string, status = 400, code = "bad_request") {
  return NextResponse.json({ error: { code, message } }, { status });
}
