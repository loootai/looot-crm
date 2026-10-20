import { describe, expect, it } from "vitest";
import { FALLBACK_PRICES } from "../jobs";
import type { LoootRun } from "../looot";
import { createPipelineRows } from "../pipelines";
import { MemoryStore } from "../store/demoStore";
import { cronConfig, DEFAULT_HIRING_KEYWORDS, DEFAULT_NEWS_KEYWORDS, list, runAllowance, weekOf, weekSpend } from "./config";
import { domainOf, newLeads, parseLeads, PROSPECT_ENDPOINT, PROSPECT_HOLD_USD, rankLeads, runProspects } from "./prospects";
import { ownerOf, runSignalSweep, watchedCards } from "./signals";
import { mentions, openerFor, prospectsMessage, signalsMessage } from "./slack";

// The memory store stamps rows with the real clock, so the tests run "now" too.
const NOW = new Date();
const STAGES = [
  { key: "prospect", label: "Prospect", kind: "open" as const },
  { key: "contacted", label: "Contacted", kind: "open" as const },
  { key: "committed", label: "Committed", kind: "won" as const },
  { key: "declined", label: "Declined", kind: "lost" as const },
];

/** A workspace with a Sales and a Partnerships board. Harborline is on both; Calder Ridge has a closed card. */
async function workspace() {
  const store = new MemoryStore();
  const po = (await createPipelineRows(store, { name: "Sales", subject: "company", trackAmount: true, currency: "EUR", stages: STAGES, position: 500 }))!;
  const sp = (await createPipelineRows(store, { name: "Partnerships", subject: "company", trackAmount: true, currency: "EUR", stages: STAGES, position: 3000 }))!;
  const [harbor, calder, lowmoor] = await store.insert("companies", [
    { name: "Harborline", domain: "harborline.example" },
    { name: "Calder Ridge", domain: "calderridge.example" },
    { name: "Lowmoor Timber", domain: "lowmoor.example" },
  ]);
  await store.insert("deals", [
    { pipeline_id: po.id, company_id: harbor.id, name: "Harborline", stage: "contacted", currency: "EUR", next_step: "Maya Okafor: follow up with Tomas", position: 1 },
    { pipeline_id: sp.id, company_id: harbor.id, name: "Harborline", stage: "prospect", currency: "EUR", next_step: null, position: 2 },
    { pipeline_id: po.id, company_id: calder.id, name: "Calder Ridge", stage: "declined", currency: "EUR", next_step: null, position: 3 },
    { pipeline_id: sp.id, company_id: lowmoor.id, name: "Lowmoor Timber", stage: "contacted", currency: "EUR", next_step: "Next: email Priya", position: 4 },
  ]);
  return { store, po, sp, harbor, calder, lowmoor };
}

/** A looot that records calls and answers per job. */
class FakeLooot {
  calls: { id: string; input: Record<string, unknown>; key: string; cap?: number }[] = [];
  constructor(
    private readonly answer: (id: string, input: Record<string, unknown>) => Partial<LoootRun>,
    private readonly bal: number | null = 10,
  ) {}
  async runAndWait(jobId: string, input: Record<string, unknown>, key: string, cap: number): Promise<LoootRun> {
    this.calls.push({ id: jobId, input, key, cap });
    return { runId: `r${this.calls.length}`, status: "completed", ...this.answer(jobId, input) };
  }
  async runEndpoint(endpointId: string, input: Record<string, unknown>, key: string): Promise<LoootRun> {
    this.calls.push({ id: endpointId, input, key });
    return { runId: `r${this.calls.length}`, status: "completed", ...this.answer(endpointId, input) };
  }
  async balance() {
    return this.bal;
  }
}

const news = (title: string, url: string) => ({ result: { items: 1, output: { data: { items: [{ title, url, source: "Daily", createdUtc: Math.floor(NOW.getTime() / 1000) }] } } } });
/** The test workspace watches both boards for news and Sales for hiring and prospects. */
const ENV = { CRON_SIGNAL_BOARDS: "Sales, Partnerships", CRON_PROSPECT_COUNTRY: "NL" };
const deps = (store: MemoryStore, looot: FakeLooot, env: Record<string, string> = {}) => ({ store, looot, prices: FALLBACK_PRICES, perActionMaxUsd: 2, config: cronConfig({ ...ENV, ...env }), now: NOW });

