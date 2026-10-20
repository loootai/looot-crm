import { describe, expect, it } from "vitest";
import { createPipelineRows, index, isClosed, loadPipelines, PIPELINE_TEMPLATES, primaryPipeline, progress, stageKey, templateStages } from "./pipelines";
import { MemoryStore } from "./store/demoStore";
import { seedDemo } from "@/demo/seed";
import { pipelineTags } from "./queries";

describe("stage keys", () => {
  it("are lower case slugs, unique within a pipeline", () => {
    const taken = new Set<string>();
    expect(stageKey("Intro made", taken)).toBe("intro_made");
    expect(stageKey("Intro made", taken)).toBe("intro_made_2");
    expect(stageKey("  Proposta enviada! ", taken)).toBe("proposta_enviada");
    expect(stageKey("Négociação", taken)).toBe("negociacao");
    expect(stageKey("!!!", taken)).toBe("stage");
  });
  it("keep the 0.1.x keys for the sales template, so old deals still match", () => {
    expect(templateStages(PIPELINE_TEMPLATES[0]).map((s) => s.key)).toEqual(["lead", "qualified", "demo", "proposal", "won", "lost"]);
  });
  it("every template has an open stage and ends with closing stages", () => {
    for (const t of PIPELINE_TEMPLATES) {
      const stages = templateStages(t);
      expect(stages.some((s) => s.kind === "open"), t.id).toBe(true);
      expect(stages.slice(-2).every((s) => isClosed(s.kind)), t.id).toBe(true);
    }
  });
});

describe("loadPipelines", () => {
  it("creates the Sales pipeline for a workspace that has none, once", async () => {
    const store = new MemoryStore();
    const first = await loadPipelines(store);
    const again = await loadPipelines(store);
    expect(first.map((p) => p.name)).toEqual(["Sales"]);
    expect(again).toHaveLength(1);
    expect(first[0].stages.map((s) => s.key)).toEqual(["lead", "qualified", "demo", "proposal", "won", "lost"]);
  });
  it("orders pipelines and their stages by position", async () => {
    const store = new MemoryStore(seedDemo(new Date("2026-10-08T10:30:00Z")));
    const made = await createPipelineRows(store, { name: "Applicants", subject: "person", trackAmount: false, currency: "EUR", stages: templateStages(PIPELINE_TEMPLATES[3]), position: 500 });
    expect(made?.subject).toBe("person");
    const all = await loadPipelines(store);
    expect(all.map((p) => p.name)).toEqual(["Applicants", "Sales", "Partnerships"]);
    expect(all[0].stages.map((s) => s.label)).toEqual(["Applied", "Screening", "Accepted", "Declined"]);
    // The first pipeline with amounts is the one money is counted in.
    expect(primaryPipeline(all)?.name).toBe("Sales");
    expect(await createPipelineRows(store, { name: "Applicants", subject: "person", trackAmount: false, currency: "EUR", stages: [], position: 1 })).toBeNull();
  });
});

describe("progress and labels", () => {
  it("measures how far an open stage is, and closed stages are -1", async () => {
    const [sales] = await loadPipelines(new MemoryStore());
    expect(progress(sales, "lead")).toBe(0);
    expect(progress(sales, "proposal")).toBe(1);
    expect(progress(sales, "won")).toBe(-1);
    const ix = index([sales]);
    expect(ix.label(sales.id, "demo")).toBe("Demo");
    expect(ix.label(sales.id, "gone")).toBe("gone");
  });
});

describe("pipelineTags", () => {
  it("gives one tag per pipeline in board order, with the furthest open stage before a closed one", async () => {
    const store = new MemoryStore();
    const [sales] = await loadPipelines(store);
    const partners = (await createPipelineRows(store, { name: "Partnerships", subject: "company", trackAmount: false, currency: "EUR", stages: templateStages(PIPELINE_TEMPLATES[1]), position: 2000 }))!;
    const tags = pipelineTags(
      [
        { pipeline_id: partners.id, stage: "identified" },
        { pipeline_id: sales.id, stage: "won" },
        { pipeline_id: sales.id, stage: "qualified" },
        { pipeline_id: sales.id, stage: "lead" },
      ],
      [sales, partners],
    );
    expect(tags).toEqual([
      { id: sales.id, name: "Sales", stage: "Qualified", closed: false },
      { id: partners.id, name: "Partnerships", stage: "Identified", closed: false },
    ]);
    expect(pipelineTags([{ pipeline_id: sales.id, stage: "lost" }], [sales])).toEqual([{ id: sales.id, name: "Sales", stage: "Lost", closed: true }]);
    expect(pipelineTags([], [sales])).toEqual([]);
  });
});
