import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { bad, loootForRequest, sessionOr401 } from "@/lib/api";
import { readLimits } from "@/lib/limits";
import { LoootError } from "@/lib/looot";
import { fetchPrices } from "@/lib/prices";
import { executeAction } from "@/lib/runner";
import { ActionSchema } from "@/lib/schemas";

export const maxDuration = 300;

/**
 * Runs a paid action after the user confirmed its quote. The plan is rebuilt here from the record
 * ids, so prices in the request body are never trusted. Posting the same actionKey again returns
 * the stored action without calling looot.
 */
export async function POST(request: Request) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("The request is not valid.");
  const limits = readLimits();
  if (parsed.data.targetIds.length > limits.bulkMaxRecords) return bad(`One action can cover at most ${limits.bulkMaxRecords} records.`, 400, "too_many_records");
  const { store } = session;
  let looot;
  try {
    looot = loootForRequest();
  } catch (e) {
    if (e instanceof LoootError && e.code === "missing_token") return bad("LOOOT_TOKEN is not set on the server. Add it to .env.local", 503, "missing_token");
    throw e;
  }
  const prices = await fetchPrices();
  const result = await executeAction({ store, looot, prices: prices.prices, perActionMaxUsd: limits.perActionMaxUsd }, parsed.data);
  revalidatePath("/", "layout");
  return NextResponse.json(result);
}
