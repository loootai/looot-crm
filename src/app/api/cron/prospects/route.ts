import { loootFromEnv } from "@/lib/looot";
import { IS_DEMO } from "@/lib/store";
import { cronConfig } from "@/lib/scheduled/config";
import { cronAuthError, cronStore } from "@/lib/scheduled/cron";
import { runProspects } from "@/lib/scheduled/prospects";
import { postSlack, prospectsMessage } from "@/lib/scheduled/slack";

export const maxDuration = 120;

/** Weekly prospect search (Vercel Cron, GET). Posts the new cards to CRON_SLACK_WEBHOOK_URL. Replays within the same week. */
export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;
  if (IS_DEMO) return Response.json({ skipped: "demo" });
  const store = await cronStore();
  if (store instanceof Response) return store;
  const config = cronConfig();
  const report = await runProspects({ store, looot: loootFromEnv(), config, now: new Date() });
  const text = report.status === "replayed" ? null : prospectsMessage(report, config.prospectBoard);
  const posted = text ? await postSlack(process.env.CRON_SLACK_WEBHOOK_URL, text).catch(() => false) : false;
  return Response.json({ ...report, posted }, { headers: { "Cache-Control": "no-store" } });
}
