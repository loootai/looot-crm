import { describe, expect, it } from "vitest";
import { DemoLooot } from "@/demo/demoLooot";
import { seedDemo } from "@/demo/seed";
import { FALLBACK_PRICES } from "./jobs";
import { LoootError, type LoootRun } from "./looot";
import { personRows } from "./queries";
import { clampMax, executeAction, type ActionRequest, type LoootLike } from "./runner";
import { MemoryStore } from "./store/demoStore";

const NOW = new Date("2026-10-08T10:30:00Z");
const fresh = () => new MemoryStore(seedDemo(NOW));

/** A looot that records every call and answers with a fixed body per job. */
class FakeLooot implements LoootLike {
  calls: { jobId: string; input: Record<string, unknown>; key: string; cap: number }[] = [];
  constructor(private readonly answer: (jobId: string, cap: number, input: Record<string, unknown>) => Partial<LoootRun> | Error) {}
  async runAndWait(jobId: string, input: Record<string, unknown>, key: string, cap: number): Promise<LoootRun> {
    this.calls.push({ jobId, input, key, cap });
    const a = this.answer(jobId, cap, input);
    if (a instanceof Error) throw a;
    return { runId: `r${this.calls.length}`, status: "completed", ...a };
  }
}

const BODY: Record<string, unknown> = {
  "people.email.find": { email: "found@brightwell-logistics.example" },
  "people.email.verify": { status: "valid" },
  "people.phone.find": { phone: "+1 (614) 555-0199" },
};
/** Charges every run its full cap, the worst a provider route can do. */
const greedy = () => new FakeLooot((job, cap) => ({ result: BODY[job] ?? {}, actualCost: cap }));
const deps = (store: MemoryStore, looot: LoootLike) => ({ store, looot, prices: FALLBACK_PRICES, perActionMaxUsd: 2, now: () => NOW });
const req = (over: Partial<ActionRequest>): ActionRequest => ({ actionKey: "3f0c8f0e-4a43-4f0e-9d7a-1b2c3d4e5f60", kind: "contact_enrich", targetIds: [], maxCostUsd: 0.1, ...over });
const NO_EMAIL = ["p-noor-al-sayed", "p-arjun-subramanian", "p-sunita-dhillon"];

