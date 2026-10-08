import { FALLBACK_DATE, FALLBACK_PRICES, JOBS, type JobId, type PriceMap, quoteOf } from "./jobs";

interface OverviewJob {
  id: string;
  cheapestPerCall?: number | null;
  cheapestPerResult?: number | null;
}
interface Overview {
  categories?: { platforms?: { jobs?: OverviewJob[] }[] }[];
}

/** Reads the quote of each job this app uses from a catalog overview answer. Jobs the answer lacks keep the saved price. */
export function priceMapFromOverview(overview: Overview): PriceMap {
  const out: PriceMap = { ...FALLBACK_PRICES };
  for (const c of overview.categories ?? []) {
    for (const p of c.platforms ?? []) {
      for (const j of p.jobs ?? []) {
        if (!(j.id in JOBS)) continue;
        const id = j.id as JobId;
        const perCall = typeof j.cheapestPerCall === "number" ? j.cheapestPerCall : null;
        const perResult = typeof j.cheapestPerResult === "number" ? j.cheapestPerResult : null;
        const price = quoteOf(perCall, perResult, JOBS[id].results);
        if (price > 0) out[id] = price;
      }
    }
  }
  return out;
}

export interface Prices {
  prices: PriceMap;
  source: "catalog" | "fallback";
  /** ISO time of the catalog read, or the date the saved prices were taken. */
  readAt: string;
}

/** Free, no key needed. Reads current prices from the public catalog overview, cached for an hour. */
export async function fetchPrices(baseUrl = process.env.LOOOT_API_URL ?? "https://api.looot.ai", f: typeof fetch = fetch): Promise<Prices> {
  const fallback: Prices = { prices: { ...FALLBACK_PRICES }, source: "fallback", readAt: FALLBACK_DATE };
  if (process.env.LOOOT_OFFLINE === "1") return fallback;
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/catalog/overview?depth=jobs`;
  // One retry: a gateway error on the first read should not push the app onto saved prices.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await f(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) } as RequestInit);
      if (!res.ok) continue;
      const body = (await res.json()) as Overview;
      return { prices: priceMapFromOverview(body), source: "catalog", readAt: new Date().toISOString() };
    } catch {
      // Try once more, then fall back.
    }
  }
  return fallback;
}
