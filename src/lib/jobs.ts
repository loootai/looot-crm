/** The ten looot jobs this app runs, with the prices saved on FALLBACK_DATE for when the catalog cannot be read. */
export const FALLBACK_DATE = "2026-10-08";

export interface JobSpec {
  id: string;
  feature: string;
  /** Cheapest price per call on FALLBACK_DATE, null when no provider prices per call. */
  perCall: number | null;
  /** Cheapest price per result on FALLBACK_DATE. */
  perResult: number | null;
  /** Results one call is expected to return, used when a job is priced per result. */
  results: number;
  /** Sent as fallback.maxCostUsd. looot does not charge one run more than this. */
  cap: number;
}

export const JOBS = {
  "company.enrich": { id: "company.enrich", feature: "Enrich company", perCall: 0.0019, perResult: 0.00145, results: 1, cap: 0.02 },
  "jobs.search": { id: "jobs.search", feature: "Intent: hiring", perCall: 0.0005, perResult: 0.000145, results: 10, cap: 0.02 },
  "news.search": { id: "news.search", feature: "Intent: news", perCall: 0.00099, perResult: null, results: 10, cap: 0.01 },
  "company.technographics": { id: "company.technographics", feature: "Intent: tech stack", perCall: 0, perResult: 0.01, results: 1, cap: 0.02 },
  "company.funding": { id: "company.funding", feature: "Intent: funding", perCall: 0.01, perResult: null, results: 1, cap: 0.07 },
  "web.scrape.markdown": { id: "web.scrape.markdown", feature: "Intent: site changes", perCall: 0.0002, perResult: 0.001, results: 1, cap: 0.005 },
  "people.email.find": { id: "people.email.find", feature: "Contact: find work email", perCall: 0.003598, perResult: 0.019, results: 1, cap: 0.03 },
  "people.email.verify": { id: "people.email.verify", feature: "Contact: verify email", perCall: 0.00145, perResult: null, results: 1, cap: 0.01 },
  "people.phone.find": { id: "people.phone.find", feature: "Contact: find phone", perCall: 0.00483, perResult: 0.0264, results: 1, cap: 0.06 },
  "people.search": { id: "people.search", feature: "Find more people like this", perCall: 0, perResult: 0.00036, results: 10, cap: 0.02 },
} as const satisfies Record<string, JobSpec>;

export type JobId = keyof typeof JOBS;
export const JOB_IDS = Object.keys(JOBS) as JobId[];

/** The estimate for one run: the higher of the per-call price and the per-result price times the expected results. */
export function quoteOf(perCall: number | null | undefined, perResult: number | null | undefined, results: number): number {
  return round6(Math.max(perCall ?? 0, (perResult ?? 0) * results));
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export type PriceMap = Record<JobId, number>;

export const FALLBACK_PRICES: PriceMap = Object.fromEntries(
  JOB_IDS.map((id) => [id, quoteOf(JOBS[id].perCall, JOBS[id].perResult, JOBS[id].results)]),
) as PriceMap;
