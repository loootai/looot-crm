import { describe, expect, it } from "vitest";
import { cleanDomain, dueLabel, initials, money, relative, usd2, usd4, usdCap } from "./format";

describe("format", () => {
  it("rounds prices half up", () => {
    expect(usd4(0.019 + 0.00145 + 0.0264)).toBe("$0.0469");
    expect(usd4(0.02544)).toBe("$0.0254");
    expect(usd2(0.1)).toBe("$0.10");
    expect(usd4(null)).toBe("$0.0000");
  });
  it("never shows a cap rounded up", () => {
    expect(usdCap(0.005)).toBe("$0.005");
    expect(usdCap(0.02)).toBe("$0.02");
    expect(usdCap(0.1)).toBe("$0.10");
    expect(usdCap(0.13)).toBe("$0.13");
    expect(usdCap(0.0295)).toBe("$0.0295");
    expect(usdCap(2)).toBe("$2.00");
  });
  it("formats deal money from cents", () => {
    expect(money(62_750_000)).toBe("$627,500");
  });
  it("cleans a typed domain and refuses a non-host", () => {
    expect(cleanDomain("https://www.Brightwell-Logistics.example/about?x=1")).toBe("brightwell-logistics.example");
    expect(cleanDomain("not a domain")).toBeNull();
    expect(cleanDomain("localhost")).toBeNull();
  });
  it("labels due dates", () => {
    const now = new Date("2026-10-08T09:00:00Z");
    expect(dueLabel("2026-10-08", now)).toEqual({ text: "today", overdue: false });
    expect(dueLabel("2026-10-05", now)).toEqual({ text: "3 days overdue", overdue: true });
    expect(dueLabel("2026-10-12", now).text).toBe("in 4 days");
  });
  it("writes relative times", () => {
    const now = new Date("2026-10-08T09:00:00Z");
    expect(relative("2026-10-06T08:00:00Z", now)).toBe("2 days ago");
    expect(relative(null, now)).toBe("never");
  });
  it("makes initials", () => {
    expect(initials("Adaeze Okonkwo")).toBe("AO");
  });
});
