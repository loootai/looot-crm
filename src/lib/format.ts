/** Formatting helpers shared by server and client components. All dates render in UTC so server and browser agree. */

const DAY = 86_400_000;

/** Dollars with 4 decimals for looot prices ($0.0469). Rounds half up, which toFixed alone does not. */
export function usd4(n: number | null | undefined): string {
  const v = Math.round(((n ?? 0) + 1e-9) * 1e4) / 1e4;
  return `$${v.toFixed(4)}`;
}

/** Dollars with 2 decimals ($0.10). */
export function usd2(n: number | null | undefined): string {
  const v = Math.round(((n ?? 0) + 1e-9) * 100) / 100;
  return `$${v.toFixed(2)}`;
}

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
/** Whole dollars from cents ($84,000). */
export function money(cents: number): string {
  return MONEY.format(Math.round(cents / 100));
}

/** Compact dollars from cents ($84k, $1.2M). */
export function moneyShort(cents: number): string {
  const d = cents / 100;
  if (d >= 1e6) return `$${(d / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (d >= 1e3) return `$${(d / 1e3).toFixed(d % 1000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(d)}`;
}

const NUM = new Intl.NumberFormat("en-US");
export const num = (n: number) => NUM.format(n);

const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** "3 Oct". */
export const shortDate = (iso: string | null | undefined) => (iso ? SHORT.format(new Date(iso)) : "");
/** "3 Oct 2026". */
export const longDate = (iso: string | null | undefined) => (iso ? LONG.format(new Date(iso)) : "");
/** "14:02". */
export const clock = (iso: string | null | undefined) => (iso ? TIME.format(new Date(iso)) : "");

/** Whole days from the start of `now`'s UTC day to the start of the given day. Negative is in the past. */
export function dayDiff(iso: string, now: Date = new Date()): number {
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(iso);
  const b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((b - a) / DAY);
}

/** "today", "yesterday", "3 days ago", "5 weeks ago", or the date when older than a year. */
export function relative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
  if (days <= 0) {
    const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    return "today";
  }
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 70) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return longDate(iso);
}

/** Due label for a date: "today", "tomorrow", "in 4 days", "2 days overdue". */
export function dueLabel(iso: string, now: Date = new Date()): { text: string; overdue: boolean } {
  const d = dayDiff(iso, now);
  if (d === 0) return { text: "today", overdue: false };
  if (d === 1) return { text: "tomorrow", overdue: false };
  if (d > 1) return { text: `in ${d} days`, overdue: false };
  return { text: d === -1 ? "1 day overdue" : `${-d} days overdue`, overdue: true };
}

export function fullName(c: { first_name: string | null; last_name: string | null }): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed";
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** A stable small number from a string, used to pick a monogram tint. */
export function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** Lowercased host of a URL or domain the user typed, or null when it is not a host. */
export function cleanDomain(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : null;
}
