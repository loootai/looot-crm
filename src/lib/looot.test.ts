import { describe, expect, it, vi } from "vitest";
import { LoootClient, LoootError, costOf, loootFromEnv } from "./looot";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("LoootClient", () => {
  it("runs a job with fallback and a cost cap, then polls until the run ends", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ runId: "r1", status: "running" }, 201))
      .mockResolvedValueOnce(json({ runId: "r1", status: "completed", result: { ok: 1 }, actualCost: "0.001" }));
    const c = new LoootClient({ token: "test-token", baseUrl: "https://api.example.com/", fetch: f, sleep: async () => {} });
    const run = await c.runAndWait("news.search", { query: "Brightwell" }, "k1", 0.02);
    expect(run.status).toBe("completed");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.example.com/v1/runs?wait=30");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toEqual({
      endpointId: "job:news.search",
      input: { query: "Brightwell" },
      idempotencyKey: "k1",
      fallback: { maxAttempts: 3, maxCostUsd: 0.02 },
    });
    expect(f.mock.calls[1][0]).toBe("https://api.example.com/v1/runs/r1");
    expect(costOf(run)).toBe(0.001);
  });

  it("throws LoootError with looot's code on HTTP errors", async () => {
    const f = vi.fn().mockResolvedValue(json({ error: { code: "insufficient_balance", message: "Top up first" } }, 402));
    const c = new LoootClient({ token: "t", fetch: f });
    await expect(c.run("news.search", {}, "k", 0.01)).rejects.toMatchObject({ name: "LoootError", status: 402, code: "insufficient_balance" });
  });

  it("stops polling at the timeout and returns the last state", async () => {
    const f = vi.fn().mockResolvedValue(json({ runId: "r2", status: "queued" }));
    const c = new LoootClient({ token: "t", fetch: f, sleep: async () => {}, pollTimeoutMs: 0 });
    expect((await c.runAndWait("news.search", {}, "k", 0.01)).status).toBe("queued");
  });

  it("needs LOOOT_TOKEN", () => {
    expect(() => loootFromEnv({})).toThrow(LoootError);
  });
});

describe("readBalance", () => {
  it("reads a dollar balance from the shapes it knows and gives null otherwise", async () => {
    const { readBalance } = await import("./looot");
    expect(readBalance({ balanceUsd: "18.42" })).toBe(18.42);
    expect(readBalance({ balance: { availableUsd: 3.5 } })).toBe(3.5);
    expect(readBalance({ credits: 12 })).toBeNull();
    expect(readBalance(null)).toBeNull();
  });
});
