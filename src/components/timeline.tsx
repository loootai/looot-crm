"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, CalendarClock, CheckSquare, MessageSquareText, Phone, Sparkles, Users } from "lucide-react";
import { addActivity, setTaskDone } from "@/app/actions";
import { KIND_ICON } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { clock, dueLabel, longDate } from "@/lib/format";
import type { TimelineEntry } from "@/lib/queries";
import { STAGE_LABEL, type SignalKind, type Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

const KINDS = [
  { id: "note", label: "Note", icon: MessageSquareText, placeholder: "What did you learn?" },
  { id: "call", label: "Call", icon: Phone, placeholder: "Who did you speak to, and what was said?" },
  { id: "meeting", label: "Meeting", icon: Users, placeholder: "Who attended, and what was agreed?" },
  { id: "task", label: "Task", icon: CheckSquare, placeholder: "What needs doing?" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

/** Composer for a note, call, meeting or task. Cmd+Enter saves. */
export function Composer({ companyId, contactId, dealId, compact }: { companyId: string | null; contactId?: string | null; dealId?: string | null; compact?: boolean }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<Kind>("note");
  const [body, setBody] = React.useState("");
  const [due, setDue] = React.useState("");
  const [pending, start] = React.useTransition();
  const save = () => {
    if (!body.trim() || pending) return;
    start(async () => {
      const res = await addActivity({ kind, body, company_id: companyId, contact_id: contactId ?? null, deal_id: dealId ?? null, due_at: kind === "task" && due ? due : null });
      if (!res.ok) return void toast.error(res.error);
      setBody("");
      setDue("");
      router.refresh();
    });
  };
  const current = KINDS.find((k) => k.id === kind)!;
  return (
    <div className="rounded-md border border-border-strong bg-surface focus-within:border-primary">
      <div role="radiogroup" aria-label="Activity type" className="flex gap-0.5 border-b border-border p-1">
        {KINDS.map((k) => (
          <button
            key={k.id}
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cn("flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors duration-100 max-sm:h-9 max-sm:flex-1 max-sm:justify-center", kind === k.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <k.icon className="size-3.5" aria-hidden />
            {k.label}
          </button>
        ))}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
        }}
        placeholder={current.placeholder}
        aria-label={`${current.label} text`}
        rows={compact ? 2 : 3}
        className={cn("resize-none border-0 bg-transparent focus-visible:outline-none", compact ? "min-h-14" : "min-h-[72px]")}
      />
      <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
        {kind === "task" && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" aria-hidden /> Due
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-7 w-36 text-xs" />
          </label>
        )}
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘ Enter to save</span>
        <Button variant="primary" size="sm" onClick={save} disabled={!body.trim() || pending} className="max-sm:ml-auto">
          {pending ? "Saving" : `Save ${current.label.toLowerCase()}`}
        </Button>
      </div>
    </div>
  );
}

const ACT_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  note: MessageSquareText,
  call: Phone,
  meeting: Users,
  task: CheckSquare,
  stage_change: ArrowRight,
  enrichment: Sparkles,
};
const ACT_LABEL: Record<string, string> = { note: "Note", call: "Call", meeting: "Meeting", task: "Task", stage_change: "Stage", enrichment: "Enriched" };

/** One list in reverse time order, grouped by day. Signals are quieter and link to the Intent tab. */
export function Timeline({ entries, intentHref, empty = "Nothing logged yet. Add a note above." }: { entries: TimelineEntry[]; intentHref?: string; empty?: string }) {
  const router = useRouter();
  if (!entries.length) return <p className="py-8 text-13 text-muted-foreground">{empty}</p>;
  const days = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const key = e.at.slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), e]);
  }
  const toggle = async (id: string, done: boolean) => {
    const res = await setTaskDone(id, done);
    if (!res.ok) toast.error(res.error);
    router.refresh();
  };
  return (
    <ol className="grid gap-5">
      {[...days.entries()].map(([day, list]) => (
        <li key={day}>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">{longDate(day)}</h3>
          <ul className="border-t border-border">
            {list.map((e) => {
              const signal = e.type === "signal";
              const Icon = signal ? KIND_ICON[e.kind as SignalKind] : (ACT_ICON[e.kind] ?? MessageSquareText);
              const stage = e.kind === "stage_change" ? stageText(e) : null;
              const due = e.kind === "task" && e.dueAt && !e.doneAt ? dueLabel(e.dueAt) : null;
              return (
                <li key={`${e.type}-${e.id}`} className={cn("flex gap-3 border-b border-border py-2.5", signal && "text-muted-foreground")}>
                  {e.kind === "task" ? (
                    <Checkbox checked={!!e.doneAt} onCheckedChange={(v) => toggle(e.id, v === true)} aria-label={e.doneAt ? "Mark as not done" : "Mark as done"} className="mt-0.5" />
                  ) : (
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("whitespace-pre-wrap text-13 leading-relaxed", e.doneAt && "text-muted-foreground line-through")}>
                      {signal ? (
                        intentHref ? (
                          <a href={intentHref} className="hover:underline">
                            {e.body}
                          </a>
                        ) : (
                          e.body
                        )
                      ) : (
                        (stage ?? e.body)
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span>{signal ? "Signal" : ACT_LABEL[e.kind]}</span>
                      {e.who && <span>with {e.who}</span>}
                      {e.dealName && <span className="truncate">{e.dealName}</span>}
                      {stage && e.body && <span>Reason: {e.body}</span>}
                      {due && <span className={due.overdue ? "font-medium text-warning" : ""}>Due {due.text}</span>}
                      {!signal && <span className="tnum">{clock(e.at)} UTC</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function stageText(e: TimelineEntry): string {
  const from = e.meta.from as Stage | null | undefined;
  const to = e.meta.to as Stage | undefined;
  if (!to) return "Stage changed";
  return from ? `Moved from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}` : `Deal created in ${STAGE_LABEL[to]}`;
}
