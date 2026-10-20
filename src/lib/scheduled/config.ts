import { round6 } from "../jobs";
import type { Store } from "../store/types";

/** Settings of the scheduled jobs, read from the environment with safe defaults. */
export interface CronConfig {
  /** The most one scheduled run may spend. */
  runCapUsd: number;
  /** The most all scheduled runs together may spend in 7 days. */
  weekCapUsd: number;
  /** Companies checked per signal run, the least recently checked first. */
  maxCompanies: number;
  /** Boards whose open cards get the news check. */
  signalBoards: string[];
  /** Boards whose open cards get the hiring check. */
  hiringBoards: string[];
  /** The board new prospects are added to, at its first open stage. */
  prospectBoard: string;
  /** Who reviews new prospects. Goes into the card's next step. */
  prospectReviewer: string;
  /** Prospects added per run. */
  prospectsPerRun: number;
  /** The country the prospect search looks in, as a two-letter code. Empty: the prospect job skips. */
  prospectCountry: string;
  /** Job titles the prospect search looks for. */
  prospectTitles: string[];
  /** LinkedIn company industries the prospect search keeps. Empty: any industry. */
  prospectIndustries: string[];
  /** Keep only organisations based in `prospectCountry` (a site on its domain or an address there), not foreign ones with local staff. */
  prospectLocalOnly: boolean;
  /** The name of the cards new prospects get. */
  prospectCardName: string;
  /** Words that narrow the news check, joined with OR. */
  newsKeywords: string[];
  /** Words that narrow the hiring check; a job title must contain one to count. */
  hiringKeywords: string[];
  /** One sentence about what you offer, added to every opener. Empty: no pitch. */
  openerPitch: string;
  /** Appended to every opener, e.g. an event's dates and venue. */
  openerSuffix: string;
}

/** Security news terms. Set CRON_NEWS_KEYWORDS for other topics or languages. */
export const DEFAULT_NEWS_KEYWORDS = ["cybersecurity", "breach", "ransomware", "data leak", "CISO"];
/** Words in the title of a security role. */
export const DEFAULT_HIRING_KEYWORDS = ["security", "cyber", "CISO", "SOC analyst"];
/** Heads of security. */
export const DEFAULT_PROSPECT_TITLES = [
  "CISO",
  "Chief Information Security Officer",
  "Head of Information Security",
  "Head of Cybersecurity",
  "Head of Cyber Security",
  "IT Security Manager",
  "Information Security Manager",
];

/**
 * A comma separated list, or semicolon separated when the items themselves hold commas
 * (some LinkedIn industries do). Empty or unset gives the default.
 */
export const list = (v: string | undefined, d: string[]) => (v?.trim() ? v.split(v.includes(";") ? ";" : ",").map((s) => s.trim()).filter(Boolean) : d);

export function cronConfig(env: Record<string, string | undefined> = process.env): CronConfig {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v && Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    runCapUsd: num(env.CRON_RUN_CAP_USD, 0.5),
    weekCapUsd: num(env.CRON_WEEK_CAP_USD, 1.5),
    maxCompanies: Math.floor(num(env.CRON_MAX_COMPANIES, 40)),
    signalBoards: list(env.CRON_SIGNAL_BOARDS, ["Sales"]),
    hiringBoards: list(env.CRON_HIRING_BOARDS, ["Sales"]),
    prospectBoard: env.CRON_PROSPECT_BOARD?.trim() || "Sales",
    prospectReviewer: env.CRON_PROSPECT_REVIEWER?.trim() || "Team",
    prospectsPerRun: Math.min(25, Math.floor(num(env.CRON_PROSPECTS_PER_RUN, 10))),
    prospectCountry: /^[A-Za-z]{2}$/.test(env.CRON_PROSPECT_COUNTRY?.trim() ?? "") ? env.CRON_PROSPECT_COUNTRY!.trim().toUpperCase() : "",
    prospectTitles: list(env.CRON_PROSPECT_TITLES, DEFAULT_PROSPECT_TITLES),
    prospectIndustries: list(env.CRON_PROSPECT_INDUSTRIES, []),
    prospectLocalOnly: /^(1|true|yes)$/i.test(env.CRON_PROSPECT_LOCAL_ONLY?.trim() ?? ""),
    prospectCardName: env.CRON_PROSPECT_CARD_NAME?.trim() || "Prospect",
    newsKeywords: list(env.CRON_NEWS_KEYWORDS, DEFAULT_NEWS_KEYWORDS),
    hiringKeywords: list(env.CRON_HIRING_KEYWORDS, DEFAULT_HIRING_KEYWORDS),
    openerPitch: env.CRON_OPENER_PITCH?.trim() ?? "",
    openerSuffix: env.CRON_OPENER_SUFFIX?.trim() ?? "",
  };
}

/** Every scheduled action's key starts with this, so the weekly cap can find them. */
export const CRON_KEY_PREFIX = "cron:";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** What scheduled actions spent in the 7 days before `now`. */
export async function weekSpend(store: Store, now: Date): Promise<number> {
  const since = now.getTime() - WEEK_MS;
  const actions = await store.all("actions");
  return round6(actions.filter((a) => a.action_key.startsWith(CRON_KEY_PREFIX) && Date.parse(a.created_at) >= since).reduce((s, a) => s + Number(a.actual_usd || 0), 0));
}

/** The most this run may spend: the run cap, or what is left of the weekly cap when that is less. */
export function runAllowance(cfg: Pick<CronConfig, "runCapUsd" | "weekCapUsd">, spentThisWeek: number): number {
  return round6(Math.max(0, Math.min(cfg.runCapUsd, cfg.weekCapUsd - spentThisWeek)));
}

/** The UTC date of `now`, as used in the idempotent keys of daily runs. */
export const day = (now: Date) => now.toISOString().slice(0, 10);

/** The UTC date of the Monday of `now`'s week, for weekly runs. */
export function weekOf(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return day(d);
}
