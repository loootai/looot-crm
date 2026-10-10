"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, X } from "lucide-react";
import { deleteAllData, saveSettings } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { usd2 } from "@/lib/format";
import { DEFAULT_WEIGHTS } from "@/lib/score";
import type { TableName, Weights } from "@/lib/types";

const WEIGHT_FIELDS: [keyof Weights, string][] = [["funding", "Funding round"], ["hiring", "Matching open role"], ["tech", "Tech added or removed"], ["news_tagged", "Tagged news"], ["news_other", "Other news"], ["site", "Watched page changed"]];

function TagInput({ id, values, onChange, placeholder, validate }: { id: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; validate?: (v: string) => string | null }) {
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    const problem = validate?.(v) ?? null;
    if (problem) return setError(problem);
    if (!values.includes(v)) onChange([...values, v]);
    setDraft("");
    setError(null);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-surface pl-2 pr-0.5 text-13">
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="grid size-6 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3" /></button>
          </span>
        ))}
        <Input id={id} value={draft} onChange={(e) => { setDraft(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder} className="h-7 w-48" aria-invalid={!!error} />
      </div>
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function SettingsForm({ initial, perActionMax, bulkMax }: { initial: { role_keywords: string[]; default_pages: string[]; weights: Weights; action_ceiling_usd: number | null }; perActionMax: number; bulkMax: number }) {
  const router = useRouter();
  const [keywords, setKeywords] = React.useState(initial.role_keywords);
  const [pages, setPages] = React.useState(initial.default_pages);
  const [weights, setWeights] = React.useState<Weights>(initial.weights);
  const [ceiling, setCeiling] = React.useState(initial.action_ceiling_usd === null ? "" : String(initial.action_ceiling_usd));
  const [pending, start] = React.useTransition();
  const ceilingNum = ceiling.trim() ? Number(ceiling) : null;
  const ceilingError = ceilingNum !== null && (!Number.isFinite(ceilingNum) || ceilingNum <= 0) ? "Enter an amount above zero, or leave it empty." : ceilingNum !== null && ceilingNum > perActionMax ? `The server limit is ${usd2(perActionMax)}. A higher value here has no effect.` : null;
  const save = () =>
    start(async () => {
      const res = await saveSettings({ role_keywords: keywords, default_pages: pages, weights, action_ceiling_usd: ceilingNum });
      if (!res.ok) return void toast.error(res.error);
      toast("Settings saved");
      router.refresh();
    });
  return (
    <>
      <section id="intent" aria-labelledby="intent-h" className="scroll-mt-16 border-b border-border py-6">
        <h2 id="intent-h" className="text-base font-semibold">Intent</h2>
        <div className="mt-4 grid gap-5">
          <Field label="Role keywords" htmlFor="kw" hint="A job posting counts as a hiring signal when its title contains one of these. Press Enter to add.">
            <TagInput id="kw" values={keywords} onChange={setKeywords} placeholder="Add a keyword" />
          </Field>
          <Field label="Watched pages" htmlFor="pg" hint="Paths checked for changes on every new company. A page read costs about $0.001.">
            <TagInput id="pg" values={pages} onChange={setPages} placeholder="/pricing" validate={(v) => (/^\/[\w\-./]*$/.test(v) ? null : "A path starts with / and has no spaces, such as /pricing.")} />
          </Field>
          <fieldset>
            <legend className="text-xs font-medium">Score weights</legend>
            <p className="mt-1 text-xs text-muted-foreground">Points a new signal is worth before decay. Caps per kind stay fixed: funding 30, hiring 24, tech 20, news 16, site 10.</p>
            <div className="mt-2 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
              {WEIGHT_FIELDS.map(([k, label]) => (
                <Field key={k} label={label} htmlFor={`w-${k}`}>
                  <Input id={`w-${k}`} type="number" min={0} max={100} value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="tnum font-mono" />
                </Field>
              ))}
            </div>
            <button onClick={() => setWeights(DEFAULT_WEIGHTS)} className="mt-2 rounded-sm text-xs font-medium text-primary hover:underline">Reset to defaults</button>
          </fieldset>
        </div>
      </section>

      <section aria-labelledby="spend-h" className="border-b border-border py-6">
        <h2 id="spend-h" className="text-base font-semibold">Spending</h2>
        <dl className="mt-4 grid max-w-2xl gap-x-8 gap-y-3 text-13 sm:grid-cols-2">
          <div className="flex justify-between border-b border-border pb-2"><dt className="text-muted-foreground">Most one action may spend <span className="font-mono text-xs">PER_ACTION_MAX_USD</span></dt><dd className="tnum font-mono">{usd2(perActionMax)}</dd></div>
          <div className="flex justify-between border-b border-border pb-2"><dt className="text-muted-foreground">Most records per action <span className="font-mono text-xs">BULK_MAX_RECORDS</span></dt><dd className="tnum font-mono">{bulkMax}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">These two are set in the server environment and are read-only here.</p>
        <Field label="Your ceiling per action (USD)" htmlFor="ceil" hint="Optional. Lowers the most any quote lets you confirm." error={ceilingError} className="mt-4 max-w-xs">
          <Input id="ceil" type="number" min={0} step={0.05} value={ceiling} onChange={(e) => setCeiling(e.target.value)} placeholder={perActionMax.toFixed(2)} className="tnum w-32 font-mono" aria-invalid={!!ceilingError} />
        </Field>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <Button variant="primary" onClick={save} disabled={pending || (!!ceilingError && ceilingNum !== null && ceilingNum <= 0)}>{pending ? "Saving" : "Save settings"}</Button>
      </div>
    </>
  );
}

const EXPORTS: [TableName, string][] = [["companies", "Companies"], ["contacts", "Contacts"], ["deals", "Deals"], ["activities", "Activities"], ["signals", "Signals"], ["actions", "Actions"], ["runs", "Runs"]];

export function DataSection({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <section aria-labelledby="data-h" className="py-6">
      <h2 id="data-h" className="text-base font-semibold">Data</h2>
      <p className="mt-1 text-13 text-muted-foreground">Export any table as CSV. Your data stays in your own Supabase project.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXPORTS.map(([t, label]) => (
          <Button key={t} asChild size="sm"><a href={`/api/export?table=${t}`} download><Download /> {label}</a></Button>
        ))}
      </div>
      <div className="mt-6 max-w-xl rounded-md border border-danger/30 p-4">
        <h3 className="text-13 font-semibold">Delete account data</h3>
        <p className="mt-1 text-13 text-muted-foreground">Removes every company, contact, deal, signal and spend record you own. Your sign-in stays. This cannot be undone.{demo ? " In demo mode the seed data returns when the server restarts." : ""}</p>
        <Button variant="danger" size="sm" className="mt-3" onClick={() => setOpen(true)}>Delete all my data</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" role="alertdialog">
          <DialogHeader>
            <DialogTitle>Delete all your data?</DialogTitle>
            <DialogDescription>Export first if you need a copy. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label='Type "delete" to confirm' htmlFor="del-confirm"><Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoFocus /></Field>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={confirm !== "delete" || pending} onClick={() => start(async () => { const res = await deleteAllData(confirm); if (!res.ok) return void toast.error(res.error); toast("All data deleted"); setOpen(false); router.push("/"); router.refresh(); })}>
              {pending ? "Deleting" : "Delete everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