describe("max-cost guard", () => {
  it("stops a 3-contact enrich at the confirmed max when every run charges its full cap", async () => {
    const store = fresh();
    const looot = greedy();
    const out = await executeAction(deps(store, looot), req({ targetIds: NO_EMAIL, maxCostUsd: 0.05 }));
    expect(out.action.status).toBe("stopped_at_max");
    expect(out.action.actual_usd).toBeLessThanOrEqual(0.05);
    expect(out.action.max_cost_usd).toBe(0.05);
    expect(out.runs).toHaveLength(9);
    // email at $0.03, verify at $0.01, then $0.01 is left and the phone step needs $0.0264.
    expect(looot.calls.map((c) => [c.jobId, c.cap])).toEqual([["people.email.find", 0.03], ["people.email.verify", 0.01]]);
    expect(out.runs.filter((r) => r.outcome === "skipped")).toHaveLength(7);
    expect(out.runs.reduce((s, r) => s + r.cost_usd, 0)).toBeCloseTo(0.04, 6);
    expect(out.runs[2].note).toBe("Left of the max: $0.0100. This step needs $0.0264.");
  });
  it("lowers the cap of a run to what is left of the max", async () => {
    const store = fresh();
    const looot = new FakeLooot((job) => ({ result: BODY[job], actualCost: job === "people.email.find" ? 0.019 : 0.0015 }));
    const out = await executeAction(deps(store, looot), req({ targetIds: ["p-noor-al-sayed"], maxCostUsd: 0.05 }));
    // 0.05 - 0.019 - 0.0015 = 0.0295 left, which is above the phone quote and below its $0.06 cap.
    expect(looot.calls[2]).toMatchObject({ jobId: "people.phone.find", cap: 0.0295 });
    expect(out.action.status).toBe("done");
    expect(out.action.actual_usd).toBeCloseTo(0.022, 6);
  });
  it("holds the cap of a run that has not ended, so a late charge cannot push the action past its max", async () => {
    const store = fresh();
    // The email run is still running when the poll deadline passes. looot may yet charge up to its $0.03 cap.
    const looot = new FakeLooot((job) => (job === "people.email.find" ? { status: "running", actualCost: null } : { result: BODY[job], actualCost: 0.0264 }));
    const out = await executeAction(deps(store, looot), req({ targetIds: ["p-noor-al-sayed"], maxCostUsd: 0.05 }));
    // 0.05 - 0.03 held = 0.02 left, below the phone quote of $0.0264, so the phone step must not run.
    expect(looot.calls.map((c) => c.jobId)).toEqual(["people.email.find"]);
    expect(out.action.status).toBe("stopped_at_max");
    expect(out.runs[0]).toMatchObject({ outcome: "failed", status: "running", cost_usd: 0 });
    expect(out.runs[0].error).toContain("$0.0300 of the max is held");
    expect(out.runs[2].note).toBe("Left of the max: $0.0200. This step needs $0.0264.");
  });
  it("holds the cap when the request to looot fails without an answer, and not when looot refuses it", async () => {
    const lost = new FakeLooot((job) => (job === "people.email.find" ? new TypeError("fetch failed") : { result: BODY[job], actualCost: 0.0264 }));
    const a = await executeAction(deps(fresh(), lost), req({ targetIds: ["p-noor-al-sayed"], maxCostUsd: 0.05 }));
    expect(lost.calls.map((c) => c.jobId)).toEqual(["people.email.find"]);
    expect(a.action.status).toBe("stopped_at_max");
    const refused = new FakeLooot((job) => (job === "people.email.find" ? new LoootError("input is not valid", 422, "invalid_input") : { result: BODY[job], actualCost: 0.0264 }));
    const b = await executeAction(deps(fresh(), refused), req({ actionKey: "7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d", targetIds: ["p-noor-al-sayed"], maxCostUsd: 0.05 }));
    expect(refused.calls.map((c) => [c.jobId, c.cap])).toEqual([["people.email.find", 0.03], ["people.phone.find", 0.05]]);
    expect(b.action.actual_usd).toBeCloseTo(0.0264, 6);
  });
  it("clamps the typed max to the env limit and to the ceiling in Settings", async () => {
    expect(clampMax(50, 2, null)).toBe(2);
    expect(clampMax(50, 2, 0.5)).toBe(0.5);
    expect(clampMax(0.1, 2, 0.5)).toBe(0.1);
    const store = fresh();
    store.data.settings[0].action_ceiling_usd = 0.04;
    const out = await executeAction(deps(store, greedy()), req({ targetIds: ["p-noor-al-sayed"], maxCostUsd: 0.1 }));
    expect(out.action.max_cost_usd).toBe(0.04);
    expect(out.action.actual_usd).toBeLessThanOrEqual(0.04);
  });
  it("refuses to store an action above its max, like the check constraint in the migration", async () => {
    const store = fresh();
    const [a] = await store.insert("actions", [{ action_key: "k", kind: "intent_refresh", max_cost_usd: 0.05, actual_usd: 0 }]);
    await expect(store.update("actions", a.id, { actual_usd: 0.06 })).rejects.toThrow("actions_actual_within_max");
  });
});

describe("idempotency", () => {
  it("returns the stored action for a repeated actionKey and calls looot once per key", async () => {
    const store = fresh();
    const looot = greedy();
    const r = req({ targetIds: ["p-noor-al-sayed"] });
    const first = await executeAction(deps(store, looot), r);
    const second = await executeAction(deps(store, looot), r);
    expect(second.replayed).toBe(true);
    expect(second.action.id).toBe(first.action.id);
    expect(looot.calls).toHaveLength(3);
    expect(new Set(looot.calls.map((c) => c.key)).size).toBe(3);
    expect(looot.calls[0].key).toBe(`crm:${r.actionKey}:people.email.find:p-noor-al-sayed`);
    expect(store.data.actions.filter((a) => a.action_key === r.actionKey)).toHaveLength(1);
  });
});