describe("cron config and caps", () => {
  it("has safe defaults and reads the environment", () => {
    expect(cronConfig({})).toMatchObject({ prospectReviewer: "Team", runCapUsd: 0.5, weekCapUsd: 1.5, signalBoards: ["Sales"], hiringBoards: ["Sales"], prospectBoard: "Sales", prospectsPerRun: 10, prospectCountry: "", prospectIndustries: [], prospectCardName: "Prospect", newsKeywords: DEFAULT_NEWS_KEYWORDS, hiringKeywords: DEFAULT_HIRING_KEYWORDS, openerPitch: "", openerSuffix: "" });
    expect(cronConfig({ CRON_WEEK_CAP_USD: "3", CRON_SIGNAL_BOARDS: "A, B", CRON_PROSPECTS_PER_RUN: "500" })).toMatchObject({ weekCapUsd: 3, signalBoards: ["A", "B"], prospectsPerRun: 25 });
    expect(cronConfig({ CRON_RUN_CAP_USD: "-1" }).runCapUsd).toBe(0.5);
    expect(cronConfig({ CRON_PROSPECT_COUNTRY: "nl" }).prospectCountry).toBe("NL");
    expect(cronConfig({ CRON_PROSPECT_COUNTRY: "Netherlands" }).prospectCountry).toBe("");
    expect(cronConfig({ CRON_NEWS_KEYWORDS: "breach, ciberataque" }).newsKeywords).toEqual(["breach", "ciberataque"]);
  });
  it("splits lists on semicolons when the items hold commas", () => {
    expect(list("Utilities; Transportation, Logistics, Supply Chain and Storage", [])).toEqual(["Utilities", "Transportation, Logistics, Supply Chain and Storage"]);
    expect(list("  ", ["x"])).toEqual(["x"]);
  });
  it("a run may spend the run cap, or what is left of the week when that is less", () => {
    expect(runAllowance({ runCapUsd: 0.5, weekCapUsd: 1.5 }, 0.2)).toBe(0.5);
    expect(runAllowance({ runCapUsd: 0.5, weekCapUsd: 1.5 }, 1.3)).toBe(0.2);
    expect(runAllowance({ runCapUsd: 0.5, weekCapUsd: 1.5 }, 2)).toBe(0);
  });
  it("weekly keys use the Monday of the week", () => {
    expect(weekOf(new Date("2026-10-22T07:00:00Z"))).toBe("2026-10-19");
    expect(weekOf(new Date("2026-10-19T00:00:00Z"))).toBe("2026-10-19");
    expect(weekOf(new Date("2026-10-25T23:59:00Z"))).toBe("2026-10-19");
  });
});

describe("watched cards", () => {
  it("reads the owner from a next step that starts with a name", () => {
    expect(ownerOf("Maya Okafor: contact Dana Reyes")).toBe("Maya Okafor");
    expect(ownerOf("Tomas Berg, Maya Okafor: follow up")).toBe("Tomas Berg, Maya Okafor");
    expect(ownerOf("Next: email Priya")).toBeNull();
    expect(ownerOf("Pitch the workshop to Calder Ridge")).toBeNull();
    expect(ownerOf(null)).toBeNull();
  });
  it("takes open cards only, one per company, the first board in the list winning", async () => {
    const { store } = await workspace();
    const cards = await watchedCards(store, ["Sales", "Partnerships"]);
    expect(cards.map((c) => [c.company.name, c.board, c.owner])).toEqual([
      ["Harborline", "Sales", "Maya Okafor"],
      ["Lowmoor Timber", "Partnerships", null],
    ]);
  });
});

