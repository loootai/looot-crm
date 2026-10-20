"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ThumbsDown, Trophy } from "lucide-react";
import { createDeal, loadDeal, moveDeal, updateDeal } from "@/app/actions";
import { Monogram, PersonAvatar, ScoreChip, SignalIcon } from "@/components/common";
import { Composer, Timeline } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { dueLabel, fullName, relative } from "@/lib/format";
import { isClosed, type PipelineView } from "@/lib/pipelines";
import type { DealDetail } from "@/lib/queries";
import type { Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

export const LOST_REASONS = ["Chose incumbent", "Chose a competitor", "No budget", "Timing", "No decision", "Other"];

/** Asks for the one-line reason before a deal moves to a won or lost stage. */
export function CloseDealDialog({ deal, stage, kind, label, onClose, onDone }: { deal: { id: string; name: string }; stage: Stage; kind: "won" | "lost"; label: string; onClose: () => void; onDone?: (ok: boolean) => void }) {
  const router = useRouter();
  const [pick, setPick] = React.useState(LOST_REASONS[0]);
  const [text, setText] = React.useState("");
  const [pending, start] = React.useTransition();
  const reason = kind === "won" ? text : pick === "Other" ? text : pick;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await moveDeal(deal.id, stage, undefined, reason);
      if (!res.ok) toast.error(res.error);
      else toast(`${deal.name} moved to ${label}`);
      onDone?.(res.ok);
      onClose();
      router.refresh();
    });
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { onDone?.(false); onClose(); } }}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{label}: {deal.name}</DialogTitle>
            <DialogDescription>One line on why. It is saved on the deal and in the timeline.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            {kind === "lost" && (
              <Field label="Reason" htmlFor="cl-pick">
                <Select id="cl-pick" value={pick} onChange={(e) => setPick(e.target.value)} autoFocus>
                  {LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
            )}
            {(kind === "won" || pick === "Other") && (
              <Field label={kind === "won" ? "Why it worked out" : "What happened"} htmlFor="cl-text">
                <Input id="cl-text" value={text} onChange={(e) => setText(e.target.value)} required maxLength={200} autoFocus={kind === "won"} placeholder={kind === "won" ? "Chosen over a spreadsheet process" : ""} />
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => { onDone?.(false); onClose(); }}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending || !reason.trim()}>{pending ? "Saving" : `Move to ${label}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Creates a deal in one of `pipelines` (one fixed pipeline from the board, or a choice from a
 * company page). A pipeline of people asks for a person, the others for a company.
 */
export function NewDealDialog({ open, onOpenChange, pipelines, companies, people = [], fixedCompany }: { open: boolean; onOpenChange: (o: boolean) => void; pipelines: PipelineView[]; companies: { id: string; name: string }[]; people?: { id: string; name: string }[]; fixedCompany?: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [pipelineId, setPipelineId] = React.useState(pipelines[0]?.id ?? "");
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
  const byPerson = pipeline?.subject === "person";
  const choices = byPerson ? people : companies;
  const missing = !pipeline || (!fixedCompany && choices.length === 0);
  const openStages = pipeline?.stages.filter((s) => s.kind === "open") ?? [];
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pipeline) return;
    const f = new FormData(e.currentTarget);
    start(async () => {
      const res = await createDeal({
        pipeline_id: pipeline.id,
        company_id: byPerson ? null : (fixedCompany ?? String(f.get("subject") ?? "")),
        contact_id: byPerson ? String(f.get("subject") ?? "") : null,
        name: String(f.get("name") ?? ""),
        amount: Number(f.get("amount") || 0),
        stage: String(f.get("stage") ?? openStages[0]?.key ?? ""),
        close_date: String(f.get("close") ?? "") || null,
      });
      if (!res.ok) return setError(res.error);
      setError(null);
      onOpenChange(false);
      toast("Deal created", { action: { label: "Open", onClick: () => router.push(`/pipeline?p=${pipeline.id}&deal=${res.id}`) } });
      router.refresh();
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>New deal{pipelines.length === 1 && pipeline ? ` in ${pipeline.name}` : ""}</DialogTitle>
            <DialogDescription>{byPerson ? "A deal about one person" : "A deal with one company"}. It starts in the stage you pick.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            {pipelines.length > 1 && (
              <Field label="Pipeline" htmlFor="nd-pl"><Select id="nd-pl" value={pipeline?.id} onChange={(e) => setPipelineId(e.target.value)}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            )}
            {!pipeline ? (
              <p className="text-13 text-muted-foreground">No pipeline takes deals with a company yet. <Link href="/settings#pipelines" className="font-medium text-primary hover:underline">Add a pipeline</Link></p>
            ) : missing ? (
              <p className="text-13 text-muted-foreground">{byPerson ? <>Add a person first. <Link href="/people" className="font-medium text-primary hover:underline">Go to People</Link></> : <>Add a company first. <Link href="/companies?new=1" className="font-medium text-primary hover:underline">Add company</Link></>}</p>
            ) : (
              <>
                <Field label="Deal name" htmlFor="nd-name" error={error}><Input id="nd-name" name="name" required autoFocus autoComplete="off" placeholder={byPerson ? "Application, autumn edition" : "Yard scheduling, 4 sites"} /></Field>
                {!fixedCompany && (
                  <Field label={byPerson ? "Person" : "Company"} htmlFor="nd-co"><Select id="nd-co" name="subject" required>{choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                )}
                <div className={cn("grid gap-3", pipeline.trackAmount && "grid-cols-2")}>
                  {pipeline.trackAmount && <Field label={`Value (${pipeline.currency})`} htmlFor="nd-amt"><Input id="nd-amt" name="amount" type="number" min={0} step={100} inputMode="numeric" className="tnum" placeholder="45000" /></Field>}
                  <Field label="Stage" htmlFor="nd-stage"><Select id="nd-stage" name="stage" key={pipeline.id} defaultValue={openStages[0]?.key}>{openStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
                </div>
                <Field label="Expected close" htmlFor="nd-close"><Input id="nd-close" name="close" type="date" /></Field>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending || missing}>{pending ? "Saving" : "Create deal"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deal content, shared by the sheet over the board and by the /deals/[id] page. */
export function DealView({ detail, onChanged, titleSlot }: { detail: DealDetail; onChanged: () => void; titleSlot?: (node: React.ReactNode) => React.ReactNode }) {
  const { deal, company, person, pipeline } = detail;
  const stages = pipeline.stages;
  const kindOf = (key: Stage) => stages.find((s) => s.key === key)?.kind;
  const [closing, setClosing] = React.useState<{ stage: Stage; kind: "won" | "lost"; label: string } | null>(null);
  const [pending, start] = React.useTransition();
  const save = (patch: Parameters<typeof updateDeal>[1]) =>
    start(async () => {
      const res = await updateDeal(deal.id, patch);
      if (!res.ok) toast.error(res.error);
      onChanged();
    });
  const move = (stage: Stage) => {
    if (stage === deal.stage) return;
    const kind = kindOf(stage);
    if (kind === "won" || kind === "lost") return setClosing({ stage, kind, label: stages.find((s) => s.key === stage)?.label ?? stage });
    start(async () => {
      const res = await moveDeal(deal.id, stage);
      if (!res.ok) toast.error(res.error);
      onChanged();
    });
  };
  const now = new Date();
  const due = deal.next_step_due ? dueLabel(deal.next_step_due, now) : null;
  const idx = stages.findIndex((s) => s.key === deal.stage);
  const closed = isClosed(kindOf(deal.stage));
  const closers = stages.filter((s) => isClosed(s.kind));
  const title = (
    <input
      key={deal.name}
      defaultValue={deal.name}
      aria-label="Deal name"
      onBlur={(e) => e.target.value.trim() && e.target.value !== deal.name && save({ name: e.target.value })}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="-mx-1.5 w-full truncate rounded-sm bg-transparent px-1.5 text-base font-semibold tracking-[-0.01em] hover:bg-muted focus-visible:bg-surface"
    />
  );
  return (
    <>
      <div className="shrink-0 border-b border-border px-5 pb-4 pt-4">
        <div className="pr-10">{titleSlot ? titleSlot(title) : title}</div>
        <ol aria-label="Stage" className="mt-3 grid grid-cols-3 gap-1 sm:flex">
          {stages.map(({ key: s, label, kind }, i) => {
            const active = s === deal.stage;
            const past = !closed && i < idx && kind === "open";
            // A closed deal shows its own closing stage, not the other ones.
            const hide = closed && isClosed(kind) && !active;
            return (
              <li key={s} className={cn("min-w-0 flex-1", hide && "hidden")}>
                <button
                  onClick={() => move(s)}
                  aria-current={active ? "step" : undefined}
                  disabled={pending}
                  className={cn(
                    "flex h-7 w-full items-center justify-center gap-1 truncate rounded-sm border px-1 text-xs font-medium transition-colors duration-100 max-sm:h-9",
                    active ? (kind === "lost" ? "border-danger/40 bg-danger-bg text-danger" : "border-primary bg-primary text-primary-foreground") : past ? "border-transparent bg-positive-bg text-positive" : "border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {past && <Check className="size-3 shrink-0" aria-hidden />}
                  <span className="truncate">{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {pipeline.trackAmount && (
            <Field label={`Value (${pipeline.currency})`} htmlFor="dv-amt">
              <Input id="dv-amt" key={deal.amount_cents} type="number" min={0} step={100} defaultValue={deal.amount_cents / 100} className="tnum font-mono" onBlur={(e) => Number(e.target.value) * 100 !== deal.amount_cents && save({ amount: Number(e.target.value) || 0 })} />
            </Field>
          )}
          <Field label="Close date" htmlFor="dv-close">
            <Input id="dv-close" key={deal.close_date} type="date" defaultValue={deal.close_date ?? ""} onBlur={(e) => (e.target.value || null) !== deal.close_date && save({ close_date: e.target.value || null })} />
          </Field>
        </div>
        {closed && deal.closed_reason && <p className="mt-3 text-13 text-muted-foreground">Reason: <span className="text-foreground">{deal.closed_reason}</span></p>}
      </div>
      <div className="scroll-thin grid min-h-0 flex-1 grid-cols-1 content-start gap-6 overflow-y-auto px-5 py-4 [&>*]:min-w-0">
        {person && !deal.company_id && (
          <section aria-labelledby="dv-person">
            <h3 id="dv-person" className="text-13 font-semibold">Person</h3>
            <div className="mt-2 flex items-center gap-2">
              <PersonAvatar name={fullName(person)} />
              <Link href={`/people?contact=${person.id}`} className="min-w-0 truncate text-13 hover:underline"><span className="font-medium">{fullName(person)}</span> <span className="text-muted-foreground">{[person.title, company?.name].filter(Boolean).join(", ")}</span></Link>
            </div>
          </section>
        )}
        {company && deal.company_id && (
        <section aria-labelledby="dv-co">
          <h3 id="dv-co" className="text-13 font-semibold">Why now</h3>
          <div className="mt-2 flex items-center gap-2">
            <Monogram name={company.name} seed={company.domain} />
            <Link href={`/companies/${company.id}?tab=intent`} className="truncate text-13 font-medium hover:underline">{company.name}</Link>
            <ScoreChip score={company.score} />
            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">checked {relative(company.intent_checked_at, now)}</span>
          </div>
          {detail.whyNow.length ? (
            <ul className="mt-2 border-t border-border">
              {detail.whyNow.map((s) => (
                <li key={s.id} className="flex min-h-9 items-center gap-2.5 border-b border-border">
                  <SignalIcon kind={s.kind} />
                  <span className="min-w-0 flex-1 truncate text-13">{s.title}</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{relative(s.occurred_at, now)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-13 text-muted-foreground">No signal in the last 90 days. <Link href={`/companies/${company.id}?tab=intent`} className="font-medium text-primary hover:underline">Open the Intent tab</Link></p>
          )}
        </section>
        )}

        <section aria-labelledby="dv-next">
          <h3 id="dv-next" className="text-13 font-semibold">Next step</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_150px]">
            <Input key={`n-${deal.next_step}`} aria-label="Next step" defaultValue={deal.next_step ?? ""} placeholder="What happens next?" onBlur={(e) => (e.target.value.trim() || null) !== deal.next_step && save({ next_step: e.target.value.trim() || null })} />
            <Input key={`d-${deal.next_step_due}`} aria-label="Next step due date" type="date" defaultValue={deal.next_step_due ?? ""} onBlur={(e) => (e.target.value || null) !== deal.next_step_due && save({ next_step_due: e.target.value || null })} />
          </div>
          {!closed && !deal.next_step && <p className="mt-1.5 text-xs font-medium text-warning">No next step. Deals without one tend to stall.</p>}
          {!closed && deal.next_step && due && <p className={cn("mt-1.5 text-xs", due.overdue ? "font-medium text-warning" : "text-muted-foreground")}>{due.overdue ? due.text : `Due ${due.text}`}</p>}
        </section>

        {deal.company_id && (
        <section aria-labelledby="dv-people">
          <h3 id="dv-people" className="text-13 font-semibold">Contacts on the deal</h3>
          {detail.people.length ? (
            <ul className="mt-2 border-t border-border">
              {detail.people.map(({ contact, role }) => (
                <li key={contact.id} className="flex min-h-10 items-center gap-2.5 border-b border-border">
                  <PersonAvatar name={fullName(contact)} />
                  <Link href={`/people?contact=${contact.id}`} className="min-w-0 flex-1 truncate text-13 hover:underline">
                    <span className="font-medium">{fullName(contact)}</span> <span className="text-muted-foreground">{contact.title}</span>
                  </Link>
                  <Badge tone={role === "champion" ? "positive" : "muted"}>{role}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-13 text-muted-foreground">No contact linked yet.</p>
          )}
        </section>
        )}

        <section aria-labelledby="dv-tl">
          <h3 id="dv-tl" className="mb-2 text-13 font-semibold">Timeline</h3>
          <Composer companyId={company?.id ?? null} contactId={deal.contact_id} dealId={deal.id} compact />
          <div className="mt-4"><Timeline entries={detail.timeline} empty="Nothing logged on this deal yet." /></div>
        </section>
      </div>
      {!closed && closers.length > 0 && (
        <div className="flex shrink-0 gap-2 border-t border-border bg-surface px-5 py-3">
          {closers.map((s) => (
            <Button key={s.key} onClick={() => setClosing({ stage: s.key, kind: s.kind as "won" | "lost", label: s.label })} className="flex-1">
              {s.kind === "won" ? <Trophy /> : <ThumbsDown />} {s.label}
            </Button>
          ))}
        </div>
      )}
      {closing && <CloseDealDialog deal={deal} stage={closing.stage} kind={closing.kind} label={closing.label} onClose={() => setClosing(null)} onDone={(ok) => ok && onChanged()} />}
    </>
  );
}

/** The deal as a right-side sheet over the board. Loads by id, so the URL can be shared and reloaded. */
export function DealSheet({ dealId, onClose, version }: { dealId: string; onClose: () => void; version: number }) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<DealDetail | null | undefined>(undefined);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    loadDeal(dealId).then((d) => alive && setDetail(d));
    return () => { alive = false; };
  }, [dealId, tick, version]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-[560px]" aria-describedby={undefined}>
        {detail === undefined ? (
          <div className="grid gap-3 p-5" aria-busy="true">
            <DialogTitle className="sr-only">Loading deal</DialogTitle>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : detail === null ? (
          <div className="p-5">
            <DialogTitle>This deal does not exist</DialogTitle>
            <p className="mt-1 text-13 text-muted-foreground">It was deleted, or it belongs to another account.</p>
          </div>
        ) : (
          <DealView detail={detail} onChanged={() => { setTick((t) => t + 1); router.refresh(); }} titleSlot={(node) => <><DialogTitle className="sr-only">{detail.deal.name}</DialogTitle>{node}</>} />
        )}
      </SheetContent>
    </Dialog>
  );
}

/** The same content as a page, for the direct /deals/[id] URL. */
export function DealPageView({ detail }: { detail: DealDetail }) {
  const router = useRouter();
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col rounded-md border border-border bg-surface">
      <DealView detail={detail} onChanged={() => router.refresh()} />
    </div>
  );
}
