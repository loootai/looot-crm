"use client";

import * as React from "react";
import { ChevronRight, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Td } from "@/components/ui/table";
import { clock, shortDate, usd2, usd4 } from "@/lib/format";
import type { SpendData } from "@/lib/queries";
import type { ActionKind, ActionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND: Record<ActionKind, string> = { intent_refresh: "Refresh intent", contact_enrich: "Enrich contact", company_enrich: "Enrich company", find_people: "Find people", email_verify: "Verify emails" };
const STATUS: Record<ActionStatus, { label: string; tone: "positive" | "neutral" | "warning" | "danger" | "muted" }> = {
  done: { label: "done", tone: "positive" },
  partial: { label: "partial", tone: "neutral" },
  running: { label: "running", tone: "muted" },
  failed: { label: "failed", tone: "danger" },
  stopped_at_max: { label: "stopped at max", tone: "warning" },
};
const OUTCOME: Record<string, string> = { data: "data", no_result: "no result", failed: "failed", skipped: "skipped" };

/** One action with its runs. The row expands to list each run with its looot run id and idempotency key. */
export function ActionRow({ action }: { action: SpendData["actions"][number] }) {
  const [open, setOpen] = React.useState(false);
  const over = action.actual_usd > action.max_cost_usd + 1e-9 || action.runTotal > action.max_cost_usd + 1e-9;
  const copy = (v: string) => navigator.clipboard?.writeText(v).catch(() => {});
  return (
    <>
      <tr className={cn("cursor-pointer transition-colors duration-100 hover:bg-muted", over && "bg-danger-bg")} onClick={() => setOpen((v) => !v)}>
        <Td className="w-9 pr-0">
          <button aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the ${action.runs.length} runs of this action`} className="grid size-6 place-items-center rounded-sm text-muted-foreground hover:bg-border" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
            <ChevronRight className={cn("size-4 transition-transform duration-100", open && "rotate-90")} />
          </button>
        </Td>
        <Td className="tnum whitespace-nowrap text-muted-foreground">{shortDate(action.created_at)} <span className="max-lg:hidden">{clock(action.created_at)}</span></Td>
        <Td className="whitespace-nowrap font-medium">{KIND[action.kind]}</Td>
        <Td className="max-w-64 truncate">{action.target_label ?? `${action.target_count} records`}</Td>
        <Td className="tnum text-right">{action.runs.length}</Td>
        <Td className="tnum text-right font-mono text-xs text-muted-foreground">{usd4(action.estimate_usd)}</Td>
        <Td className="tnum text-right font-mono text-xs text-muted-foreground">{usd2(action.max_cost_usd)}</Td>
        <Td className="tnum text-right font-mono text-xs font-medium">{usd4(action.actual_usd)}</Td>
        <Td><Badge tone={STATUS[action.status].tone}>{STATUS[action.status].label}</Badge></Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} className="border-b border-border bg-background px-3 py-2 sm:pl-12">
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th scope="col" className="h-7 font-medium">looot job</th>
                    <th scope="col" className="h-7 font-medium">Run id</th>
                    <th scope="col" className="h-7 font-medium">Result</th>
                    <th scope="col" className="h-7 text-right font-medium">Cap</th>
                    <th scope="col" className="h-7 text-right font-medium">Cost</th>
                    <th scope="col" className="h-7 pl-4 font-medium">Idempotency key</th>
                  </tr>
                </thead>
                <tbody>
                  {action.runs.map((r) => (
                    <tr key={r.id}>
                      <td className="h-7 border-t border-border font-mono">{r.job_id}</td>
                      <td className="h-7 border-t border-border font-mono">
                        {r.looot_run_id ? (
                          <span className="inline-flex items-center gap-1">
                            {r.looot_run_id}
                            <button onClick={() => copy(r.looot_run_id!)} aria-label="Copy the run id" className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"><Copy className="size-3" /></button>
                          </span>
                        ) : <span className="text-muted-foreground">not run</span>}
                      </td>
                      <td className={cn("h-7 border-t border-border", r.outcome === "failed" ? "text-danger" : r.outcome === "skipped" ? "text-warning" : "")}>
                        {OUTCOME[r.outcome ?? ""] ?? r.status ?? "queued"}
                        {(r.error || r.note) && <span className="text-muted-foreground">: {r.error ?? r.note}</span>}
                      </td>
                      <td className="tnum h-7 border-t border-border text-right font-mono text-muted-foreground">{r.cap_usd === null ? "" : usd4(r.cap_usd)}</td>
                      <td className="tnum h-7 border-t border-border text-right font-mono">{usd4(r.cost_usd)}</td>
                      <td className="h-7 max-w-80 truncate border-t border-border pl-4 font-mono text-muted-foreground" title={r.idempotency_key}>{r.idempotency_key}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