describe("contact enrichment", () => {
  it("writes the email, its status and the phone, and logs an enrichment activity", async () => {
    const store = fresh();
    const out = await executeAction(deps(store, new FakeLooot((job) => ({ result: BODY[job], actualCost: FALLBACK_PRICES[job as keyof typeof FALLBACK_PRICES] }))), req({ targetIds: ["p-noor-al-sayed"] }));
    const noor = store.data.contacts.find((c) => c.id === "p-noor-al-sayed")!;
    expect(noor).toMatchObject({ email: "found@brightwell-logistics.example", email_status: "verified", phone: "+1 (614) 555-0199" });
    expect(out.action.status).toBe("done");
    expect(out.action.actual_usd).toBe(0.04685);
    expect(store.data.activities.at(-1)).toMatchObject({ kind: "enrichment", contact_id: "p-noor-al-sayed", body: "Noor Al-Sayed: email found, email verified, phone found. $0.0469." });
  });
  it("does not pay for verification when no email was found", async () => {
    const store = fresh();
    const looot = new FakeLooot((job) => ({ result: job === "people.email.find" ? { email: null } : BODY[job], actualCost: 0 }));
    const out = await executeAction(deps(store, looot), req({ targetIds: ["p-noor-al-sayed"] }));
    expect(looot.calls.map((c) => c.jobId)).toEqual(["people.email.find", "people.phone.find"]);
    expect(out.runs.find((r) => r.job_id === "people.email.verify")).toMatchObject({ outcome: "skipped", note: "No email to verify" });
    expect(store.data.contacts.find((c) => c.id === "p-noor-al-sayed")!.email_status).toBe("not_found");
    expect(out.action.status).toBe("partial");
  });
});

describe("failures cost nothing", () => {
  it("records a failed run at $0 and keeps going", async () => {
    const store = fresh();
    const looot = new FakeLooot((job) => (job === "company.technographics" ? { status: "failed", actualCost: 0, error: { message: "Provider timed out." } } : { result: {}, actualCost: 0.001 }));
    const out = await executeAction(deps(store, looot), req({ kind: "intent_refresh", targetIds: ["co-lowmoor"], maxCostUsd: 0.13 }));
    const tech = out.runs.find((r) => r.job_id === "company.technographics")!;
    expect(tech).toMatchObject({ outcome: "failed", cost_usd: 0, error: "Provider timed out." });
    expect(looot.calls).toHaveLength(6);
    expect(out.action.status).toBe("partial");
  });
  it("stops at a blocked run with the balance message and runs nothing after it", async () => {
    const store = fresh();
    const looot = new FakeLooot(() => ({ status: "blocked", actualCost: 0 }));
    const out = await executeAction(deps(store, looot), req({ kind: "intent_refresh", targetIds: ["co-lowmoor"], maxCostUsd: 0.13 }));
    expect(looot.calls).toHaveLength(1);
    expect(out.runs[0].error).toBe("Balance too low. Top up at looot.ai");
    expect(out.action).toMatchObject({ status: "failed", actual_usd: 0 });
  });
  it("names the missing token", async () => {
    const store = fresh();
    const looot = new FakeLooot(() => new LoootError("LOOOT_TOKEN is not set on the server", 500, "missing_token"));
    const out = await executeAction(deps(store, looot), req({ targetIds: ["p-noor-al-sayed"] }));
    expect(out.runs[0].error).toBe("LOOOT_TOKEN is not set on the server. Add it to .env.local");
    expect(looot.calls).toHaveLength(1);
  });
});

