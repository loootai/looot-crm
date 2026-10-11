import { describe, expect, it, vi } from "vitest";
import { seedDemo } from "@/demo/seed";
import { FALLBACK_PRICES } from "./jobs";
import type { LoootRun } from "./looot";
import { reconcileReservations } from "./reservations";
import { executeAction, type ActionRequest, type LoootLike } from "./runner";
import { ActionSchema } from "./schemas";
import { MemoryStore } from "./store/demoStore";

const T0 = new Date("2026-10-08T10:30:00Z");
const plus = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
/** company.enrich is one step with a $0.02 cap, so one action holds $0.02. */
const CAP = 0.02;

/** A store with no spend yet and the given budgets, so each test starts from the same numbers. */
function setup(daily: number, monthly = 50) {
  const store = new MemoryStore(seedDemo(T0));
  store.data.runs = [];
  store.data.actions = [];
  Object.assign(store.data.settings[0], { daily_budget_usd: daily, monthly_budget_usd: monthly });
  return { store, companies: store.data.companies.map((c) => c.id) };
}

class FakeLooot implements LoootLike {
  calls: { key: string; cap: number }[] = [];
  getRun = vi.fn<(id: string) => Promise<LoootRun>>();
  constructor(private readonly answer: (n: number, cap: number) => Partial<LoootRun> | Error, private readonly delayMs = 0) {}
  async runAndWait(_job: string, _input: Record<string, unknown>, key: string, cap: number): Promise<LoootRun> {
    this.calls.push({ key, cap });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const a = this.answer(this.calls.length, cap);
    if (a instanceof Error) throw a;
    return { runId: `run_${this.calls.length}`, status: "completed", result: {}, actualCost: cap, ...a };
  }
}

const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const deps = (store: MemoryStore, looot: LoootLike, now = T0) => ({ store, looot, prices: FALLBACK_PRICES, perActionMaxUsd: 2, now: () => now });
const req = (n: number, targetId: string, over: Partial<ActionRequest> = {}): ActionRequest => ({ actionKey: key(n), kind: "company_enrich", targetIds: [targetId], maxCostUsd: 1, ...over });
const day = (s: MemoryStore, at = T0) => s.budgetStatus(at).then((b) => b.daily);
const pendingAnswer = { status: "running", actualCost: null } as const;

