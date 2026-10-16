"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { createPipeline, deletePipeline, movePipeline, savePipelineStages, updatePipeline } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Select } from "@/components/ui/input";
import { PIPELINE_TEMPLATES, type PipelineView } from "@/lib/pipelines";
import type { StageKind } from "@/lib/types";

type Res = { ok: true } | { ok: false; error: string };
const KIND_LABEL: Record<StageKind, string> = { open: "Open", won: "Closes as won", lost: "Closes as lost" };

/** Deals per stage, by pipeline id then stage key. Stages with deals cannot be removed. */
export type StageCounts = Record<string, Record<string, number>>;

export function PipelinesSection({ pipelines, counts, defaultCurrency }: { pipelines: PipelineView[]; counts: StageCounts; defaultCurrency: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<Res>, done: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast(done);
      router.refresh();
    });
  return (
    <section id="pipelines" aria-labelledby="pipelines-h" className="scroll-mt-16 border-b border-border py-6">
      <h2 id="pipelines-h" className="text-base font-semibold">Pipelines</h2>
      <p className="mt-1 max-w-xl text-13 text-muted-foreground">Each pipeline is a board with its own stages, for example sales, partnerships or applicants. The first one that tracks an amount is the one Today counts money in.</p>
      <div className="mt-4 grid max-w-3xl gap-4">
        {pipelines.map((p, i) => (
          <PipelineCard key={p.id} pipeline={p} counts={counts[p.id] ?? {}} first={i === 0} last={i === pipelines.length - 1} only={pipelines.length === 1} pending={pending} run={run} />
        ))}
      </div>
      <NewPipeline defaultCurrency={defaultCurrency} pending={pending} run={run} />
    </section>
  );
}

