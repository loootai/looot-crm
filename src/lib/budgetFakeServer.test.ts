/**
 * The budget against a real HTTP server standing in for looot. The client is built the way the app
 * builds it, from LOOOT_TOKEN and LOOOT_API_URL, so the only fake is the server on a local port.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemo } from "@/demo/seed";
import { FALLBACK_PRICES } from "./jobs";
import { loootFromEnv } from "./looot";
import { executeAction } from "./runner";
import { MemoryStore } from "./store/demoStore";

const T0 = new Date("2026-10-08T10:30:00Z");
let server: Server;
let url = "";
const seen: { path: string; key: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const key = body ? (JSON.parse(body) as { idempotencyKey?: string }).idempotencyKey ?? "" : "";
      seen.push({ path: `${req.method} ${req.url}`, key });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ runId: `fake_${seen.length}`, status: "completed", result: {}, actualCost: 0.02 }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("budget against a fake looot server", () => {
  it("makes the HTTP call while the budget fits and refuses with a message once it does not", async () => {
    const looot = loootFromEnv({ LOOOT_TOKEN: "fake-token-for-test", LOOOT_API_URL: url });
    const store = new MemoryStore(seedDemo(T0));
    store.data.runs = [];
    store.data.actions = [];
    Object.assign(store.data.settings[0], { daily_budget_usd: 0.05 });
    const ids = store.data.companies.map((c) => c.id);
    const out = [];
    for (let i = 0; i < 4; i++) out.push(await executeAction({ store, looot, prices: FALLBACK_PRICES, perActionMaxUsd: 2, now: () => T0 }, { actionKey: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, kind: "company_enrich", targetIds: [ids[i]], maxCostUsd: 1 }));
    console.log("requests that reached the fake server:", seen.length);
    console.log("refusal shown to the user:", out[2].refusal);
    expect(seen.filter((s) => s.path.startsWith("POST /v1/runs"))).toHaveLength(2);
    expect(out.map((o) => Boolean(o.refusal))).toEqual([false, false, true, true]);
    expect(out[2].refusal).toBe("The daily budget of $0.05 cannot cover this run ($0.0200): $0.0400 spent, $0.0000 held for runs in progress, $0.0100 left. No call was made. Change the budget in Settings.");
  });
});