describe("intent refresh", () => {
  it("saves baselines on a first check, makes signals from results, and rescores", async () => {
    const store = fresh();
    const looot = new FakeLooot((job, _cap, input) => {
      if (job === "jobs.search") return { result: { jobs: [{ title: "Logistics Planner", company_name: "Lowmoor Timber", job_url: "https://lowmoortimber.example/careers/1", date_posted: NOW.toISOString() }, { title: "Accountant", company_name: "Lowmoor Timber", job_url: "https://lowmoortimber.example/careers/2" }] }, actualCost: 0.00145 };
      if (job === "news.search") return { result: { news: [{ title: "Lowmoor Timber raises $20M Series A", link: "https://news.example/a", date: NOW.toISOString(), source: "Timber Trade" }, { title: "Unrelated company opens a mill", link: "https://news.example/b" }] }, actualCost: 0.00099 };
      if (job === "company.technographics") return { result: { technologies: [{ name: "Sage 300" }, { name: "Microsoft 365" }] }, actualCost: 0.01 };
      if (job === "company.funding") return { result: { funding_rounds: [{ type: "Series A", amount: 20_000_000, announced_on: NOW.toISOString(), investors: [{ name: "Cascade Fund" }] }] }, actualCost: 0.01 };
      return { result: { markdown: `Page ${input.url}\nRequest a quote` }, actualCost: 0.001 };
    });
    const out = await executeAction(deps(store, looot), req({ kind: "intent_refresh", targetIds: ["co-lowmoor"], maxCostUsd: 0.13 }));
    const signals = store.data.signals.filter((s) => s.company_id === "co-lowmoor");
    expect(signals.map((s) => [s.kind, s.title, s.tag])).toEqual([
      ["hiring", "Logistics Planner", null],
      ["news", "Lowmoor Timber raises $20M Series A", "funding"],
      ["funding", "Series A, $20M", null],
    ]);
    expect(store.data.signal_baselines.filter((b) => b.company_id === "co-lowmoor").map((b) => b.kind).sort()).toEqual(["site", "site", "tech"]);
    const lowmoor = store.data.companies.find((c) => c.id === "co-lowmoor")!;
    expect(lowmoor.score).toBe(30 + 8 + 6);
    expect(lowmoor.tech).toEqual(["Microsoft 365", "Sage 300"]);
    expect(lowmoor.intent_checked_at).toBe(NOW.toISOString());
    expect(store.data.score_history.at(-1)).toMatchObject({ company_id: "co-lowmoor", score: 44 });
    expect(out.action).toMatchObject({ status: "done", actual_usd: 0.02444 });
  });
  it("finds tech and page changes against the baseline on the next check", async () => {
    const store = fresh();
    const before = store.data.signals.length;
    const looot = new FakeLooot((job) =>
      job === "company.technographics"
        ? { result: { technologies: ["Shopify", "ShipBob", "Klaviyo", "Opendock"] }, actualCost: 0.01 }
        : { result: { markdown: "Vessel & Vane\nOpen roles\nDock Scheduling Coordinator" }, actualCost: 0.001 },
    );
    await executeAction(deps(store, looot), req({ kind: "intent_refresh", targetIds: ["co-vessel"], steps: ["tech", "site"], maxCostUsd: 0.03 }));
    const added = store.data.signals.slice(before);
    expect(added.map((s) => s.title).sort()).toEqual(["Added Opendock", "Careers page changed", "Pricing page changed", "Removed Gorgias"].sort());
    const careers = added.find((s) => s.title === "Careers page changed")!;
    expect(JSON.parse(careers.detail!)).toMatchObject({ page: "/careers", added: ["Dock Scheduling Coordinator"] });
    expect(store.data.companies.find((c) => c.id === "co-vessel")!.score).toBe(20 + 10);
  });
  it("does not make the same signal twice", async () => {
    const store = fresh();
    const news = () => new FakeLooot(() => ({ result: { news: [{ title: "Lowmoor Timber launches a new kiln line", link: "https://news.example/k" }] }, actualCost: 0.00099 }));
    await executeAction(deps(store, news()), req({ kind: "intent_refresh", targetIds: ["co-lowmoor"], steps: ["news"], maxCostUsd: 0.01 }));
    await executeAction(deps(store, news()), req({ actionKey: "9a1b2c3d-0000-4000-8000-000000000002", kind: "intent_refresh", targetIds: ["co-lowmoor"], steps: ["news"], maxCostUsd: 0.01 }));
    expect(store.data.signals.filter((s) => s.company_id === "co-lowmoor")).toHaveLength(1);
  });
});

