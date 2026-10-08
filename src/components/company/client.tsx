"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Ellipsis, Handshake, Info, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { updateCompany } from "@/app/actions";
import { ConfirmDelete } from "@/components/companies/dialogs";
import { NewDealDialog } from "@/components/pipeline/DealView";
import { useQuote } from "@/components/quote";
import { useHotkeys } from "@/components/shell/hotkeys";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shortDate, usd4 } from "@/lib/format";
import type { StepId } from "@/lib/plan";
import { KIND_CAPS, type ScoreResult } from "@/lib/score";
import { KIND_LABEL, SIGNAL_KINDS, type Company, type SignalKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CompanyActions({ company }: { company: Pick<Company, "id" | "name"> }) {
  const quote = useQuote();
  const router = useRouter();
  const refreshRef = React.useRef<HTMLButtonElement>(null);
  const enrichRef = React.useRef<HTMLButtonElement>(null);
  const [deal, setDeal] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const refresh = () => quote({ kind: "intent_refresh", targetIds: [company.id] });
  const enrich = () => quote({ kind: "company_enrich", targetIds: [company.id] });
  // Focus the button first, so closing the dialog hands focus back to it.
  useHotkeys({
    r: () => { refreshRef.current?.focus(); refresh(); },
    e: () => { enrichRef.current?.focus(); enrich(); },
    n: (e) => { e.preventDefault(); setDeal(true); },
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button ref={refreshRef} variant="primary" onClick={refresh} className="max-sm:flex-1"><RefreshCw /> Refresh intent</Button>
      <Button ref={enrichRef} onClick={enrich} className="max-sm:flex-1"><Sparkles /> Enrich company</Button>
      <Button onClick={() => setDeal(true)} className="max-sm:hidden"><Handshake /> New deal</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" aria-label="More actions"><Ellipsis /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setDeal(true)} className="sm:hidden"><Handshake /> New deal</DropdownMenuItem>
          <DropdownMenuItem danger onSelect={() => setDeleting(true)}><Trash2 /> Delete company</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewDealDialog open={deal} onOpenChange={setDeal} companies={[]} fixedCompany={company.id} />
      <ConfirmDelete open={deleting} onOpenChange={setDeleting} table="companies" ids={[company.id]} noun="company" onDone={() => router.push("/companies")} />
    </div>
  );
}

/** The score as a large number with a popover that explains it. */
export function ScoreWhy({ score, weights }: { score: ScoreResult; weights: { funding: number; hiring: number; tech: number; news_tagged: number; news_other: number; site: number } }) {
  return (
    <Popover>
      <PopoverTrigger className="group flex items-end gap-2 rounded-md text-left" aria-label={`Intent score ${score.score}. Why?`}>
        <span className="tnum text-[32px] font-semibold leading-none tracking-[-0.02em]">{score.score}</span>
        <span className="flex items-center gap-1 pb-0.5 text-xs text-muted-foreground group-hover:text-foreground">Intent score <Info className="size-3.5" aria-hidden /></span>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <p className="text-13 font-medium">Why {score.score}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The sum of points from signals found in the last 90 days. A signal loses half its points every 30 days. Each kind has a cap.</p>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {SIGNAL_KINDS.map((k) => (
              <tr key={k}>
                <th scope="row" className="h-7 border-t border-border text-left font-normal">{KIND_LABEL[k]}</th>
                <td className="tnum h-7 border-t border-border text-right font-mono">{score.breakdown[k]}</td>
                <td className="tnum h-7 w-16 border-t border-border text-right text-muted-foreground">of {KIND_CAPS[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">New signal points: funding {weights.funding}, role {weights.hiring}, tech change {weights.tech}, tagged news {weights.news_tagged}, other news {weights.news_other}, page change {weights.site}.</p>
      </PopoverContent>
    </Popover>
  );
}

/** Tabs whose choice is kept in the URL (?tab=intent). Under 1024 px the left rail becomes the first tab. */
export function CompanyTabs({ tabs, counts }: { tabs: Record<"details" | "timeline" | "intent" | "people" | "deals", React.ReactNode>; counts: { people: number; deals: number; signals: number } }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const raw = sp.get("tab");
  const value = raw && raw in tabs ? raw : "timeline";
  const set = (v: string) => {
    const q = new URLSearchParams(sp.toString());
    if (v === "timeline") q.delete("tab");
    else q.set("tab", v);
    router.replace(q.size ? `${path}?${q}` : path, { scroll: false });
  };
  const count = (n: number) => <span className="tnum rounded-sm bg-muted px-1 font-mono text-[11px] text-muted-foreground">{n}</span>;
  return (
    <Tabs value={value} onValueChange={set}>
      <TabsList>
        <TabsTrigger value="details" className="lg:hidden">Details</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="intent">Intent {count(counts.signals)}</TabsTrigger>
        <TabsTrigger value="people">People {count(counts.people)}</TabsTrigger>
        <TabsTrigger value="deals">Deals {count(counts.deals)}</TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="lg:hidden">{tabs.details}</TabsContent>
      <TabsContent value="timeline">{tabs.timeline}</TabsContent>
      <TabsContent value="intent">{tabs.intent}</TabsContent>
      <TabsContent value="people">{tabs.people}</TabsContent>
      <TabsContent value="deals">{tabs.deals}</TabsContent>
    </Tabs>
  );
}

type FieldKey = "industry" | "employees" | "hq" | "description";
const FIELDS: { key: FieldKey; label: string; numeric?: boolean; long?: boolean }[] = [
  { key: "industry", label: "Industry" },
  { key: "employees", label: "Employees", numeric: true },
  { key: "hq", label: "HQ" },
  { key: "description", label: "About", long: true },
];

/** Company fields, editable in place. An enriched field shows where it came from. */
export function DetailsFields({ company }: { company: Company }) {
  const router = useRouter();
  const save = async (key: FieldKey, raw: string) => {
    const value = raw.trim();
    const current = company[key];
    const next = key === "employees" ? (value ? Number(value.replace(/[^\d]/g, "")) : null) : value || null;
    if (next === current || (next === null && current === null)) return;
    const res = await updateCompany(company.id, { [key]: next });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };
  return (
    <dl className="grid gap-0">
      {FIELDS.map((f) => {
        const v = company[f.key];
        const cls = "-mx-1.5 w-[calc(100%+12px)] rounded-sm bg-transparent px-1.5 py-1 text-13 placeholder:text-muted-foreground/70 hover:bg-muted focus-visible:bg-surface";
        return (
          <div key={f.key} className="border-b border-border py-2 last:border-0">
            <dt><label htmlFor={`f-${f.key}`} className="text-xs text-muted-foreground">{f.label}</label></dt>
            <dd>
              {f.long ? (
                <textarea id={`f-${f.key}`} key={String(v)} defaultValue={v ?? ""} rows={3} placeholder="Add a line about what they do" onBlur={(e) => save(f.key, e.target.value)} className={cn(cls, "resize-none leading-relaxed")} />
              ) : (
                <input id={`f-${f.key}`} key={String(v)} defaultValue={v ?? ""} inputMode={f.numeric ? "numeric" : undefined} placeholder="Not set" onBlur={(e) => save(f.key, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={cn(cls, f.numeric && "tnum")} />
              )}
              {v !== null && company.enriched_at && f.key !== "description" && <p className="text-[11px] text-muted-foreground">from looot, {shortDate(company.enriched_at)}</p>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function TechChips({ tech }: { tech: string[] }) {
  const [all, setAll] = React.useState(false);
  if (!tech.length) return <p className="text-13 text-muted-foreground">Not checked yet. Refresh the tech stack on the Intent tab.</p>;
  const shown = all ? tech : tech.slice(0, 12);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((t) => <span key={t} className="inline-flex h-6 items-center rounded-sm border border-border bg-surface px-1.5 text-xs">{t}</span>)}
      {tech.length > 12 && <button onClick={() => setAll((v) => !v)} className="h-6 rounded-sm px-1.5 text-xs font-medium text-primary hover:underline">{all ? "Show fewer" : `Show all ${tech.length}`}</button>}
    </div>
  );
}

/** Refresh button for one signal kind. Opens the quote dialog for that kind alone. */
export function KindRefresh({ companyId, kind, price, label }: { companyId: string; kind: SignalKind; price: number; label: string }) {
  const quote = useQuote();
  return (
    <Button size="sm" onClick={() => quote({ kind: "intent_refresh", targetIds: [companyId], steps: [kind as StepId] })} aria-label={`${label} ${KIND_LABEL[kind]} for ${usd4(price)}`}>
      <RefreshCw /> {label}
    </Button>
  );
}
