import { describe, expect, it, vi } from "vitest";
import { FALLBACK_DATE, FALLBACK_PRICES, JOB_IDS, JOBS, quoteOf } from "./jobs";
import { fetchPrices, priceMapFromOverview } from "./prices";

describe("prices", () => {
  it("quotes the higher of per call and per result times expected results", () => {
    expect(quoteOf(0.0005, 0.000145, 10)).toBe(0.00145);
    expect(quoteOf(0.003598, 0.019, 1)).toBe(0.019);
    expect(quoteOf(0, 0.00036, 10)).toBe(0.0036);
    expect(quoteOf(0.00099, null, 10)).toBe(0.00099);
  });
  it("has a saved price for each of the ten jobs, matching the spec table", () => {
    expect(JOB_IDS).toHaveLength(10);
    expect(FALLBACK_PRICES).toEqual({
      "company.enrich": 0.0019,
      "jobs.search": 0.00145,
      "news.search": 0.00099,
      "company.technographics": 0.01,
      "company.funding": 0.01,
      "web.scrape.markdown": 0.001,
      "people.email.find": 0.019,
      "people.email.verify": 0.00145,
      "people.phone.find": 0.0264,
      "people.search": 0.0036,
    });
  });
  it("reads live prices from a catalog overview and keeps saved ones for missing jobs", () => {
    const overview = { categories: [{ platforms: [{ jobs: [{ id: "news.search", cheapestPerCall: 0.002, cheapestPerResult: null }, { id: "people.search", cheapestPerCall: 0, cheapestPerResult: 0.0005 }, { id: "unrelated.job", cheapestPerCall: 9 }] }] }] };
    const map = priceMapFromOverview(overview);
    expect(map["news.search"]).toBe(0.002);
    expect(map["people.search"]).toBe(0.005);
    expect(map["company.enrich"]).toBe(FALLBACK_PRICES["company.enrich"]);
  });
  it("falls back to the saved prices and their date when the catalog cannot be read", async () => {
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    const p = await fetchPrices("https://api.example.com", down as unknown as typeof fetch);
    expect(p.source).toBe("fallback");
    expect(p.readAt).toBe(FALLBACK_DATE);
    expect(p.prices).toEqual(FALLBACK_PRICES);
    const bad = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    expect((await fetchPrices("https://api.example.com", bad as unknown as typeof fetch)).source).toBe("fallback");
  });
  it("keeps every cap at or above the saved quote", () => {
    for (const id of JOB_IDS) expect(JOBS[id].cap).toBeGreaterThanOrEqual(FALLBACK_PRICES[id]);
  });
});
