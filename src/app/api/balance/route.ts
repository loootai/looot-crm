import "server-only";
import { NextResponse } from "next/server";
import { sessionOr401 } from "@/lib/api";
import { LoootClient } from "@/lib/looot";
import { IS_DEMO } from "@/lib/store";

/** The looot balance in dollars. Free read. Null when the token is missing or the read fails. */
export async function GET() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  if (IS_DEMO) return NextResponse.json({ balance: 18.42, demo: true });
  const token = process.env.LOOOT_TOKEN;
  if (!token) return NextResponse.json({ balance: null, demo: false, tokenMissing: true });
  try {
    const balance = await new LoootClient({ token, baseUrl: process.env.LOOOT_API_URL }).balance();
    return NextResponse.json({ balance, demo: false });
  } catch {
    return NextResponse.json({ balance: null, demo: false });
  }
}
