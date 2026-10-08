import { describe, expect, it } from "vitest";
import { ageDays, decayed, DEFAULT_WEIGHTS, KIND_CAPS, scoreBand, scoreCompany } from "./score";
import type { SignalKind } from "./types";

const now = new Date("2026-10-08T12:00:00Z");
const at = (days: number) => new Date(now.getTime() - days * 86_400_000 - 3_600_000).toISOString();
const sig = (kind: SignalKind, days: number, tag: string | null = null) => ({ kind, tag, occurred_at: at(days) });

describe("decay", () => {
  it("halves every 30 days and is zero after 90", () => {
    expect(decayed(30, 0)).toBe(30);
    expect(decayed(30, 30)).toBeCloseTo(15, 6);
    expect(decayed(30, 60)).toBeCloseTo(7.5, 6);
    expect(decayed(30, 90)).toBeCloseTo(3.75, 6);
    expect(decayed(30, 91)).toBe(0);
  });
  it("counts whole days", () => {
    expect(ageDays(at(0), now)).toBe(0);
    expect(ageDays(at(30), now)).toBe(30);
  });
});

describe("scoreCompany", () => {
  it("scores a funding round at 0, 30, 60 and 91 days", () => {
    expect(scoreCompany([sig("funding", 0)], DEFAULT_WEIGHTS, now).score).toBe(30);
    expect(scoreCompany([sig("funding", 30)], DEFAULT_WEIGHTS, now).score).toBe(15);
    expect(scoreCompany([sig("funding", 60)], DEFAULT_WEIGHTS, now).score).toBe(8);
    expect(scoreCompany([sig("funding", 91)], DEFAULT_WEIGHTS, now).score).toBe(0);
  });
  it("caps every kind", () => {
    const many = (kind: SignalKind, tag: string | null = null) => Array.from({ length: 10 }, () => sig(kind, 0, tag));
    expect(scoreCompany(many("funding"), DEFAULT_WEIGHTS, now).breakdown.funding).toBe(KIND_CAPS.funding);
    expect(scoreCompany(many("hiring"), DEFAULT_WEIGHTS, now).breakdown.hiring).toBe(24);
    expect(scoreCompany(many("tech"), DEFAULT_WEIGHTS, now).breakdown.tech).toBe(20);
    expect(scoreCompany(many("news", "launch"), DEFAULT_WEIGHTS, now).breakdown.news).toBe(16);
    expect(scoreCompany(many("site"), DEFAULT_WEIGHTS, now).breakdown.site).toBe(10);
  });
  it("never passes 100 and the breakdown sums to the score", () => {
    const all = (["funding", "hiring", "tech", "news", "site"] as SignalKind[]).flatMap((k) => Array.from({ length: 10 }, () => sig(k, 0, "launch")));
    const r = scoreCompany(all, DEFAULT_WEIGHTS, now);
    expect(r.score).toBe(100);
    expect(Object.values(r.breakdown).reduce((a, b) => a + b, 0)).toBe(r.score);
  });
  it("gives tagged news 6 points and other news 2", () => {
    expect(scoreCompany([sig("news", 0, "funding")], DEFAULT_WEIGHTS, now).score).toBe(6);
    expect(scoreCompany([sig("news", 0, "other")], DEFAULT_WEIGHTS, now).score).toBe(2);
  });
  it("uses the weights it is given", () => {
    expect(scoreCompany([sig("hiring", 0)], { ...DEFAULT_WEIGHTS, hiring: 12 }, now).score).toBe(12);
  });
  it("reports the newest evidence date per kind", () => {
    const r = scoreCompany([sig("hiring", 9), sig("hiring", 2)], DEFAULT_WEIGHTS, now);
    expect(r.newest.hiring).toBe(at(2));
    expect(r.newest.funding).toBeNull();
  });
  it("bands scores at 30 and 60", () => {
    expect([0, 29, 30, 59, 60, 100].map(scoreBand)).toEqual(["low", "low", "mid", "mid", "high", "high"]);
  });
});
