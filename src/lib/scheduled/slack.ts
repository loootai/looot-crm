import type { FoundSignal, SweepReport } from "./signals";
import type { ProspectReport } from "./prospects";

/** Slack mrkdwn escaping for text inside a message or a link label. */
export const slackEscape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A one-line opening for whoever owns the card: a lead-in for the kind of signal, then your pitch and
 * suffix when set (CRON_OPENER_PITCH, CRON_OPENER_SUFFIX). Plain templates: the person sending rewrites it.
 */
export function openerFor(s: Pick<FoundSignal, "kind" | "tag" | "company">, suffix = "", pitch = ""): string {
  return [leadIn(s), pitch, suffix].filter(Boolean).join(" ");
}

function leadIn(s: Pick<FoundSignal, "kind" | "tag" | "company">): string {
  if (s.kind === "hiring") return `Saw ${s.company} is hiring for security: a good moment to get in touch.`;
  switch (s.tag) {
    case "security":
      return `Saw the security news on ${s.company}.`;
    case "leadership":
      return "Congratulations on the new role.";
    case "funding":
    case "launch":
    case "partnership":
      return "Congratulations on the news.";
    default:
      return `Saw ${s.company} in the news: a good moment to get in touch.`;
  }
}

const MAX_LINES = 15;

/**
 * Whether a headline is about the company: its name (before any bracket) appears as a whole word.
 * Short all-caps names (ORB, NGB) must match case too, so "Orb payout" doesn't count.
 */
export function mentions(title: string, company: string): boolean {
  const name = company.replace(/\s*\(.*$/, "").trim();
  if (!name) return false;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = name.length <= 4 && name === name.toUpperCase();
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, exact ? "u" : "iu").test(title);
}

/**
 * What goes to Slack: headlines that name the company, one per company (security news first),
 * cards on the first watched board first. Everything stays on the companies' Intent tabs.
 */
export function forSlack(signals: FoundSignal[], boards: string[] = []): FoundSignal[] {
  const rank = (s: FoundSignal) => (boards.indexOf(s.board) + 1 || boards.length + 1) * 2 + (s.tag === "security" ? 0 : 1);
  const best = new Map<string, FoundSignal>();
  for (const s of signals) {
    if (s.kind === "news" && !mentions(s.title, s.company)) continue;
    const cur = best.get(s.company);
    if (!cur || rank(s) < rank(cur)) best.set(s.company, s);
  }
  return [...best.values()].sort((a, b) => rank(a) - rank(b));
}

/**
 * The Slack message for one signal run, or null when there is nothing worth posting. Only cards
 * on the first of `boards` (the prospects you pitch) get an opener; the others just get the headline.
 */
export function signalsMessage(r: SweepReport, openerSuffix = "", boards: string[] = [], openerPitch = ""): string | null {
  if (r.status === "skipped") return `*Signals (${r.step})* skipped: ${slackEscape(r.reason ?? "no reason given")}`;
  const picked = forSlack(r.signals, boards);
  if (!picked.length) return null;
  const head = `*${r.step === "news" ? "News" : "Hiring"} signals · ${picked.length} ${picked.length === 1 ? "company" : "companies"}* (${r.companies} checked, $${r.spentUsd.toFixed(4)})`;
  const lines = picked.slice(0, MAX_LINES).map((s) => {
    const title = slackEscape(s.title.slice(0, 140));
    const link = s.url ? `<${s.url}|${title}>` : title;
    const opener = !boards.length || s.board === boards[0] ? `\n   _Opener:_ ${slackEscape(openerFor(s, openerSuffix, openerPitch))}` : "";
    return `• *${slackEscape(s.company)}* (${slackEscape(s.board)}${s.owner ? `, ${slackEscape(s.owner)}` : ""}): ${link}${opener}`;
  });
  const more = picked.length > MAX_LINES ? [`…and ${picked.length - MAX_LINES} more companies.`] : [];
  const rest = r.signals.length - picked.length;
  if (rest > 0) more.push(`_${rest} other headlines are on the companies' Intent tabs._`);
  const stop = r.reason ? [`_${slackEscape(r.reason)}_`] : [];
  return [head, ...lines, ...more, ...stop].join("\n");
}

/** The Slack message for one prospect run. */
export function prospectsMessage(r: ProspectReport, board: string): string | null {
  if (r.status === "skipped") return `*New prospects* skipped: ${slackEscape(r.reason ?? "no reason given")}`;
  if (!r.added.length) return r.status === "ran" ? `*New prospects:* the search found ${r.found} people, all already in the CRM.` : null;
  const lines = r.added.map((p) => `• *${slackEscape(p.company)}*${p.industry ? ` (${slackEscape(p.industry)})` : ""}: ${p.linkedin ? `<${p.linkedin}|${slackEscape(p.name)}>` : slackEscape(p.name)}, ${slackEscape(p.title ?? "")}`);
  return [`*${r.added.length} new prospects on ${slackEscape(board)}* for ${slackEscape(r.reviewer)} to pick or decline ($${r.spentUsd.toFixed(4)}). No emails looked up yet.`, ...lines].join("\n");
}

/** Posts to a Slack incoming webhook. Returns false when there is no URL or Slack refuses. */
export async function postSlack(url: string | undefined, text: string, f: typeof fetch = fetch): Promise<boolean> {
  if (!url) return false;
  const res = await f(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  return res.ok;
}
