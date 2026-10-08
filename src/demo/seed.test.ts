import { describe, expect, it } from "vitest";
import { seedDemo } from "./seed";
import { DEFAULT_WEIGHTS, scoreCompany } from "@/lib/score";
import { OPEN_STAGES } from "@/lib/types";
import { spendData, todayData } from "@/lib/queries";
import { MemoryStore } from "@/lib/store/demoStore";

const now = new Date("2026-10-08T10:30:00Z");
const d = seedDemo(now);

describe("demo seed", () => {
  it("has the record counts the README states", () => {
    expect({ companies: d.companies.length, contacts: d.contacts.length, deals: d.deals.length, signals: d.signals.length, activities: d.activities.length, actions: d.actions.length, runs: d.runs.length }).toEqual({
      companies: 14,
      contacts: 41,
      deals: 17,
      signals: 94,
      activities: 64,
      actions: 23,
      runs: 71,
    });
  });
  it("has open pipeline of $627,500 in 13 deals", () => {
    const open = d.deals.filter((x) => OPEN_STAGES.includes(x.stage));
    expect(open).toHaveLength(13);
    expect(open.reduce((s, x) => s + x.amount_cents, 0)).toBe(62_750_000);
  });
  it("gives every company the score its signals add up to", () => {
    const scores = Object.fromEntries(d.companies.map((c) => [c.name, c.score]));
    expect(scores).toEqual({
      "Brightwell Logistics": 86,
      "Kestrel Cold Chain": 74,
      "Ostrava Freight Group": 68,
      "Halden & Pryce Distribution": 61,
      "Tamarind Grocers Co-op": 57,
      "Northgate Parcel": 49,
      "Selwyn Marine Supply": 44,
      "Ardent Bottling": 38,
      "Fennick Auto Parts": 31,
      "Quillon Pharma Logistics": 27,
      "Marrow Creek Foods": 18,
      "Dunmore Rail Services": 12,
      "Vessel & Vane": 0,
      "Lowmoor Timber": 0,
    });
    for (const c of d.companies) {
      const r = scoreCompany(d.signals.filter((s) => s.company_id === c.id), DEFAULT_WEIGHTS, now);
      expect(r.score).toBe(c.score);
      expect(Object.values(r.breakdown).reduce((a, b) => a + b, 0)).toBe(c.score);
    }
  });
  it("spreads the email states and phones as stated", () => {
    const by = (s: string) => d.contacts.filter((c) => c.email_status === s).length;
    expect([by("verified"), by("risky"), by("invalid"), by("not_found"), by("unchecked")]).toEqual([22, 5, 2, 4, 8]);
    expect(d.contacts.filter((c) => c.phone).length).toBe(17);
    expect(d.contacts.every((c) => !c.email || c.email.endsWith(".example"))).toBe(true);
    expect(d.contacts.every((c) => !c.phone || /555-01\d\d$/.test(c.phone))).toBe(true);
    expect(d.companies.every((c) => c.domain.endsWith(".example"))).toBe(true);
  });
  it("shows the states the demo needs", async () => {
    expect(d.deals.filter((x) => OPEN_STAGES.includes(x.stage) && !x.next_step)).toHaveLength(2);
    const today = await todayData(new MemoryStore(d), {}, now);
    expect(today.due.filter((x) => x.type === "task" && x.dueAt.slice(0, 10) < now.toISOString().slice(0, 10))).toHaveLength(3);
    expect(today.openValueCents).toBe(62_750_000);
    expect(today.openDeals).toBe(13);
    const lowmoor = d.companies.find((c) => c.name === "Lowmoor Timber")!;
    expect(lowmoor.intent_checked_at).toBeNull();
    expect(d.signals.filter((s) => s.company_id === "co-vessel")).toHaveLength(0);
    expect(d.signal_baselines.filter((b) => b.company_id === "co-vessel").length).toBeGreaterThan(0);
    expect(d.runs.some((r) => r.target_id === "co-ardent" && r.outcome === "failed" && r.error === "Provider timed out.")).toBe(true);
  });
  it("keeps every action at or under its confirmed max, with one stopped at the max", async () => {
    const stopped = d.actions.filter((a) => a.status === "stopped_at_max");
    expect(stopped).toHaveLength(1);
    expect(stopped[0].max_cost_usd).toBe(0.05);
    expect(stopped[0].actual_usd).toBe(0.0462);
    const spend = await spendData(new MemoryStore(d), now);
    expect(spend.overMax).toBe(0);
    expect(spend.spent30).toBeCloseTo(d.actions.reduce((s, a) => s + a.actual_usd, 0), 6);
    for (const a of spend.actions) expect(a.runTotal).toBeCloseTo(a.actual_usd, 6);
  });
  it("uses no real company and no filler text", () => {
    const text = JSON.stringify(d).toLowerCase();
    for (const w of ["lorem", "ipsum", "acme", "john doe", "jane doe"]) expect(text).not.toContain(w);
  });
});
