import { describe, expect, it } from "vitest";
import { seedDemo } from "@/demo/seed";
import { FALLBACK_PRICES } from "./jobs";
import { buildPlan, idempotencyKey, quoteRows } from "./plan";

const d = seedDemo(new Date("2026-10-08T10:30:00Z"));
const settings = d.settings[0];
const companyOf = new Map(d.companies.map((c) => [c.id, c]));
const company = (slug: string) => d.companies.find((c) => c.id === `co-${slug}`)!;
const contact = (id: string) => d.contacts.find((c) => c.id === id)!;
const prices = FALLBACK_PRICES;

describe("buildPlan", () => {
  it("plans a full intent refresh: 6 runs, $0.02444 estimated, $0.13 worst case", () => {
    const plan = buildPlan({ kind: "intent_refresh", companies: [company("brightwell")], prices, settings });
    expect(plan.lines.map((l) => l.jobId)).toEqual(["jobs.search", "news.search", "company.technographics", "company.funding", "web.scrape.markdown", "web.scrape.markdown"]);
    expect(plan.estimate).toBe(0.02444);
    expect(plan.worstCase).toBe(0.13);
    expect(plan.title).toBe("Refresh intent: Brightwell Logistics");
    expect(plan.lines[0].input).toEqual({ query: "Brightwell Logistics logistics OR supply chain OR warehouse operations OR transportation", company: "Brightwell Logistics" });
    expect(plan.lines[1].input).toEqual({ query: '"Brightwell Logistics"' });
    expect(plan.lines[4].input).toEqual({ url: "https://brightwell-logistics.example/pricing" });
  });
  it("plans one signal kind alone", () => {
    const plan = buildPlan({ kind: "intent_refresh", companies: [company("kestrel")], steps: ["news"], prices, settings });
    expect(plan.lines).toHaveLength(1);
    expect(plan.estimate).toBe(0.00099);
    expect(plan.worstCase).toBe(0.01);
  });
  it("plans contact enrichment: 3 steps, $0.04685 estimated, $0.10 worst case", () => {
    const noor = contact("p-noor-al-sayed");
    const plan = buildPlan({ kind: "contact_enrich", contacts: [noor], companyOf, prices, settings });
    expect(plan.lines.map((l) => l.step)).toEqual(["email", "verify", "phone"]);
    expect(plan.estimate).toBe(0.04685);
    expect(plan.worstCase).toBe(0.1);
    expect(plan.lines[0].input).toMatchObject({ first_name: "Noor", last_name: "Al-Sayed", domain: "brightwell-logistics.example" });
    expect(quoteRows(plan.lines).map((r) => [r.jobId, r.runs, r.estimate, r.cap])).toEqual([
      ["people.email.find", 1, 0.019, 0.03],
      ["people.email.verify", 1, 0.00145, 0.01],
      ["people.phone.find", 1, 0.0264, 0.06],
    ]);
  });
  it("leaves out steps for values the contact already has", () => {
    const hyejin = contact("p-hye-jin-bae");
    expect(buildPlan({ kind: "contact_enrich", contacts: [hyejin], companyOf, prices, settings }).lines.map((l) => l.step)).toEqual(["phone"]);
    const adaeze = contact("p-adaeze-okonkwo");
    expect(buildPlan({ kind: "contact_enrich", contacts: [adaeze], companyOf, prices, settings }).lines).toHaveLength(0);
    const farah = contact("p-farah-qureshi");
    expect(buildPlan({ kind: "contact_enrich", contacts: [farah], companyOf, prices, settings }).lines.map((l) => l.step)).toEqual(["verify", "phone"]);
  });
  it("drops an unchecked step and its cost", () => {
    const plan = buildPlan({ kind: "contact_enrich", contacts: [contact("p-noor-al-sayed")], companyOf, steps: ["email", "verify"], prices, settings });
    expect(plan.estimate).toBe(0.02045);
    expect(plan.worstCase).toBe(0.04);
  });
  it("plans company enrichment and bulk verification", () => {
    const enrich = buildPlan({ kind: "company_enrich", companies: [company("lowmoor"), company("vessel")], prices, settings });
    expect(enrich.estimate).toBe(0.0038);
    expect(enrich.title).toBe("Enrich company 2 accounts");
    const verify = buildPlan({ kind: "email_verify", contacts: [contact("p-farah-qureshi"), contact("p-noor-al-sayed")], companyOf, prices, settings });
    expect(verify.lines).toHaveLength(1);
  });
  it("plans a people search: $0.0036 for 10, worst case $0.02, and scales with the number asked for", () => {
    const seed = contact("p-adaeze-okonkwo");
    const ten = buildPlan({ kind: "find_people", contacts: [seed], companyOf, prices, settings, options: { keywords: ["operations", "supply chain"], limit: 10 } });
    expect(ten.estimate).toBe(0.0036);
    expect(ten.worstCase).toBe(0.02);
    expect(ten.lines[0].input).toEqual({ domain: "brightwell-logistics.example", company: "Brightwell Logistics", job_title: "operations, supply chain", limit: 10 });
    const max = buildPlan({ kind: "find_people", contacts: [seed], companyOf, prices, settings, options: { keywords: [], limit: 99 } });
    expect(max.lines[0].input.limit).toBe(25);
    expect(max.estimate).toBe(0.009);
  });
  it("ignores steps that do not belong to the action kind", () => {
    const plan = buildPlan({ kind: "company_enrich", companies: [company("lowmoor")], steps: ["phone", "enrich"], prices, settings });
    expect(plan.lines.map((l) => l.step)).toEqual(["enrich"]);
  });
});

describe("idempotencyKey", () => {
  it("is crm:<actionKey>:<job>:<target> and adds a url hash for page reads", () => {
    expect(idempotencyKey("k1", { jobId: "news.search", targetId: "co-1" })).toBe("crm:k1:news.search:co-1");
    const a = idempotencyKey("k1", { jobId: "web.scrape.markdown", targetId: "co-1", url: "https://a.example/pricing" });
    const b = idempotencyKey("k1", { jobId: "web.scrape.markdown", targetId: "co-1", url: "https://a.example/careers" });
    expect(a).toMatch(/^crm:k1:web\.scrape\.markdown:co-1:[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