describe("news sweep", () => {
  it("checks each watched company once, with the security words, and reports only new headlines", async () => {
    const { store } = await workspace();
    const looot = new FakeLooot((_, input) => (String(input.query).includes("Harborline") ? news("Harborline hit by ransomware", "https://daily.example/harborline") : news("Lowmoor Timber expands in Europe", "https://daily.example/other")));
    const r = await runSignalSweep(deps(store, looot), "news");
    expect(r.status).toBe("ran");
    expect(looot.calls.map((c) => c.input.query)).toEqual([`"Harborline" (${DEFAULT_NEWS_KEYWORDS.join(" OR ")})`, `"Lowmoor Timber" (${DEFAULT_NEWS_KEYWORDS.join(" OR ")})`]);
    expect(r.signals.map((s) => [s.company, s.tag, s.owner])).toEqual([
      ["Harborline", "security", "Maya Okafor"],
      ["Lowmoor Timber", "other", null],
    ]);
    const [action] = await store.all("actions");
    expect(action.action_key).toBe(`cron:news:${NOW.toISOString().slice(0, 10)}`);
    expect(action.max_cost_usd).toBe(0.5);

    // The same day again: the stored run is replayed and looot is not called.
    const again = await runSignalSweep(deps(store, looot), "news");
    expect(again.status).toBe("replayed");
    expect(looot.calls).toHaveLength(2);
  });
  it("leaves out a headline seen in an earlier run", async () => {
    const { store } = await workspace();
    const looot = new FakeLooot(() => news("Harborline breach", "https://daily.example/same"));
    await runSignalSweep(deps(store, looot), "news");
    const later = new Date(NOW.getTime() + 3 * 86_400_000);
    const r = await runSignalSweep({ ...deps(store, looot), now: later }, "news");
    expect(r.status).toBe("ran");
    expect(r.signals).toEqual([]);
  });
  it("skips without calling looot when the weekly cap is used up", async () => {
    const { store } = await workspace();
    await store.insert("actions", [{ action_key: "cron:prospects:2026-10-19", kind: "find_people", max_cost_usd: 2, actual_usd: 1.5, status: "done" }]);
    expect(await weekSpend(store, NOW)).toBe(1.5);
    const looot = new FakeLooot(() => ({}));
    const r = await runSignalSweep(deps(store, looot), "news");
    expect(r).toMatchObject({ status: "skipped" });
    expect(r.reason).toContain("weekly cap");
    expect(looot.calls).toHaveLength(0);
  });
  it("skips when the looot balance is below the estimate", async () => {
    const { store } = await workspace();
    const looot = new FakeLooot(() => ({}), 0.0001);
    const r = await runSignalSweep(deps(store, looot), "news");
    expect(r.status).toBe("skipped");
    expect(r.reason).toContain("Top up");
    expect(looot.calls).toHaveLength(0);
  });
  it("stops at the run's cap", async () => {
    const { store } = await workspace();
    const looot = new FakeLooot(() => ({ ...news("x", "https://x.example"), actualCost: 0.01 }));
    const r = await runSignalSweep(deps(store, looot, { CRON_RUN_CAP_USD: "0.0105" }), "news");
    expect(looot.calls).toHaveLength(1);
    expect(r.spentUsd).toBeLessThanOrEqual(0.0105);
    expect(r.reason).toBeTruthy();
  });
});