describe("period budget", () => {
  it("two simultaneous actions that together pass the daily budget: exactly one calls looot", async () => {
    const { store, companies } = setup(0.03);
    const looot = new FakeLooot(() => ({}), 5);
    const [a, b] = await Promise.all([executeAction(deps(store, looot), req(1, companies[0])), executeAction(deps(store, looot), req(2, companies[1]))]);
    expect(looot.calls).toHaveLength(1);
    expect([a, b].filter((r) => r.refusal)).toHaveLength(1);
    expect((await day(store)).spentUsd).toBeCloseTo(CAP, 6);
  });

  it("many small actions stop at the budget", async () => {
    const { store, companies } = setup(0.07);
    const looot = new FakeLooot(() => ({}));
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await executeAction(deps(store, looot), req(i + 1, companies[i % companies.length])));
    expect(looot.calls).toHaveLength(3);
    const spent = store.data.runs.reduce((s, r) => s + r.cost_usd, 0);
    expect(spent).toBeCloseTo(0.06, 6);
    expect(spent).toBeLessThanOrEqual(0.07);
    expect(results.filter((r) => r.refusal)).toHaveLength(5);
  });

  it("refuses at the monthly budget and names it", async () => {
    const { store, companies } = setup(5, 0.03);
    const looot = new FakeLooot(() => ({}));
    await executeAction(deps(store, looot), req(1, companies[0]));
    const out = await executeAction(deps(store, looot), req(2, companies[1]));
    expect(looot.calls).toHaveLength(1);
    expect(out.refusal).toMatch(/^The monthly budget of \$0\.03 cannot cover this run/);
    expect(out.runs[0]).toMatchObject({ outcome: "skipped" });
    expect(out.action.status).toBe("stopped_at_max");
  });

  it("the refusal says used, held and left", async () => {
    const { store, companies } = setup(0.03);
    const looot = new FakeLooot(() => pendingAnswer);
    await executeAction(deps(store, looot), req(1, companies[0]));
    const out = await executeAction(deps(store, looot), req(2, companies[1]));
    expect(out.refusal).toContain("daily budget of $0.03");
    expect(out.refusal).toContain("$0.0200 held for runs in progress");
    expect(out.refusal).toContain("No call was made");
  });

  it("a pending run keeps its reservation and is not recorded as failed at $0", async () => {
    const { store, companies } = setup(0.03);
    const looot = new FakeLooot(() => pendingAnswer);
    const out = await executeAction(deps(store, looot), req(1, companies[0]));
    expect(out.runs[0]).toMatchObject({ status: "running", cost_usd: 0, looot_run_id: "run_1" });
    expect(out.runs[0].outcome).not.toBe("failed");
    expect(await day(store)).toMatchObject({ reservedUsd: CAP, spentUsd: 0 });
    // Budget is not handed back early: the next action is refused and makes no call.
    const next = await executeAction(deps(store, looot, plus(1)), req(2, companies[1]));
    expect(next.refusal).toBeTruthy();
    expect(looot.calls).toHaveLength(1);
  });

  it("a failed run releases its reservation", async () => {
    const { store, companies } = setup(0.03);
    const looot = new FakeLooot(() => ({ status: "failed", actualCost: 0, error: { message: "upstream 500" } }));
    await executeAction(deps(store, looot), req(1, companies[0]));
    expect(await day(store)).toMatchObject({ reservedUsd: 0, spentUsd: 0 });
  });

  it("a request looot refused releases its reservation, an unanswered one keeps it", async () => {
    const { store, companies } = setup(0.05);
    const refused = Object.assign(new Error("bad input"), { status: 422, code: "invalid_input", name: "LoootError" });
    const { LoootError } = await import("./looot");
    await executeAction(deps(store, new FakeLooot(() => new LoootError("bad input", 422, "invalid_input"))), req(1, companies[0]));
    expect(refused).toBeTruthy();
    expect(await day(store)).toMatchObject({ reservedUsd: 0 });
    await executeAction(deps(store, new FakeLooot(() => new TypeError("fetch failed"))), req(2, companies[1]));
    expect(await day(store)).toMatchObject({ reservedUsd: CAP });
  });

  it("a completed run settles to the real cost", async () => {
    const { store, companies } = setup(0.03);
    await executeAction(deps(store, new FakeLooot(() => ({ actualCost: 0.0019 }))), req(1, companies[0]));
    expect(await day(store)).toMatchObject({ reservedUsd: 0, spentUsd: 0.0019 });
  });

  it("a late completion settles to the real cost when the reservation is reconciled", async () => {
    const { store, companies } = setup(0.03);
    const looot = new FakeLooot(() => pendingAnswer);
    const out = await executeAction(deps(store, looot), req(1, companies[0]));
    looot.getRun.mockResolvedValue({ runId: "run_1", status: "completed", actualCost: 0.0016 });
    await reconcileReservations({ store, looot, now: plus(5) });
    expect(looot.getRun).not.toHaveBeenCalled();
    expect((await day(store, plus(5))).reservedUsd).toBe(CAP);
    await reconcileReservations({ store, looot, now: plus(20) });
    expect(looot.getRun).toHaveBeenCalledWith("run_1");
    expect(await day(store, plus(20))).toMatchObject({ reservedUsd: 0, spentUsd: 0.0016 });
    const run = store.data.runs.find((r) => r.id === out.runs[0].id)!;
    expect(run).toMatchObject({ status: "completed", cost_usd: 0.0016 });
    expect(store.data.actions[0].actual_usd).toBeCloseTo(0.0016, 6);
  });

  it("an expired reservation whose run failed is released", async () => {
    const { store, companies } = setup(0.03);
    const looot = new FakeLooot(() => pendingAnswer);
    await executeAction(deps(store, looot), req(1, companies[0]));
    looot.getRun.mockResolvedValue({ runId: "run_1", status: "failed", error: { message: "gave up" } });
    await reconcileReservations({ store, looot, now: plus(20) });
    expect(await day(store, plus(20))).toMatchObject({ reservedUsd: 0, spentUsd: 0 });
    expect(store.data.runs[0]).toMatchObject({ status: "failed", outcome: "failed", cost_usd: 0 });
  });

  it("an expired reservation whose run is still pending, or cannot be fetched, stays reserved until the hard expiry", async () => {
    const { store, companies } = setup(0.05);
    const looot = new FakeLooot(() => pendingAnswer);
    await executeAction(deps(store, looot), req(1, companies[0]));
    looot.getRun.mockResolvedValue({ runId: "run_1", status: "running" });
    await reconcileReservations({ store, looot, now: plus(120) });
    expect((await day(store, plus(120))).reservedUsd).toBe(CAP);
    looot.getRun.mockRejectedValue(new Error("HTTP 503"));
    await reconcileReservations({ store, looot, now: plus(600) });
    expect((await day(store, plus(600))).reservedUsd).toBe(CAP);
    await reconcileReservations({ store, looot, now: plus(25 * 60) });
    expect((await day(store, plus(25 * 60))).reservedUsd).toBe(0);
  });

  it("a crash after the reserve and before the call is held until the hard expiry", async () => {
    const { store, companies } = setup(0.03);
    const [a] = await store.insert("actions", [{ action_key: key(9), kind: "company_enrich", max_cost_usd: 1 }]);
    const held = await store.reserveBudget({ actionId: a.id, key: "crm:crash", jobId: "company.enrich", amountUsd: CAP, now: T0 });
    expect(held.ok).toBe(true);
    const getRun = vi.fn();
    await reconcileReservations({ store, looot: { getRun }, now: plus(120) });
    expect(getRun).not.toHaveBeenCalled();
    expect((await day(store, plus(120))).reservedUsd).toBe(CAP);
    await reconcileReservations({ store, looot: { getRun }, now: plus(25 * 60) });
    expect((await day(store, plus(25 * 60))).reservedUsd).toBe(0);
    expect(companies.length).toBeGreaterThan(0);
  });

  it("the caller cannot raise the budget", async () => {
    const { store, companies } = setup(0.01);
    const parsed = ActionSchema.parse({ actionKey: key(1), kind: "company_enrich", targetIds: [companies[0]], maxCostUsd: 1, daily_budget_usd: 1000, dailyBudgetUsd: 1000, monthly_budget_usd: 1000 });
    expect(Object.keys(parsed)).not.toContain("daily_budget_usd");
    expect(Object.keys(parsed)).not.toContain("dailyBudgetUsd");
    const looot = new FakeLooot(() => ({}));
    const sneaky = { ...parsed, daily_budget_usd: 1000, dailyBudgetUsd: 1000, budget: { dailyUsd: 1000 } } as ActionRequest;
    const out = await executeAction(deps(store, looot), sneaky);
    expect(looot.calls).toHaveLength(0);
    expect(out.refusal).toBeTruthy();
    expect(store.data.settings[0]).toMatchObject({ daily_budget_usd: 0.01, monthly_budget_usd: 50 });
  });

  it("a repeated identical request is not charged twice", async () => {
    const { store, companies } = setup(0.03);
    const looot = new FakeLooot(() => ({}));
    const first = await executeAction(deps(store, looot), req(1, companies[0]));
    const again = await executeAction(deps(store, looot), req(1, companies[0]));
    expect(again.replayed).toBe(true);
    expect(again.action.id).toBe(first.action.id);
    expect(looot.calls).toHaveLength(1);
    expect((await day(store)).spentUsd).toBeCloseTo(CAP, 6);
  });

  it("the same looot call key cannot be reserved twice", async () => {
    const { store } = setup(1);
    const [a] = await store.insert("actions", [{ action_key: key(9), kind: "company_enrich", max_cost_usd: 1 }]);
    const r = { actionId: a.id, key: "crm:same", jobId: "company.enrich", amountUsd: 0.01, now: T0 };
    expect((await store.reserveBudget(r)).ok).toBe(true);
    expect(await store.reserveBudget(r)).toEqual({ ok: false, reason: "duplicate" });
  });
});
