import { NextResponse } from "next/server";
import { bad, sessionOr401 } from "@/lib/api";

/** Status of an action by its key: the action row and its runs so far. Free. */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const { key } = await ctx.params;
  const [action] = await session.store.all("actions", { action_key: key });
  if (!action) return bad("No action with this key yet.", 404, "not_found");
  return NextResponse.json({ action, runs: await session.store.all("runs", { action_id: action.id }) });
}
