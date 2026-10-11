import { round6 } from "./jobs";
import { usd4, usdCap } from "./format";

/** After this long a reservation is checked against the run's real status. */
export const RESERVATION_SOFT_SECONDS = 15 * 60;
/** After this long a reservation that could not be resolved is released. */
export const RESERVATION_HARD_SECONDS = 24 * 60 * 60;

/** Spent, held and total for one period. remainingUsd never goes below zero. */
export interface BudgetWindow {
  budgetUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
}

/** The daily and monthly budget as the sidebar and the Spend page show it. */
export interface BudgetStatus {
  daily: BudgetWindow;
  monthly: BudgetWindow;
}

/** Builds a window from a budget, what was spent and what is held. */
export const windowOf = (budgetUsd: number, spentUsd: number, reservedUsd: number): BudgetWindow => ({
  budgetUsd,
  spentUsd: round6(spentUsd),
  reservedUsd: round6(reservedUsd),
  remainingUsd: round6(Math.max(0, budgetUsd - spentUsd - reservedUsd)),
});

/** One paid call to hold money for. `key` is the call's idempotency key. */
export interface ReserveRequest {
  actionId: string;
  key: string;
  jobId: string;
  /** The most looot may charge for the call: its cap. */
  amountUsd: number;
  now: Date;
}

export type BudgetScope = "daily" | "monthly";

export type ReserveResult = { ok: true; budget: BudgetStatus } | { ok: false; reason: "duplicate" } | { ok: false; reason: "budget"; scope: BudgetScope; budget: BudgetStatus };

/** A held amount. state "reserved" counts against the budget. */
export interface Reservation {
  key: string;
  actionId: string;
  jobId: string;
  amountUsd: number;
  state: "reserved" | "settled" | "released";
  loootRunId: string | null;
  createdAt: string;
  expiresAt: string;
  hardExpiresAt: string;
}

export interface ReserveNumbers {
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  spentDayUsd: number;
  spentMonthUsd: number;
  reservedUsd: number;
  amountUsd: number;
}

/**
 * The reservation rule, in the order the database function applies it: daily budget, then monthly
 * budget. Spent plus held plus the new amount must stay within each. null means it fits. The
 * Postgres function reserve_budget() is the same rule under a row lock.
 */
export function overBudget(n: ReserveNumbers): BudgetScope | null {
  if (round6(n.spentDayUsd + n.reservedUsd + n.amountUsd) > n.dailyBudgetUsd) return "daily";
  if (round6(n.spentMonthUsd + n.reservedUsd + n.amountUsd) > n.monthlyBudgetUsd) return "monthly";
  return null;
}

/** The refusal shown to the user when a reservation fails. Names the period and the numbers. */
export function budgetRefusal(scope: BudgetScope, b: BudgetStatus, needUsd: number): string {
  const w = scope === "daily" ? b.daily : b.monthly;
  return `The ${scope} budget of ${usdCap(w.budgetUsd)} cannot cover this run (${usd4(needUsd)}): ${usd4(w.spentUsd)} spent, ${usd4(w.reservedUsd)} held for runs in progress, ${usd4(w.remainingUsd)} left. No call was made. Change the budget in Settings.`;
}

/** The start of the UTC day `at` is in. */
export const dayStart = (at: Date): Date => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
/** The start of the UTC month `at` is in. */
export const monthStart = (at: Date): Date => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
