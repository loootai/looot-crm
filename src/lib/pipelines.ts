import type { Store } from "./store/types";
import type { Pipeline, PipelineStage, PipelineSubject, StageKind } from "./types";

/** One stage as the board and the deal view use it. `key` is what deals.stage stores. */
export interface StageDef {
  key: string;
  label: string;
  kind: StageKind;
}

/** A pipeline with its stages in order. */
export interface PipelineView {
  id: string;
  name: string;
  position: number;
  subject: PipelineSubject;
  trackAmount: boolean;
  currency: string;
  stages: StageDef[];
}

export interface PipelineTemplate {
  id: string;
  name: string;
  subject: PipelineSubject;
  trackAmount: boolean;
  /** label, kind. Keys are made from the labels. */
  stages: [string, StageKind][];
  hint: string;
}

/** Starting points offered when a pipeline is created. The stages can be changed afterwards. */
export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  { id: "sales", name: "Sales", subject: "company", trackAmount: true, stages: [["Lead", "open"], ["Qualified", "open"], ["Demo", "open"], ["Proposal", "open"], ["Won", "won"], ["Lost", "lost"]], hint: "Companies you sell to, with a deal value." },
  { id: "partnerships", name: "Partnerships", subject: "company", trackAmount: false, stages: [["Identified", "open"], ["Intro made", "open"], ["In talks", "open"], ["Agreed", "won"], ["Not now", "lost"]], hint: "Companies you work with, without a deal value." },
  { id: "sponsors", name: "Sponsors", subject: "company", trackAmount: true, stages: [["Prospect", "open"], ["Contacted", "open"], ["Proposal sent", "open"], ["Committed", "won"], ["Declined", "lost"]], hint: "Companies that fund you, with the amount." },
  { id: "applicants", name: "Applicants", subject: "person", trackAmount: false, stages: [["Applied", "open"], ["Screening", "open"], ["Accepted", "won"], ["Declined", "lost"]], hint: "People who apply, one card per person." },
];

/** The 0.1.x stages. The database creates the first pipeline with these keys, so old deals keep their stage. */
export const DEFAULT_PIPELINE = PIPELINE_TEMPLATES[0];
const DEFAULT_KEYS = ["lead", "qualified", "demo", "proposal", "won", "lost"];

export const isClosed = (kind: StageKind | undefined) => kind === "won" || kind === "lost";

/** A stage key from a label: lower case, a to z, 0 to 9 and _, unique within `taken`. */
export function stageKey(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "stage";
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  taken.add(key);
  return key;
}

/** Stage rows for a template, keys made from the labels (the sales template keeps the 0.1.x keys). */
export function templateStages(t: PipelineTemplate): StageDef[] {
  const taken = new Set<string>();
  return t.stages.map(([label, kind], i) => ({ key: t.id === "sales" ? DEFAULT_KEYS[i] : stageKey(label, taken), label, kind }));
}

export function toView(p: Pipeline, stages: PipelineStage[]): PipelineView {
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    subject: p.subject,
    trackAmount: p.track_amount,
    currency: p.currency,
    stages: stages
      .filter((s) => s.pipeline_id === p.id)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ key: s.key, label: s.label, kind: s.kind })),
  };
}

/** Adds a pipeline with its stages. Returns null when the name is taken. */
export async function createPipelineRows(store: Store, input: { name: string; subject: PipelineSubject; trackAmount: boolean; currency: string; stages: StageDef[]; position: number }): Promise<PipelineView | null> {
  const [p] = await store.insertIgnore("pipelines", [{ name: input.name, subject: input.subject, track_amount: input.trackAmount, currency: input.currency, position: input.position }], ["name"]);
  if (!p) return null;
  const rows = await store.insert(
    "pipeline_stages",
    input.stages.map((s, i) => ({ pipeline_id: p.id, key: s.key, label: s.label, kind: s.kind, position: (i + 1) * 1000 })),
  );
  return toView(p, rows);
}

/**
 * Every pipeline of the workspace, in order, with its stages. A workspace with none gets the Sales
 * pipeline first, with the same keys the database uses for deals inserted without a pipeline.
 */
export async function loadPipelines(store: Store): Promise<PipelineView[]> {
  let [pipelines, stages] = await Promise.all([store.all("pipelines"), store.all("pipeline_stages")]);
  if (!pipelines.length) {
    await createPipelineRows(store, { name: DEFAULT_PIPELINE.name, subject: "company", trackAmount: true, currency: "USD", stages: templateStages(DEFAULT_PIPELINE), position: 1000 });
    [pipelines, stages] = await Promise.all([store.all("pipelines"), store.all("pipeline_stages")]);
  }
  return pipelines.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)).map((p) => toView(p, stages));
}

/** The pipeline the dashboard counts money in: the first one that tracks an amount, else the first. */
export const primaryPipeline = (pipelines: PipelineView[]): PipelineView | undefined => pipelines.find((p) => p.trackAmount) ?? pipelines[0];

/** Pipeline by id, and a stage by pipeline and key. */
export function index(pipelines: PipelineView[]) {
  const byId = new Map(pipelines.map((p) => [p.id, p]));
  const stage = (pipelineId: string, key: string): StageDef | undefined => byId.get(pipelineId)?.stages.find((s) => s.key === key);
  return { byId, stage, label: (pipelineId: string, key: string) => stage(pipelineId, key)?.label ?? key };
}

/** Progress of a stage inside its pipeline, 0 for the first open stage up to 1 for the last open one. Closed stages are -1. */
export function progress(p: PipelineView | undefined, key: string): number {
  if (!p) return -1;
  const open = p.stages.filter((s) => s.kind === "open");
  const i = open.findIndex((s) => s.key === key);
  if (i === -1) return -1;
  return open.length === 1 ? 1 : i / (open.length - 1);
}
