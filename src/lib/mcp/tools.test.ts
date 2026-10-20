import { describe, expect, it } from "vitest";
import { seedDemo } from "@/demo/seed";
import { MemoryStore } from "../store/demoStore";
import { allowedRedirectHosts, redirectAllowed } from "./consent";
import { callCrmTool, CRM_TOOLS, type CrmTool } from "./tools";

const store = () => new MemoryStore(seedDemo(new Date("2026-10-19T09:00:00Z")));
const tool = (name: string): CrmTool => CRM_TOOLS.find((t) => t.name === name)!;
const call = async (s: MemoryStore, name: string, args: Record<string, unknown> = {}) => {
  const r = await callCrmTool(s, tool(name), args);
  return { error: r.isError ? r.content[0].text : null, data: r.isError ? null : JSON.parse(r.content[0].text) };
};

describe("MCP tools", () => {
  it("has no destructive, team, budget, settings or paid tools", () => {
    for (const t of CRM_TOOLS) expect(t.name).not.toMatch(/delete|remove|invite|member|budget|setting|enrich|refresh|verify|run|spend/);
    expect(CRM_TOOLS.filter((t) => t.readOnly).map((t) => t.name)).toEqual(["search", "get_company", "get_person", "list_pipelines", "list_cards"]);
  });

  it("searches companies and people and returns their pipelines", async () => {
    const s = store();
    const [company] = await s.all("companies");
    const { data } = await call(s, "search", { query: company.name.slice(0, 5) });
    expect(data.companies.some((c: { company_id: string }) => c.company_id === company.id)).toBe(true);
    expect(Array.isArray(data.companies[0].pipelines)).toBe(true);
  });

  it("lists pipelines with stage counts, and cards on one stage by label", async () => {
    const s = store();
    const { data: ps } = await call(s, "list_pipelines");
    const sales = ps.find((p: { name: string }) => p.name === "Sales");
    const total = sales.stages.reduce((n: number, st: { cards: number }) => n + st.cards, 0);
    expect(total).toBe((await s.all("deals", { pipeline_id: sales.pipeline_id })).length);
    const { data: cards } = await call(s, "list_cards", { pipeline: "sales", stage: "Qualified" });
    expect(cards.cards.every((c: { stage: string }) => c.stage === "Qualified")).toBe(true);
    expect((await call(s, "list_cards", { pipeline: "Nope" })).error).toMatch(/No pipeline called "Nope"/);
  });

  it("moves a card by stage label and records the move as coming through MCP", async () => {
    const s = store();
    const deal = (await s.all("deals")).find((d) => d.stage === "lead")!;
    const r = await call(s, "move_card", { deal_id: deal.id, stage: "Qualified" });
    expect(r.data).toMatchObject({ ok: true, stage: "Qualified" });
    expect((await s.get("deals", deal.id))!.stage).toBe("qualified");
    const act = (await s.all("activities", { deal_id: deal.id })).find((a) => a.kind === "stage_change" && (a.meta as { via?: string }).via === "mcp");
    expect(act?.meta).toMatchObject({ via: "mcp", fromLabel: "Lead", toLabel: "Qualified" });
    expect((await call(s, "move_card", { deal_id: deal.id, stage: "Banana" })).error).toMatch(/not a stage of Sales/);
  });

  it("adds a note to a card and files it under the card's company", async () => {
    const s = store();
    const deal = (await s.all("deals")).find((d) => d.company_id)!;
    expect((await call(s, "add_note", { deal_id: deal.id, body: "Called, they want a demo." })).data).toEqual({ ok: true });
    const note = (await s.all("activities", { deal_id: deal.id })).find((a) => a.body === "Called, they want a demo.");
    expect(note).toMatchObject({ kind: "note", company_id: deal.company_id, meta: { via: "mcp" } });
    expect((await call(s, "add_note", { body: "Nowhere" })).error).toMatch(/Say which company/);
  });

  it("sets and clears a next step, recording each change", async () => {
    const s = store();
    const deal = (await s.all("deals"))[0];
    await call(s, "set_next_step", { deal_id: deal.id, next_step: "Send the deck", due: "2026-10-22" });
    expect(await s.get("deals", deal.id)).toMatchObject({ next_step: "Send the deck", next_step_due: "2026-10-22" });
    await call(s, "set_next_step", { deal_id: deal.id, next_step: "" });
    expect(await s.get("deals", deal.id)).toMatchObject({ next_step: null, next_step_due: null });
    const notes = (await s.all("activities", { deal_id: deal.id })).filter((a) => (a.meta as { change?: string }).change === "next_step").map((a) => a.body);
    expect(notes).toEqual(expect.arrayContaining(["Next step: Send the deck (due 2026-10-22)", "Next step cleared"]));
  });

  it("adds people and companies once, and records who added them", async () => {
    const s = store();
    const { data: co } = await call(s, "add_company", { name: "Midnight Example", domain: "https://midnight.example/" });
    expect((await s.get("companies", co.company_id))!.domain).toBe("midnight.example");
    expect((await call(s, "add_company", { name: "Again", domain: "midnight.example" })).error).toMatch(/already in your companies/);
    const { data: p } = await call(s, "add_person", { first_name: "Jos", last_name: "Example", company_id: co.company_id });
    expect((await call(s, "add_person", { first_name: "jos", last_name: "example", company_id: co.company_id })).error).toMatch(new RegExp(p.person_id));
    const added = (await s.all("activities")).filter((a) => (a.meta as { via?: string }).via === "mcp").map((a) => (a.meta as { change?: string }).change);
    expect(added).toEqual(expect.arrayContaining(["add_company", "add_person"]));
  });

  it("adds a card to a company pipeline and refuses the wrong kind of subject", async () => {
    const s = store();
    const [company] = await s.all("companies");
    const { data } = await call(s, "add_card", { pipeline: "Partnerships", stage: "Identified", name: "Intro", company_id: company.id, next_step: "Email them" });
    expect(await s.get("deals", data.deal_id)).toMatchObject({ company_id: company.id, stage: "identified", next_step: "Email them" });
    expect((await s.all("activities", { deal_id: data.deal_id }))[0].meta).toMatchObject({ via: "mcp", to: "identified" });
    expect((await call(s, "add_card", { pipeline: "Partnerships", stage: "Identified", name: "x" })).error).toMatch(/give a company_id/);
  });

  it("returns a plain error for a missing record", async () => {
    expect((await call(store(), "get_company", { company_id: "nope" })).error).toBe("Company not found.");
  });
});

describe("consent redirect hosts", () => {
  it("defaults to Claude and local hosts", () => {
    expect(allowedRedirectHosts({})).toEqual(["claude.ai", "claude.com", "localhost", "127.0.0.1"]);
    expect(allowedRedirectHosts({ MCP_ALLOWED_REDIRECT_HOSTS: " Example.com , " })).toEqual(["example.com"]);
  });
  it("allows exact hosts over https, and http only locally", () => {
    expect(redirectAllowed("https://claude.ai/api/mcp/auth_callback", {})).toBe(true);
    expect(redirectAllowed("http://localhost:6274/oauth/callback", {})).toBe(true);
    expect(redirectAllowed("http://claude.ai/cb", {})).toBe(false);
    expect(redirectAllowed("https://evil.claude.ai.example/cb", {})).toBe(false);
    expect(redirectAllowed("https://notclaude.ai/cb", {})).toBe(false);
    expect(redirectAllowed("not a url", {})).toBe(false);
    expect(redirectAllowed("https://claude.ai/cb", { MCP_ALLOWED_REDIRECT_HOSTS: "example.com" })).toBe(false);
  });
});
