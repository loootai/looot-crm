"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, CalendarDays, ChevronsLeftRight, Ellipsis, KanbanSquare, Plus, Rows3 } from "lucide-react";
import { moveDeal } from "@/app/actions";
import { EmptyState, Monogram, ScoreChip } from "@/components/common";
import { useHotkeys } from "@/components/shell/hotkeys";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/popover";
import { Table, Td, Th } from "@/components/ui/table";
import { dueLabel, money, moneyShort, shortDate } from "@/lib/format";
import type { DealCard } from "@/lib/queries";
import { STAGE_LABEL, STAGES, type Stage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CloseDealDialog, DealSheet, NewDealDialog } from "./DealView";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function Board({ deals: serverDeals, companies }: { deals: DealCard[]; companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [deals, setDeals] = React.useState(serverDeals);
  const [version, setVersion] = React.useState(0);
  const [seen, setSeen] = React.useState(serverDeals);
  // New data from the server replaces the optimistic copy. Adjusted during render, not in an effect.
  if (seen !== serverDeals) {
    setSeen(serverDeals);
    setDeals(serverDeals);
    setVersion((v) => v + 1);
  }
  const [view, setView] = React.useState<"board" | "table">("board");
  const [month, setMonth] = React.useState("");
  const [hot, setHot] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<Stage>>(new Set());
  const [mobileStage, setMobileStage] = React.useState<Stage>("lead");
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [addingLocal, setAdding] = React.useState(false);
  const adding = addingLocal || sp.get("new") === "1";
  const [closing, setClosing] = React.useState<{ deal: DealCard; stage: "won" | "lost" } | null>(null);
  const openId = sp.get("deal");
  const now = React.useMemo(() => new Date(), []);

  const setParam = (key: string, value: string | null) => {
    const q = new URLSearchParams(sp.toString());
    q.delete("new");
    if (value) q.set(key, value);
    else q.delete(key);
    router.replace(q.size ? `${path}?${q}` : path, { scroll: false });
  };
  const openDeal = (id: string | null) => setParam("deal", id);

  const months = [...new Set(deals.map((d) => d.closeDate?.slice(0, 7)).filter((m): m is string => !!m))].sort();
  const visible = deals.filter((d) => (!month || d.closeDate?.startsWith(month)) && (!hot || d.score >= 60));
  const byStage = (s: Stage) => visible.filter((d) => d.stage === s).sort((a, b) => a.position - b.position);

  /** Optimistic move. Rolls back with a toast when the server refuses. */
  const commit = (deal: DealCard, stage: Stage, index?: number) => {
    if (stage !== deal.stage && (stage === "won" || stage === "lost")) return setClosing({ deal, stage });
    const before = deals;
    const column = deals.filter((d) => d.stage === stage && d.id !== deal.id).sort((a, b) => a.position - b.position);
    const i = index === undefined ? column.length : Math.max(0, Math.min(column.length, index));
    const prev = column[i - 1]?.position;
    const next = column[i]?.position;
    const position = prev === undefined ? (next === undefined ? 1000 : next / 2) : next === undefined ? prev + 1000 : (prev + next) / 2;
    if (stage === deal.stage && position === deal.position) return;
    setDeals(deals.map((d) => (d.id === deal.id ? { ...d, stage, position } : d)));
    void moveDeal(deal.id, stage, position).then((res) => {
      if (!res.ok) {
        setDeals(before);
        toast.error(`${deal.name} was not moved. ${res.error}`);
      } else {
        if (stage !== deal.stage) toast(`${deal.name} moved to ${STAGE_LABEL[stage]}`);
        router.refresh();
      }
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const deal = deals.find((d) => d.id === e.active.id);
    if (!deal || !e.over) return;
    const overId = String(e.over.id);
    if (overId.startsWith("col:")) return commit(deal, overId.slice(4) as Stage);
    const target = deals.find((d) => d.id === overId);
    if (!target || target.id === deal.id) return;
    const column = deals.filter((d) => d.stage === target.stage && d.id !== deal.id).sort((a, b) => a.position - b.position);
    let index = column.findIndex((d) => d.id === target.id);
    if (deal.stage === target.stage && deal.position < target.position) index += 1;
    commit(deal, target.stage, index);
  };

  useHotkeys({ n: (e) => { e.preventDefault(); setAdding(true); } });
  const active = dragging ? deals.find((d) => d.id === dragging) : null;
  const overlays = (
    <>
      <NewDealDialog open={adding} onOpenChange={(o) => { setAdding(o); if (!o && sp.get("new")) setParam("new", null); }} companies={companies} />
      {closing && <CloseDealDialog deal={closing.deal} stage={closing.stage} onClose={() => setClosing(null)} />}
      {openId && <DealSheet dealId={openId} onClose={() => openDeal(null)} version={version} />}
    </>
  );
  const cardProps = { now, onOpen: openDeal, onMove: commit };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6">
        <div role="radiogroup" aria-label="View" className="flex rounded-md border border-border-strong bg-surface p-0.5 max-md:hidden">
          {([["board", "Board", KanbanSquare], ["table", "Table", Rows3]] as const).map(([id, label, Icon]) => (
            <button key={id} role="radio" aria-checked={view === id} onClick={() => setView(id)} className={cn("flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors duration-100", view === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <Select aria-label="Close month" value={month} onChange={(e) => setMonth(e.target.value)} className={cn("h-7 w-auto text-xs font-medium max-sm:h-9", month ? "border-primary bg-positive-bg text-positive" : "text-muted-foreground")}>
          <option value="">Closing any month</option>
          {months.map((m) => <option key={m} value={m}>Closing {MONTH.format(new Date(`${m}-01T00:00:00Z`))}</option>)}
        </Select>
        <button aria-pressed={hot} onClick={() => setHot((v) => !v)} className={cn("inline-flex h-7 items-center rounded-sm border px-2 text-xs font-medium transition-colors duration-100 max-sm:h-9 max-sm:px-3", hot ? "border-primary bg-positive-bg text-positive" : "border-border-strong bg-surface text-muted-foreground hover:bg-muted")}>
          Score 60+
        </button>
        <Button variant="primary" onClick={() => setAdding(true)} className="ml-auto"><Plus /> New deal</Button>
      </div>

      {view === "table" ? (
        <div className="scroll-thin mx-4 mt-3 relative overflow-x-auto rounded-md border border-border bg-surface max-md:hidden sm:mx-6">
          <Table className="min-w-[900px]">
            <thead><tr><Th>Deal</Th><Th>Company</Th><Th>Stage</Th><Th className="text-right">Value</Th><Th>Score</Th><Th>Next step</Th><Th>Close</Th></tr></thead>
            <tbody>
              {visible.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.position - b.position).map((d) => {
                const due = d.nextStepDue ? dueLabel(d.nextStepDue, now) : null;
                return (
                  <tr key={d.id} className="cursor-pointer hover:bg-muted" onClick={(e) => !(e.target as HTMLElement).closest("a,button") && openDeal(d.id)}>
                    <Td><button onClick={() => openDeal(d.id)} className="max-w-72 truncate rounded-sm text-left font-medium">{d.name}</button></Td>
                    <Td><Link href={`/companies/${d.companyId}`} className="inline-flex max-w-48 items-center gap-1.5 hover:underline"><Monogram name={d.companyName} seed={d.companyDomain} size={20} /><span className="truncate">{d.companyName}</span></Link></Td>
                    <Td>{STAGE_LABEL[d.stage]}</Td>
                    <Td className="tnum text-right font-mono text-xs">{money(d.amountCents)}</Td>
                    <Td><ScoreChip score={d.score} /></Td>
                    <Td className="max-w-72">{d.nextStep ? <span className="flex gap-2"><span className="truncate">{d.nextStep}</span>{due && <span className={cn("whitespace-nowrap text-xs", due.overdue ? "font-medium text-warning" : "text-muted-foreground")}>{due.text}</span>}</span> : d.stage === "won" || d.stage === "lost" ? "" : <span className="font-medium text-warning">No next step</span>}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{shortDate(d.closeDate)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      ) : null}

      {/* Board, 768 px and up */}
      <DndContext id="pipeline" sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setDragging(String(e.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
        <div className={cn("scroll-thin mt-3 flex-1 gap-3 relative overflow-x-auto px-4 pb-4 sm:px-6", view === "board" ? "hidden md:flex" : "hidden")}>
          {STAGES.map((s) => {
            const closed = s === "won" || s === "lost";
            const list = byStage(s);
            return <Column key={s} stage={s} deals={list} collapsed={closed && !expanded.has(s)} onToggle={closed ? () => setExpanded((x) => { const n = new Set(x); if (n.has(s)) n.delete(s); else n.add(s); return n; }) : undefined} firstEmpty={s === "lead" && deals.length === 0} onNew={() => setAdding(true)} {...cardProps} />;
          })}
        </div>
        <DragOverlay dropAnimation={null}>{active ? <CardBody deal={active} now={now} lifted /> : null}</DragOverlay>
      </DndContext>

      {/* One stage at a time under 768 px. "Move to" replaces dragging. */}
      <div className="mt-3 px-4 md:hidden">
        <div role="tablist" aria-label="Stage" className="scroll-thin -mx-4 flex gap-1.5 relative overflow-x-auto px-4 pb-2">
          {STAGES.map((s) => (
            <button key={s} role="tab" aria-selected={mobileStage === s} onClick={() => setMobileStage(s)} className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-13 font-medium", mobileStage === s ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface text-muted-foreground")}>
              {STAGE_LABEL[s]} <span className="tnum font-mono text-xs opacity-80">{byStage(s).length}</span>
            </button>
          ))}
        </div>
        <p className="tnum py-1 text-xs text-muted-foreground">{byStage(mobileStage).length} deals, {money(byStage(mobileStage).reduce((t, d) => t + d.amountCents, 0))}</p>
        <ul className="grid gap-2 pb-4">
          {byStage(mobileStage).map((d) => <li key={d.id}><CardBody deal={d} {...cardProps} /></li>)}
          {byStage(mobileStage).length === 0 && (
            <li>{deals.length === 0 && mobileStage === "lead" ? <EmptyState title="Create your first deal" actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus /> New deal</Button>} className="py-4">A deal belongs to a company and moves across six stages.</EmptyState> : <p className="py-6 text-13 text-muted-foreground">No deal in {STAGE_LABEL[mobileStage]}.</p>}</li>
          )}
        </ul>
      </div>
      {overlays}
    </>
  );
}

interface CardCommon {
  now: Date;
  onOpen: (id: string) => void;
  onMove: (deal: DealCard, stage: Stage) => void;
}

function Column({ stage, deals, collapsed, onToggle, firstEmpty, onNew, ...card }: { stage: Stage; deals: DealCard[]; collapsed: boolean; onToggle?: () => void; firstEmpty: boolean; onNew: () => void } & CardCommon) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}` });
  const total = deals.reduce((t, d) => t + d.amountCents, 0);
  if (collapsed) {
    return (
      <section ref={setNodeRef} aria-label={`${STAGE_LABEL[stage]}, ${deals.length} deals, collapsed`} className={cn("flex w-[104px] shrink-0 flex-col rounded-md border border-dashed border-border-strong transition-colors duration-100", isOver ? "border-primary bg-positive-bg" : "bg-muted/40")}>
        <button onClick={onToggle} aria-expanded={false} className="flex h-full min-h-40 w-full flex-col items-start gap-1 rounded-md p-3 text-left hover:bg-muted">
          <span className="flex w-full items-center justify-between text-13 font-semibold">{STAGE_LABEL[stage]} <ChevronsLeftRight className="size-3.5 text-muted-foreground" aria-hidden /></span>
          <span className="tnum text-xs text-muted-foreground">{deals.length} deals</span>
          <span className="tnum font-mono text-xs text-muted-foreground">{moneyShort(total)}</span>
        </button>
      </section>
    );
  }
  return (
    <section aria-label={`${STAGE_LABEL[stage]}, ${deals.length} deals`} className="flex min-w-[220px] max-w-[320px] flex-1 flex-col">
      <header className="flex h-9 items-center gap-2 px-1">
        <h2 className="text-13 font-semibold">{STAGE_LABEL[stage]}</h2>
        <span className="tnum rounded-sm bg-muted px-1.5 font-mono text-xs text-muted-foreground">{deals.length}</span>
        <span className="tnum ml-auto font-mono text-xs text-muted-foreground">{money(total)}</span>
        {onToggle && <Button size="iconSm" variant="ghost" onClick={onToggle} aria-label={`Collapse ${STAGE_LABEL[stage]}`} aria-expanded><ChevronsLeftRight /></Button>}
      </header>
      <div ref={setNodeRef} className={cn("flex min-h-40 flex-1 flex-col gap-2 rounded-md p-1.5 transition-colors duration-100", isOver ? "bg-positive-bg" : "bg-muted/60")}>
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((d) => <SortableCard key={d.id} deal={d} {...card} />)}
        </SortableContext>
        {firstEmpty && (
          <div className="p-3">
            <p className="text-13 font-medium">Create your first deal</p>
            <p className="mt-1 text-xs text-muted-foreground">A deal belongs to a company and moves across these six stages.</p>
            <Button variant="primary" size="sm" onClick={onNew} className="mt-3"><Plus /> New deal</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function SortableCard({ deal, ...card }: { deal: DealCard } & CardCommon) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("rounded-md", isDragging && "opacity-40")} {...attributes} {...listeners} aria-roledescription="draggable deal card">
      <CardBody deal={deal} {...card} />
    </div>
  );
}

function CardBody({ deal, now, onOpen, onMove, lifted }: { deal: DealCard; now: Date; onOpen?: (id: string) => void; onMove?: (deal: DealCard, stage: Stage) => void; lifted?: boolean }) {
  const due = deal.nextStepDue ? dueLabel(deal.nextStepDue, now) : null;
  const closed = deal.stage === "won" || deal.stage === "lost";
  return (
    <article className={cn("rounded-md border border-border bg-surface p-3 transition-colors duration-100 hover:border-border-strong", lifted && "w-[240px] scale-[1.02] cursor-grabbing shadow-overlay")}>
      <div className="flex items-start gap-1">
        <button onClick={() => onOpen?.(deal.id)} className="min-w-0 flex-1 rounded-sm text-left text-13 font-medium leading-snug hover:underline">
          {deal.name}
        </button>
        {onMove && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm" className="-mr-1.5 -mt-1 shrink-0 text-muted-foreground max-sm:size-9" aria-label={`Actions for ${deal.name}`} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => onOpen?.(deal.id)}>Open deal</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {STAGES.filter((s) => s !== deal.stage).map((s) => <DropdownMenuItem key={s} onSelect={() => onMove(deal, s)}>{STAGE_LABEL[s]}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Monogram name={deal.companyName} seed={deal.companyDomain} size={20} />
        <span className="truncate">{deal.companyName}</span>
        <ScoreChip score={deal.score} className="ml-auto" />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="tnum font-mono text-13 font-medium">{money(deal.amountCents)}</span>
        {deal.closeDate && <span className="tnum flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"><CalendarDays className="size-3" aria-hidden /><span className="sr-only">Closes </span>{shortDate(deal.closeDate)}</span>}
      </div>
      {!closed && (
        <p className={cn("mt-2 flex items-start gap-1.5 text-xs leading-snug", !deal.nextStep || due?.overdue ? "font-medium text-warning" : "text-muted-foreground")}>
          {(!deal.nextStep || due?.overdue) && <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />}
          <span className="min-w-0">{deal.nextStep ? <>{deal.nextStep}{due && <span className="whitespace-nowrap"> · {due.overdue ? due.text : `due ${due.text}`}</span>}</> : "No next step"}</span>
        </p>
      )}
    </article>
  );
}
