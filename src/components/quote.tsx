"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, CircleDashed, Loader2, Minus, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Candidate } from "@/lib/apply";
import { relative, usd2, usd4 } from "@/lib/format";
import type { QuoteRow, StepId } from "@/lib/plan";
import type { Action, ActionKind, Run } from "@/lib/types";

export interface QuoteRequest {
  kind: ActionKind;
  targetIds: string[];
  steps?: StepId[];
  options?: { keywords?: string[]; limit?: number };
  /** Called when the action has ended, with the people found for a find_people action. */
  onDone?: (result: { action: Action; runs: Run[]; candidates?: Candidate[] }) => void;
}

interface Quote {
  title: string;
  rows: QuoteRow[];
  estimate: number;
  worstCase: number;
  ceiling: number;
  priceSource: "catalog" | "fallback";
  priceReadAt: string;
  demo: boolean;
  tokenMissing: boolean;
}

const QuoteContext = React.createContext<(req: QuoteRequest) => void>(() => {});
/** Opens the quote dialog. Every paid action goes through it. Nothing calls looot before the user confirms. */
export const useQuote = () => React.useContext(QuoteContext);

export function QuoteProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = React.useState<(QuoteRequest & { actionKey: string }) | null>(null);
  const open = React.useCallback((r: QuoteRequest) => setReq({ ...r, actionKey: crypto.randomUUID() }), []);
  return (
    <QuoteContext.Provider value={open}>
      {children}
      {req && <QuoteDialog key={req.actionKey} req={req} onClose={() => setReq(null)} />}
    </QuoteContext.Provider>
  );
}

const ceilCents = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;
type Phase = "loading" | "quote" | "running" | "done" | "error";