describe("hiring sweep", () => {
  it("checks the hiring boards only and keeps security roles at the company", async () => {
    const { store } = await workspace();
    const looot = new FakeLooot(() => ({
      result: {
        data: {
          items: [
            { title: "Chief Information Security Officer (CISO)", company: "Harborline", url: "https://jobs.example/1" },
            { title: "Associate Accountant", company: "Harborline", url: "https://jobs.example/2" },
            { title: "CISO", company: "Pinecrest Group", url: "https://jobs.example/3" },
          ],
        },
      },
    }));
    const r = await runSignalSweep(deps(store, looot), "hiring");
    expect(looot.calls).toHaveLength(1);
    expect(looot.calls[0].input).toMatchObject({ company: "Harborline", query: `Harborline ${DEFAULT_HIRING_KEYWORDS.join(" OR ")}` });
    expect(r.signals.map((s) => [s.company, s.kind, s.title])).toEqual([["Harborline", "hiring", "Chief Information Security Officer (CISO)"]]);
    expect((await store.all("actions"))[0].action_key).toMatch(/^cron:hiring:\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Slack messages", () => {
  it("names the company, board, owner, headline and an opener, escaped", () => {
    const text = signalsMessage({
      step: "news",
      status: "ran",
      companies: 2,
      estimateUsd: 0.002,
      spentUsd: 0.00198,
      signals: [{ company: "Harborline", board: "Sales", owner: "Maya Okafor", kind: "news", tag: "security", title: "Harborline <hacked> & fined", url: "https://j.example/a" }],
    })!;
    expect(text).toContain("*News signals · 1 company* (2 checked, $0.0020)");
    expect(text).toContain("• *Harborline* (Sales, Maya Okafor): <https://j.example/a|Harborline &lt;hacked&gt; &amp; fined>");
    expect(text).toContain(openerFor({ kind: "news", tag: "security", company: "Harborline" }));
  });
  it("builds openers from a lead-in, the pitch and the suffix", () => {
    expect(openerFor({ kind: "news", tag: "security", company: "Harborline" })).toBe("Saw the security news on Harborline.");
    expect(openerFor({ kind: "news", tag: "security", company: "Harborline" }, "Workshop on 12 May.", "We test what you expose.")).toBe("Saw the security news on Harborline. We test what you expose. Workshop on 12 May.");
    expect(openerFor({ kind: "hiring", tag: null, company: "Harborline" })).toBe("Saw Harborline is hiring for security: a good moment to get in touch.");
  });
  it("keeps headlines that name the company, one per company, the first board first, openers only for it", () => {
    const sig = (company: string, board: string, title: string, tag: string | null = "security") => ({ company, board, owner: null, kind: "news" as const, tag, title, url: null });
    const text = signalsMessage(
      { step: "news", status: "ran", companies: 4, estimateUsd: 0, spentUsd: 0, signals: [sig("Brightwater Labs", "Partnerships", "Brightwater Labs offers service credits"), sig("ORB", "Sales", "Orb payout before bankruptcy"), sig("NGB (Northgate Bank)", "Sales", "NGB hit by phishing wave"), sig("NGB (Northgate Bank)", "Sales", "NGB results", null)] },
      "",
      ["Sales", "Partnerships"],
    )!;
    expect(text).toContain("2 companies");
    expect(text.indexOf("NGB")).toBeLessThan(text.indexOf("Brightwater"));
    expect(text).not.toContain("Orb payout");
    expect(text).not.toContain("NGB results");
    expect(text.split("_Opener:_").length).toBe(2);
    expect(text).toContain("2 other headlines are on the companies' Intent tabs.");
  });
  it("matches short all-caps names by case", () => {
    expect(mentions("ORB invests in grid security", "ORB")).toBe(true);
    expect(mentions("An orb of light", "ORB")).toBe(false);
    expect(mentions("Kestrel Pay outage hits payments", "Kestrel Pay")).toBe(true);
    expect(mentions("Northgate results", "NGB (Northgate Bank)")).toBe(false);
  });
  it("posts nothing for a run with no new signal, and says why a run was skipped", () => {
    expect(signalsMessage({ step: "news", status: "ran", companies: 2, estimateUsd: 0, spentUsd: 0, signals: [] })).toBeNull();
    expect(signalsMessage({ step: "hiring", status: "skipped", reason: "Balance low", companies: 2, estimateUsd: 0, spentUsd: 0, signals: [] })).toBe("*Signals (hiring)* skipped: Balance low");
  });
});

const lead = (o: Record<string, unknown>) => ({ firstname: "Sam", lastname: "Carter", lastJobTitle: "CISO", lastCompanyName: "Bank X", lastCompanyIndustry: "Banking", lastCompanySize: 500, lastCompanyWebsite: "https://www.bankx.nl", profileUrl: "https://www.linkedin.com/in/samcarter", ...o });
const icypeas = (leads: Record<string, unknown>[]) => ({ items: leads.length, output: { leads, total: leads.length, success: true } });

describe("prospect leads", () => {
  it("reads people-search rows and drops rows without a name or company", () => {
    const leads = parseLeads(icypeas([lead({}), lead({ lastname: "" }), lead({ lastCompanyName: null })]));
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ name: "Sam Carter", title: "CISO", company: "Bank X", employees: 500, linkedin: "https://www.linkedin.com/in/samcarter" });
    expect(parseLeads({ nothing: true })).toEqual([]);
  });
  it("turns websites into domains and ignores link shorteners", () => {
    expect(domainOf("http://www.harborline.nl")).toBe("harborline.nl");
    expect(domainOf("calder-ridge.nl")).toBe("calder-ridge.nl");
    expect(domainOf("https://bit.ly/E2gMao")).toBeNull();
    expect(domainOf(null)).toBeNull();
  });
  it("puts organisations based in the country first (its domain or an address there), then larger ones", () => {
    const leads = parseLeads(icypeas([lead({ lastCompanyName: "Thornbury Bank UK", lastCompanyWebsite: "http://www.thornbury.co.uk/", lastCompanySize: 9000 }), lead({ lastCompanyName: "Small NL", lastCompanySize: 100, lastCompanyWebsite: "https://small.nl" }), lead({ lastCompanyName: "Big NL", lastCompanySize: 5000, lastCompanyWebsite: null, lastCompanyAddress: "Utrecht, Netherlands" })]));
    expect(rankLeads(leads, "NL").map((l) => l.company)).toEqual(["Big NL", "Small NL", "Thornbury Bank UK"]);
    expect(rankLeads(leads, "GB").map((l) => l.company)[0]).toBe("Thornbury Bank UK");
  });
  it("drops foreign organisations when only local ones are wanted", () => {
    const leads = parseLeads(icypeas([lead({ lastCompanyName: "Thornbury Bank UK", lastCompanyWebsite: "http://www.thornbury.co.uk/", lastCompanySize: 9000 }), lead({ lastCompanyName: "Big NL", lastCompanySize: 5000, lastCompanyWebsite: "https://big.nl" })]));
    expect(rankLeads(leads, "NL", true).map((l) => l.company)).toEqual(["Big NL"]);
  });
  it("skips people and companies the CRM has, by LinkedIn, domain or name, and keeps one per company", () => {
    const leads = parseLeads(
      icypeas([
        lead({ profileUrl: "https://nl.linkedin.com/in/SamCarter/" }),
        lead({ firstname: "Tomas", lastCompanyName: "NGB", lastCompanyWebsite: "http://www.northgate.nl", profileUrl: "https://linkedin.com/in/tomas" }),
        lead({ firstname: "Eva", lastCompanyName: "Calder Ridge Energy", lastCompanyWebsite: null, profileUrl: "https://linkedin.com/in/eva" }),
        lead({ firstname: "Joan", lastCompanyName: "Lowmoor Group", lastCompanyWebsite: "https://www.lowmoor.nl/", profileUrl: "https://linkedin.com/in/joan" }),
        lead({ firstname: "Pieter", lastCompanyName: "Lowmoor", lastCompanyWebsite: "https://lowmoor.nl", profileUrl: "https://linkedin.com/in/pieter" }),
      ]),
    );
    const fresh = newLeads(leads, { companies: [{ name: "NGB (Northgate Bank)", domain: "northgate.nl" }, { name: "Calder Ridge Energy", domain: "calderridge.example" }], contacts: [{ linkedin_url: "https://www.linkedin.com/in/samcarter" }] });
    expect(fresh.map((l) => l.name)).toEqual(["Joan Carter"]);
  });
});

describe("prospect run", () => {
  it("adds new people as prospect cards for the reviewer, records the spend, and replays within the week", async () => {
    const { store, po } = await workspace();
    const looot = new FakeLooot(() => ({ result: icypeas([lead({}), lead({ firstname: "Tomas", lastCompanyName: "Harborline", lastCompanyWebsite: "https://harborline.example" }), lead({ firstname: "Eva", lastCompanyName: "Fernhill Saúde", lastCompanyWebsite: null, lastCompanyIndustry: "Hospitals and Health Care" })]), actualCost: 0.00114 }));
    const r = await runProspects({ store, looot, config: cronConfig({ ...ENV, CRON_PROSPECT_REVIEWER: "Maya Okafor", CRON_PROSPECT_INDUSTRIES: "Banking; Hospitals and Health Care" }), now: NOW });
    expect(r.status).toBe("ran");
    expect(looot.calls.map((c) => c.id)).toEqual([PROSPECT_ENDPOINT]);
    expect((looot.calls[0].input as { query: Record<string, unknown> }).query).toMatchObject({ location: { include: ["NL"] }, "currentCompany.industry": { include: ["Banking", "Hospitals and Health Care"] } });
    expect(r.added.map((l) => l.company)).toEqual(["Bank X", "Fernhill Saúde"]);

    const deals = (await store.all("deals", { pipeline_id: po.id })).filter((d) => d.name === "Prospect");
    expect(deals).toHaveLength(2);
    expect(deals.every((d) => d.stage === "prospect" && d.next_step === "Maya Okafor: review prospect (pick or decline)")).toBe(true);
    const companies = await store.all("companies");
    expect(companies.find((c) => c.name === "Fernhill Saúde")?.domain).toBe("fernhill-saude.invalid");
    const contacts = await store.all("contacts");
    expect(contacts.filter((c) => c.source === "looot").map((c) => c.email)).toEqual([null, null]);
    const notes = (await store.all("activities")).filter((a) => a.meta?.import === "cron:prospects");
    expect(notes).toHaveLength(2);
    expect(notes[0].body).toBe("Found by the weekly prospect search: Sam Carter, CISO (Banking, about 500 people). No email looked up yet.");

    const [action] = await store.all("actions");
    expect(action).toMatchObject({ kind: "find_people", status: "done", actual_usd: 0.00114, max_cost_usd: PROSPECT_HOLD_USD });
    const [run] = await store.all("runs");
    expect(run).toMatchObject({ outcome: "data", cost_usd: 0.00114, note: "3 found, 2 added" });

    const again = await runProspects({ store, looot, config: cronConfig(ENV), now: NOW });
    expect(again.status).toBe("replayed");
    expect(looot.calls).toHaveLength(1);
    expect(prospectsMessage(r, "Sales")).toContain("*2 new prospects on Sales* for Maya Okafor to pick or decline");
  });
  it("stops at the configured number per run", async () => {
    const { store } = await workspace();
    const many = Array.from({ length: 30 }, (_, i) => lead({ firstname: `P${i}`, lastCompanyName: `Co ${i}`, lastCompanyWebsite: `https://co${i}.nl`, profileUrl: `https://linkedin.com/in/p${i}` }));
    const r = await runProspects({ store, looot: new FakeLooot(() => ({ result: icypeas(many) })), config: cronConfig({ ...ENV, CRON_PROSPECTS_PER_RUN: "4" }), now: NOW });
    expect(r.added).toHaveLength(4);
  });
  it("skips without a call when the board is missing, the week is spent or the balance is low", async () => {
    const noBoard = new FakeLooot(() => ({}));
    const missing = await runProspects({ store: new MemoryStore(), looot: noBoard, config: cronConfig({ ...ENV, CRON_PROSPECT_BOARD: "No such board" }), now: NOW });
    expect(missing.status).toBe("skipped");
    expect(missing.reason).toContain("No company board");

    const { store: noCountryStore } = await workspace();
    const noCountry = await runProspects({ store: noCountryStore, looot: noBoard, config: cronConfig({}), now: NOW });
    expect(noCountry).toMatchObject({ status: "skipped" });
    expect(noCountry.reason).toContain("CRON_PROSPECT_COUNTRY");

    const { store } = await workspace();
    const low = new FakeLooot(() => ({}), 0.01);
    const r = await runProspects({ store, looot: low, config: cronConfig(ENV), now: NOW });
    expect(r.reason).toContain("Top up");

    await store.insert("actions", [{ action_key: "cron:news:x", kind: "intent_refresh", max_cost_usd: 2, actual_usd: 1.49, status: "done" }]);
    const capped = await runProspects({ store, looot: new FakeLooot(() => ({})), config: cronConfig(ENV), now: NOW });
    expect(capped.reason).toContain("weekly cap");
    expect(noBoard.calls.length + low.calls.length).toBe(0);
  });
});
