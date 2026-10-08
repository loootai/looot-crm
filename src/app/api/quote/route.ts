import { NextResponse } from "next/server";
import { bad, hasToken, sessionOr401 } from "@/lib/api";
import { readLimits } from "@/lib/limits";
import { quoteRows } from "@/lib/plan";
import { fetchPrices } from "@/lib/prices";
import { clampMax, loadSettings, planFor } from "@/lib/runner";
import { QuoteSchema } from "@/lib/schemas";

/** Builds the plan of a paid action on the server and returns its cost. Spends nothing and never calls a paid endpoint. */
export async function POST(request: Request) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const parsed = QuoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("The request is not valid.");
  const limits = readLimits();
  if (parsed.data.targetIds.length > limits.bulkMaxRecords) return bad(`One action can cover at most ${limits.bulkMaxRecords} records.`, 400, "too_many_records");
  const { store } = session;
  const [prices, settings] = await Promise.all([fetchPrices(), loadSettings(store)]);
  const { plan } = await planFor(store, parsed.data, prices.prices);
  const ceiling = clampMax(Number.MAX_SAFE_INTEGER, limits.perActionMaxUsd, settings.action_ceiling_usd);
  return NextResponse.json({
    title: plan.title,
    targetLabel: plan.targetLabel,
    targetCount: plan.targetCount,
    rows: quoteRows(plan.lines),
    runs: plan.lines.length,
    estimate: plan.estimate,
    worstCase: plan.worstCase,
    ceiling,
    priceSource: prices.source,
    priceReadAt: prices.readAt,
    demo: store.demo,
    tokenMissing: !hasToken(),
  });
}
