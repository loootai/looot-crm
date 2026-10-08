import { SIGNAL_KINDS, type Signal, type SignalKind, type Weights } from "./types";

export const DEFAULT_WEIGHTS: Weights = { funding: 30, hiring: 8, tech: 10, news_tagged: 6, news_other: 2, site: 5 };

/** The most one signal kind can add to the score. The five caps add up to 100. */
export const KIND_CAPS: Record<SignalKind, number> = { funding: 30, hiring: 24, tech: 20, news: 16, site: 10 };

export const HALF_LIFE_DAYS = 30;
export const WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;
const TAGGED_NEWS = new Set(["funding", "launch", "leadership", "partnership"]);

/** Points a new signal of this kind is worth before decay. */
export function basePoints(kind: SignalKind, tag: string | null | undefined, w: Weights = DEFAULT_WEIGHTS): number {
  if (kind === "news") return tag && TAGGED_NEWS.has(tag) ? w.news_tagged : w.news_other;
  return w[kind];
}

/** Whole days between a signal and now. */
export function ageDays(occurredAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(occurredAt).getTime()) / DAY_MS));
}

/** Points left after decay: half every 30 days, nothing after 90 days. */
export function decayed(points: number, age: number): number {
  if (age > WINDOW_DAYS) return 0;
  return points * Math.pow(0.5, age / HALF_LIFE_DAYS);
}

export interface ScoreResult {
  score: number;
  breakdown: Record<SignalKind, number>;
  newest: Record<SignalKind, string | null>;
}

/**
 * Intent score of one company. Each kind is the decayed sum of its signals, capped, rounded to a
 * whole number. The score is the sum of the five kinds, at most 100, so the table on the Intent tab
 * always adds up to the number above it.
 */
export function scoreCompany(
  signals: Pick<Signal, "kind" | "tag" | "occurred_at">[],
  weights: Weights = DEFAULT_WEIGHTS,
  now: Date = new Date(),
): ScoreResult {
  const raw: Record<SignalKind, number> = { funding: 0, hiring: 0, tech: 0, news: 0, site: 0 };
  const newest: Record<SignalKind, string | null> = { funding: null, hiring: null, tech: null, news: null, site: null };
  for (const s of signals) {
    raw[s.kind] += decayed(basePoints(s.kind, s.tag, weights), ageDays(s.occurred_at, now));
    if (!newest[s.kind] || s.occurred_at > newest[s.kind]!) newest[s.kind] = s.occurred_at;
  }
  const breakdown = { ...raw };
  let score = 0;
  for (const k of SIGNAL_KINDS) {
    breakdown[k] = Math.round(Math.min(raw[k], KIND_CAPS[k]));
    score += breakdown[k];
  }
  return { score: Math.min(100, score), breakdown, newest };
}

export type ScoreBand = "low" | "mid" | "high";
/** 0 to 29 low, 30 to 59 mid, 60 and up high. */
export function scoreBand(score: number): ScoreBand {
  return score >= 60 ? "high" : score >= 30 ? "mid" : "low";
}
