import { fetchPrices } from "@/lib/prices";
import { loootFromEnv } from "@/lib/looot";
import { readLimits } from "@/lib/limits";
import { IS_DEMO } from "@/lib/store";
import { cronConfig } from "@/lib/scheduled/config";
import { cronAuthError, cronStore } from "@/lib/scheduled/cron";
import { runSignalSweep, type SweepStep } from "@/lib/scheduled/signals";
import { postSlack, signalsMessage } from "@/lib/scheduled/slack";

/** A news check runs about 40 looot calls one after another. */
export const maxDuration = 300;

/**
 * Scheduled signal check (Vercel Cron, GET). ?step=news (default) or ?step=hiring. Posts what it
 * found, or why it skipped, to CRON_SLACK_WEBHOOK_URL. Calling it again on the same day (news)
 * or week (hiring) replays the stored run and spends nothing.
 */
export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;
  if (IS_DEMO) return Response.json({ skipped: "demo" });
  const step: SweepStep = new URL(req.url).searchParams.get("step") === "hiring" ? "hiring" : "news";
  const store = await cronStore();
  if (store instanceof Response) return store;
  const { prices } = await fetchPrices();
  const cfg = cronConfig();
  const report = await runSignalSweep({ store, looot: loootFromEnv(), prices, perActionMaxUsd: readLimits().perActionMaxUsd, config: cfg, now: new Date() }, step);
  const text = report.status === "replayed" ? null : signalsMessage(report, cfg.openerSuffix, step === "news" ? cfg.signalBoards : cfg.hiringBoards, cfg.openerPitch);
  const posted = text ? await postSlack(process.env.CRON_SLACK_WEBHOOK_URL, text).catch(() => false) : false;
  return Response.json({ ...report, posted }, { headers: { "Cache-Control": "no-store" } });
}