describe("find more people", () => {
  it("returns candidates filtered by title keywords, flags people already in the CRM, saves nothing", async () => {
    const store = fresh();
    const people = [
      { first_name: "Marcus", last_name: "Lindqvist", title: "Director of Transportation Operations" },
      { first_name: "Ngozi", last_name: "Adeyemi", title: "Operations Manager" },
      { first_name: "Rosalind", last_name: "Pike", title: "Chief of Staff" },
    ];
    const before = store.data.contacts.length;
    const out = await executeAction(deps(store, new FakeLooot(() => ({ result: { data: { people } }, actualCost: 0.00108 }))), req({ kind: "find_people", targetIds: ["p-adaeze-okonkwo"], maxCostUsd: 0.02, options: { keywords: ["operations"], limit: 10 } }));
    expect(out.candidates?.map((c) => [c.name, c.already])).toEqual([["Marcus Lindqvist", true], ["Ngozi Adeyemi", false]]);
    expect(out.runs[0].note).toBe("2 of 3 matched your keywords");
    expect(store.data.contacts).toHaveLength(before);
  });
});

describe("demo looot", () => {
  it("runs a full refresh and a contact enrich with no network, through the same readers", async () => {
    const store = fresh();
    const looot = new DemoLooot(store, async () => {});
    const refresh = await executeAction(deps(store, looot), req({ kind: "intent_refresh", targetIds: ["co-lowmoor"], maxCostUsd: 0.13 }));
    expect(refresh.runs).toHaveLength(6);
    expect(refresh.action.actual_usd).toBeLessThanOrEqual(0.13);
    expect(refresh.runs.every((r) => r.outcome === "data" || r.outcome === "no_result")).toBe(true);
    const enrich = await executeAction(deps(store, looot), req({ actionKey: "9a1b2c3d-0000-4000-8000-000000000003", targetIds: ["p-greta-lindahl"] }));
    expect(enrich.action.estimate_usd).toBe(0.04685);
    expect(enrich.action.actual_usd).toBeLessThanOrEqual(0.1);
    expect(new Set(looot.keys).size).toBe(looot.keys.length);
  });
});

describe("where an email came from", () => {
  it("marks an email looot found on an imported contact as found by looot, not as part of the CSV", async () => {
    const store = fresh();
    const before = (await personRows(store)).find((p) => p.id === "p-noor-al-sayed")!;
    expect(before.source).not.toBe("looot");
    expect(before.emailFoundAt).toBeNull();
    await executeAction(deps(store, new FakeLooot((job) => ({ result: BODY[job], actualCost: 0.001 }))), req({ targetIds: ["p-noor-al-sayed"] }));
    const after = (await personRows(store)).find((p) => p.id === "p-noor-al-sayed")!;
    expect(after.email).toBe("found@brightwell-logistics.example");
    expect(after.source).not.toBe("looot");
    expect(after.emailFoundAt).not.toBeNull();
  });
});

describe("the in-memory store", () => {
  it("hands out copies like a database does, so a row read before an update keeps its old values", async () => {
    const store = fresh();
    const before = (await store.get("deals", "d-selwyn"))!;
    const listed = (await store.all("deals", { stage: "lead" })).find((d) => d.id === "d-selwyn")!;
    await store.update("deals", "d-selwyn", { stage: "qualified" });
    expect(before.stage).toBe("lead");
    expect(listed.stage).toBe("lead");
    expect((await store.get("deals", "d-selwyn"))!.stage).toBe("qualified");
  });
});