function QuoteDialog({ req, onClose }: { req: QuoteRequest & { actionKey: string }; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [off, setOff] = React.useState<Set<StepId>>(new Set());
  const [max, setMax] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [action, setAction] = React.useState<Action | null>(null);
  const maxRef = React.useRef<HTMLInputElement>(null);
  const openRef = React.useRef(true);

  const [attempt, setAttempt] = React.useState(0);
  const loadQuote = () => {
    setPhase("loading");
    setError(null);
    setAttempt((n) => n + 1);
  };

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: req.kind, targetIds: req.targetIds, steps: req.steps, options: req.options }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? "The quote could not be built.");
        if (!alive) return;
        setQuote(body);
        setMax(Math.min(ceilCents(body.worstCase), body.ceiling).toFixed(2));
        setPhase("quote");
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "The quote could not be built. Check your connection.");
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [req, attempt]);

  React.useEffect(() => {
    openRef.current = true;
    return () => {
      openRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (phase === "quote") maxRef.current?.select();
  }, [phase]);

  const rows = (quote?.rows ?? []).filter((r) => !off.has(r.step));
  const estimate = rows.reduce((s, r) => s + r.estimate, 0);
  const worst = rows.reduce((s, r) => s + r.cap, 0);
  const cheapest = rows.length ? Math.min(...rows.map((r) => r.estimate / r.runs)) : 0;
  const maxNum = Number(max.replace(",", "."));
  const overCeiling = quote ? maxNum > quote.ceiling + 1e-9 : false;
  const effMax = quote ? Math.min(maxNum, quote.ceiling) : maxNum;
  const blocked = !quote
    ? "Loading"
    : quote.tokenMissing
      ? "LOOOT_TOKEN is not set on the server. Add it to .env.local"
      : !rows.length
        ? "Pick at least one step."
        : !Number.isFinite(maxNum) || maxNum <= 0
          ? "Enter the most you want to spend."
          : effMax < cheapest - 1e-9
            ? `The max is below the cheapest step (${usd4(cheapest)}).`
            : null;

  const toggle = (step: StepId) => {
    const next = new Set(off);
    if (next.has(step)) next.delete(step);
    else next.add(step);
    setOff(next);
    if (!touched && quote) {
      const w = quote.rows.filter((r) => !next.has(r.step)).reduce((s, r) => s + r.cap, 0);
      setMax(Math.min(ceilCents(w), quote.ceiling).toFixed(2));
    }
  };

  const run = async () => {
    if (!quote || blocked) return;
    setPhase("running");
    setError(null);
    const steps = rows.map((r) => r.step);
    let stop = false;
    const poll = async () => {
      while (!stop) {
        await new Promise((r) => setTimeout(r, 700));
        if (stop) return;
        try {
          const res = await fetch(`/api/actions/${req.actionKey}`, { cache: "no-store" });
          if (res.ok && !stop) {
            const b = await res.json();
            setRuns(b.runs);
            setAction(b.action);
          }
        } catch {
          // The POST below reports a real failure. A missed poll is not one.
        }
      }
    };
    void poll();
    try {
      const res = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionKey: req.actionKey, kind: req.kind, targetIds: req.targetIds, steps, options: req.options, maxCostUsd: effMax }) });
      const body = await res.json();
      stop = true;
      if (!res.ok) throw new Error(body?.error?.message ?? "The action could not start.");
      setRuns(body.runs);
      setAction(body.action);
      setPhase("done");
      router.refresh();
      req.onDone?.(body);
      if (!openRef.current) toast(`${quote.title}: spent ${usd4(body.action.actual_usd)} of ${usd2(body.action.max_cost_usd)}`, { description: summary(body.runs) });
    } catch (e) {
      stop = true;
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "The network request failed. Retrying uses the same action id, so nothing is charged twice.");
      setPhase("error");
      if (!openRef.current) toast.error(`${quote.title} did not finish`);
    }
  };

  const close = () => {
    openRef.current = false;
    onClose();
  };
  const runLabel = quote?.demo ? "Run (demo, no charge)" : `Run for up to ${usd2(effMax)}`;
  const ran = phase === "running" || phase === "done" || (phase === "error" && runs.length > 0);

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent top className="max-w-[600px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{quote?.title ?? "Building the quote"}</DialogTitle>
          <DialogDescription>
            {phase === "done" ? "Finished. Every run is listed in Spend." : phase === "running" ? "Running. You can close this, a toast reports the end." : "Check the cost, set the most you want to spend, then run. Nothing has been spent yet."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="px-0 py-0">
          {phase === "loading" && (
            <div className="grid gap-3 px-5 py-5" aria-busy="true" aria-label="Building the quote">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}
          {phase === "error" && !ran && (
            <div className="flex items-start gap-3 px-5 py-5" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <p className="text-13">{error}</p>
            </div>
          )}
          {quote && phase !== "loading" && (phase !== "error" || ran) && (
            <>
              {quote.rows.length === 0 ? (
                <p className="px-5 py-6 text-13 text-muted-foreground">Nothing to run. Every value this action would look for is already filled in.</p>
              ) : (
                <div className="relative overflow-x-auto">
                  <table className="w-full text-13 sm:min-w-[480px]">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th scope="col" className="h-9 pl-5 pr-2 font-medium">Step</th>
                        <th scope="col" className="hidden h-9 px-2 font-medium sm:table-cell">looot job</th>
                        <th scope="col" className="hidden h-9 px-2 text-right font-medium sm:table-cell">Runs</th>
                        <th scope="col" className="h-9 px-2 text-right font-medium">{ran ? "Result" : "Estimate"}</th>
                        <th scope="col" className="h-9 pl-2 pr-5 text-right font-medium">Cap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.rows.map((r) => {
                        const checked = !off.has(r.step);
                        const mine = runs.filter((x) => x.step === r.step);
                        return (
                          <tr key={r.step} className={checked ? "" : "text-muted-foreground"}>
                            <td className="h-12 border-t border-border py-1.5 pl-5 pr-2 sm:h-10">
                              <span className="flex items-center gap-2.5">
                                {ran ? <StepIcon runs={mine} total={r.runs} skipped={!checked} /> : <Checkbox id={`step-${r.step}`} checked={checked} onCheckedChange={() => toggle(r.step)} aria-label={`Include ${r.label}`} />}
                                <label htmlFor={`step-${r.step}`} className="font-medium">
                                  {r.label}
                                  <span className="block font-mono text-xs font-normal text-muted-foreground sm:hidden">
                                    {r.jobId}
                                    {r.runs > 1 ? ` x ${r.runs}` : ""}
                                  </span>
                                </label>
                              </span>
                            </td>
                            <td className="hidden h-10 border-t border-border px-2 font-mono text-xs sm:table-cell">{r.jobId}</td>
                            <td className="tnum hidden h-10 border-t border-border px-2 text-right sm:table-cell">{r.runs}</td>
                            <td className="tnum h-10 border-t border-border px-2 text-right font-mono text-xs">{ran ? <StepResult runs={mine} total={r.runs} skipped={!checked} /> : usd4(r.estimate)}</td>
                            <td className="tnum h-10 border-t border-border pl-2 pr-5 text-right font-mono text-xs text-muted-foreground">{usd2(r.cap)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {quote.rows.length > 0 && !ran && (
                <div className="grid gap-3 border-t border-border px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <p className="text-13">
                      Estimated <span className="tnum font-mono font-medium">{usd4(estimate)}</span>
                      <span className="text-muted-foreground"> · worst case </span>
                      <span className="tnum font-mono text-muted-foreground">{usd2(worst)}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {quote.priceSource === "catalog" ? `Prices from the looot catalog, read ${relative(quote.priceReadAt)}.` : `Catalog unreachable, using prices saved on ${quote.priceReadAt}.`} A failed run costs nothing.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="quote-max">Most to spend</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-13 text-muted-foreground">$</span>
                      <Input
                        id="quote-max"
                        ref={maxRef}
                        inputMode="decimal"
                        type="text"
                        autoComplete="off"
                        value={max}
                        onChange={(e) => {
                          setMax(e.target.value);
                          setTouched(true);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && run()}
                        aria-describedby="quote-max-note"
                        aria-invalid={!!blocked && touched}
                        className="tnum w-full pl-6 font-mono sm:w-32"
                      />
                    </div>
                  </div>
                  <p id="quote-max-note" className="text-xs sm:col-span-2" aria-live="polite">
                    {blocked && rows.length > 0 ? <span className="text-danger">{blocked}</span> : overCeiling ? <span className="text-warning">Limited to {usd2(quote.ceiling)} per action by your spending limit.</span> : <span className="text-muted-foreground">Each run is capped. When the max cannot cover the next step, the action stops.</span>}
                  </p>
                </div>
              )}
              {ran && (
                <div className="border-t border-border px-5 py-4" aria-live="polite">
                  {phase === "running" && (
                    <p className="flex items-center gap-2 text-13">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                      Spent <span className="tnum font-mono">{usd4(action?.actual_usd ?? 0)}</span> of <span className="tnum font-mono">{usd2(effMax)}</span> so far
                    </p>
                  )}
                  {phase === "done" && action && (
                    <>
                      <p className="text-13 font-medium">
                        Spent <span className="tnum font-mono">{usd4(action.actual_usd)}</span> of <span className="tnum font-mono">{usd2(action.max_cost_usd)}</span>. {summary(runs)}
                      </p>
                      {action.status === "stopped_at_max" && <p className="mt-1 text-13 text-warning">Stopped at your max. The steps left were not run and cost nothing.</p>}
                      {runs.find((x) => x.error) && <p className="mt-1 text-13 text-danger">{runs.find((x) => x.error)!.error} $0.</p>}
                      <Link href="/spend" onClick={close} className="mt-2 inline-block text-13 font-medium text-primary underline-offset-2 hover:underline">
                        View in Spend
                      </Link>
                    </>
                  )}
                  {phase === "error" && <p className="text-13 text-danger">{error}</p>}
                </div>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {phase === "done" ? (
            <Button variant="primary" onClick={close} autoFocus>
              Done
            </Button>
          ) : phase === "error" ? (
            <>
              <Button onClick={close}>Close</Button>
              <Button variant="primary" onClick={ran ? run : loadQuote}>
                <RotateCw /> Try again
              </Button>
            </>
          ) : (
            <>
              <Button onClick={close}>{phase === "running" ? "Close" : "Cancel"}</Button>
              <Button variant="primary" onClick={run} disabled={phase !== "quote" || !!blocked} title={blocked ?? undefined}>
                {phase === "running" && <Loader2 className="animate-spin" />}
                {phase === "running" ? "Running" : runLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function summary(runs: Run[]): string {
  const ran = runs.filter((r) => r.outcome && r.outcome !== "skipped");
  const data = ran.filter((r) => r.outcome === "data").length;
  const total = runs.length;
  return `${data} of ${total} ${total === 1 ? "step" : "steps"} returned data.`;
}

function StepIcon({ runs, total, skipped }: { runs: Run[]; total: number; skipped: boolean }) {
  if (skipped) return <Minus className="size-4 text-muted-foreground" aria-hidden />;
  if (!runs.length) return <CircleDashed className="size-4 text-muted-foreground" aria-hidden />;
  if (runs.some((r) => r.status === "running" && !r.outcome)) return <Loader2 className="size-4 animate-spin text-primary" aria-hidden />;
  if (runs.length < total) return <Loader2 className="size-4 animate-spin text-primary" aria-hidden />;
  if (runs.every((r) => r.outcome === "failed")) return <X className="size-4 text-danger" aria-hidden />;
  if (runs.every((r) => r.outcome === "skipped")) return <Minus className="size-4 text-warning" aria-hidden />;
  return <Check className="size-4 text-accent" aria-hidden />;
}

function StepResult({ runs, total, skipped }: { runs: Run[]; total: number; skipped: boolean }) {
  if (skipped) return <span className="font-sans text-muted-foreground">left out</span>;
  if (!runs.length) return <span className="font-sans text-muted-foreground">queued</span>;
  const cost = runs.reduce((s, r) => s + r.cost_usd, 0);
  const finished = runs.filter((r) => r.outcome);
  if (finished.length < Math.min(total, runs.length) || runs.length < total) return <span className="font-sans">{total > 1 ? `running ${finished.length} of ${total}` : "running"}</span>;
  if (total > 1) {
    const data = runs.filter((r) => r.outcome === "data").length;
    return (
      <span>
        <span className="font-sans">{data} of {total} found </span>
        {usd4(cost)}
      </span>
    );
  }
  const r = runs[0];
  const word = r.outcome === "data" ? "done" : r.outcome === "no_result" ? "no result" : r.outcome === "failed" ? "failed" : "skipped";
  return (
    <span className={r.outcome === "failed" ? "text-danger" : r.outcome === "skipped" ? "text-warning" : ""} title={r.note ?? r.error ?? undefined}>
      <span className="font-sans">{word} </span>
      {usd4(cost)}
    </span>
  );
}