function PipelineCard({ pipeline: p, counts, first, last, only, pending, run }: { pipeline: PipelineView; counts: Record<string, number>; first: boolean; last: boolean; only: boolean; pending: boolean; run: (fn: () => Promise<Res>, done: string) => void }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const [name, setName] = React.useState(p.name);
  const [currency, setCurrency] = React.useState(p.currency);
  const [stages, setStages] = React.useState(p.stages.map((s) => ({ ...s, key: s.key as string | null, id: s.key })));
  const dirty = JSON.stringify(stages.map(({ key, label, kind }) => ({ key, label, kind }))) !== JSON.stringify(p.stages);
  const set = (i: number, patch: Partial<(typeof stages)[number]>) => setStages(stages.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const swap = (i: number, j: number) => {
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    setStages(next);
  };
  const id = (x: string) => `pl-${p.id}-${x}`;
  return (
    <article aria-label={`Pipeline ${p.name}`} className="min-w-0 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Name" htmlFor={id("name")} className="min-w-0 flex-1 max-sm:basis-full sm:min-w-48">
          <Input id={id("name")} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== p.name && run(() => updatePipeline(p.id, { name: name.trim() }), "Pipeline renamed")} />
        </Field>
        <Field label="Cards are about" htmlFor={id("subject")} className="w-36">
          <Select id={id("subject")} value={p.subject} disabled={pending || total > 0} title={total > 0 ? "This pipeline has deals, so this cannot change." : undefined} onChange={(e) => run(() => updatePipeline(p.id, { subject: e.target.value as "company" | "person" }), "Pipeline saved")}>
            <option value="company">A company</option>
            <option value="person">A person</option>
          </Select>
        </Field>
        <div className="flex h-8 items-center gap-2 max-sm:h-10">
          <Checkbox id={id("amount")} checked={p.trackAmount} disabled={pending} onCheckedChange={(v) => run(() => updatePipeline(p.id, { track_amount: v === true }), v === true ? "Amounts shown" : "Amounts hidden")} />
          <label htmlFor={id("amount")} className="text-13">Deal value</label>
        </div>
        {p.trackAmount && (
          <Field label="Currency" htmlFor={id("cur")} className="w-20">
            <Input id={id("cur")} value={currency} maxLength={3} className="font-mono uppercase" onChange={(e) => setCurrency(e.target.value.toUpperCase())} onBlur={() => currency !== p.currency && run(() => updatePipeline(p.id, { currency }), "Currency saved")} />
          </Field>
        )}
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant="ghost" disabled={pending || first} aria-label={`Move ${p.name} up`} onClick={() => run(() => movePipeline(p.id, "up"), "Order saved")}><ArrowUp /></Button>
          <Button size="icon" variant="ghost" disabled={pending || last} aria-label={`Move ${p.name} down`} onClick={() => run(() => movePipeline(p.id, "down"), "Order saved")}><ArrowDown /></Button>
          <Button size="icon" variant="ghost" disabled={pending || only || total > 0} aria-label={`Delete ${p.name}`} title={only ? "Keep at least one pipeline." : total > 0 ? "Delete or move its deals first." : undefined} onClick={() => run(() => deletePipeline(p.id), `${p.name} deleted`)}><Trash2 /></Button>
        </div>
      </div>

      <h3 className="mt-4 text-13 font-semibold">Stages</h3>
      <ol className="mt-2 grid gap-2">
        {stages.map((s, i) => {
          const n = s.key ? (counts[s.key] ?? 0) : 0;
          return (
            <li key={s.id} className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="tnum w-5 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
              <Input aria-label={`Stage ${i + 1} name`} value={s.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} className="min-w-40 flex-1" />
              <div className="flex items-center gap-2 max-sm:w-full max-sm:pl-7">
                <Select aria-label={`Stage ${i + 1} kind`} value={s.kind} onChange={(e) => set(i, { kind: e.target.value as StageKind })} className="w-40 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1">
                  {(Object.keys(KIND_LABEL) as StageKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </Select>
                <span className="tnum w-14 text-xs text-muted-foreground">{n ? `${n} ${n === 1 ? "deal" : "deals"}` : ""}</span>
                <Button size="iconSm" variant="ghost" disabled={i === 0} aria-label={`Move ${s.label || "stage"} up`} onClick={() => swap(i, i - 1)}><ArrowUp /></Button>
                <Button size="iconSm" variant="ghost" disabled={i === stages.length - 1} aria-label={`Move ${s.label || "stage"} down`} onClick={() => swap(i, i + 1)}><ArrowDown /></Button>
                <Button size="iconSm" variant="ghost" disabled={n > 0 || stages.length === 1} title={n > 0 ? "Move its deals to another stage first." : undefined} aria-label={`Remove ${s.label || "stage"}`} onClick={() => setStages(stages.filter((_, k) => k !== i))}><X /></Button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={stages.length >= 12} onClick={() => setStages([...stages, { key: null, id: `new-${Date.now()}`, label: "", kind: "open" }])}><Plus /> Add stage</Button>
        <Link href={`/pipeline?p=${p.id}`} className="text-xs font-medium text-primary hover:underline">Open the board</Link>
        {dirty && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setStages(p.stages.map((s) => ({ ...s, key: s.key as string | null, id: s.key })))}>Undo</Button>
            <Button size="sm" variant="primary" disabled={pending || stages.some((s) => !s.label.trim())} onClick={() => run(() => savePipelineStages(p.id, stages.map(({ key, label, kind }) => ({ key, label: label.trim(), kind }))), "Stages saved")}>Save stages</Button>
          </div>
        )}
      </div>
    </article>
  );
}

function NewPipeline({ defaultCurrency, pending, run }: { defaultCurrency: string; pending: boolean; run: (fn: () => Promise<Res>, done: string) => void }) {
  const [template, setTemplate] = React.useState(PIPELINE_TEMPLATES[1].id);
  const t = PIPELINE_TEMPLATES.find((x) => x.id === template) ?? PIPELINE_TEMPLATES[0];
  const [name, setName] = React.useState("");
  const [currency, setCurrency] = React.useState(defaultCurrency);
  return (
    <form
      className="mt-5 max-w-3xl rounded-md border border-dashed border-border-strong p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createPipeline({ name: name.trim() || t.name, template, currency }), `${name.trim() || t.name} added`);
        setName("");
      }}
    >
      <h3 className="text-13 font-semibold">New pipeline</h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Start from" htmlFor="np-template" className="w-40">
          <Select id="np-template" value={template} onChange={(e) => setTemplate(e.target.value)}>
            {PIPELINE_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="Name" htmlFor="np-name" className="min-w-48 flex-1">
          <Input id="np-name" value={name} maxLength={60} placeholder={t.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {t.trackAmount && (
          <Field label="Currency" htmlFor="np-cur" className="w-20">
            <Input id="np-cur" value={currency} maxLength={3} className="font-mono uppercase" onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </Field>
        )}
        <Button type="submit" variant="primary" disabled={pending}>Add pipeline</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t.hint} Stages: {t.stages.map(([label]) => label).join(", ")}. You can change them after.</p>
    </form>
  );
}
