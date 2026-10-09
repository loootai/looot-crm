"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState, type VisibilityState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Plus, RefreshCw, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { ChipLink, EmptyState, Monogram, ScoreChip, SignalIcon } from "@/components/common";
import { useQuote } from "@/components/quote";
import { useHotkeys } from "@/components/shell/hotkeys";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/popover";
import { Table, Td, Th } from "@/components/ui/table";
import { dayDiff, money, num, relative } from "@/lib/format";
import type { CompanyRow } from "@/lib/queries";
import { OPEN_STAGES, STAGE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddCompanyDialog, ConfirmDelete, ImportSheet } from "./dialogs";

const HIDEABLE: [string, string][] = [["topSignal", "Top signal"], ["industry", "Industry"], ["employees", "Employees"], ["openValueCents", "Open deal value"], ["contacts", "Contacts"], ["lastActivity", "Last activity"], ["intentCheckedAt", "Intent checked"]];

export interface CompaniesQuery {
  q: string;
  filters: string[];
  stage: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
}

export function CompaniesTable({ rows, total, pageSize, query, bulkMax, domains, anyCompanies }: { rows: CompanyRow[]; total: number; pageSize: number; query: CompaniesQuery; bulkMax: number; domains: string[]; anyCompanies: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const quote = useQuote();
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [visibility, setVisibility] = React.useState<VisibilityState>({});
  const [cursor, setCursor] = React.useState(0);
  const [adding, setAdding] = React.useState(sp.get("new") === "1");
  const [importing, setImporting] = React.useState(sp.get("import") === "1");
  const [deleting, setDeleting] = React.useState(false);
  const [search, setSearch] = React.useState(query.q);
  const now = React.useMemo(() => new Date(), []);
  const clearing = React.useRef(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("crm.companies.columns");
      if (saved) setVisibility(JSON.parse(saved));
    } catch {}
  }, []);
  React.useEffect(() => {
    if (sp.get("new") === "1") setAdding(true);
    if (sp.get("import") === "1") setImporting(true);
  }, [sp]);

  const url = React.useCallback(
    (patch: Record<string, string | null>) => {
      const q = new URLSearchParams(sp.toString());
      q.delete("new");
      q.delete("import");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") q.delete(k);
        else q.set(k, v);
      }
      return q.size ? `${path}?${q}` : path;
    },
    [sp, path],
  );
  React.useEffect(() => {
    // "Clear filters" empties the box and the URL in one go. Wait for the URL before syncing again.
    if (clearing.current) {
      if (search === query.q) clearing.current = false;
      return;
    }
    if (search === query.q) return;
    const t = setTimeout(() => router.replace(url({ q: search, page: null }), { scroll: false }), 250);
    return () => clearTimeout(t);
  }, [search, query.q, router, url]);

  const toggleFilter = (f: string) => url({ f: (query.filters.includes(f) ? query.filters.filter((x) => x !== f) : [...query.filters, f]).join(",") || null, page: null });
  const sortHref = (key: string) => url({ sort: key, dir: query.sort === key && query.dir === "desc" ? "asc" : "desc", page: null });

  const columns = React.useMemo<ColumnDef<CompanyRow>[]>(
    () => [
      { id: "name", header: "Company", cell: ({ row }) => (
        <Link href={`/companies/${row.original.id}`} className="flex min-w-0 items-center gap-2 rounded-sm">
          <Monogram name={row.original.name} seed={row.original.domain} />
          <span className="truncate font-medium">{row.original.name}</span>
          <span className="min-w-0 shrink-[20] truncate text-xs text-muted-foreground max-2xl:hidden">{row.original.domain}</span>
        </Link>
      ) },
      { id: "score", header: "Score", cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <ScoreChip score={row.original.score} />
          <Sparkline values={row.original.spark} />
        </span>
      ) },
      { id: "topSignal", header: "Top signal", enableSorting: false, cell: ({ row }) => row.original.topSignal ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <SignalIcon kind={row.original.topSignal.kind} className="size-3.5" />
          <span className="truncate">{row.original.topSignal.title}</span>
        </span>
      ) : <span className="text-muted-foreground">{row.original.intentCheckedAt ? "None in 90 days" : "Not checked yet"}</span> },
      { id: "industry", header: "Industry", cell: ({ row }) => <span className="block truncate" title={row.original.industry ?? undefined}>{row.original.industry ?? ""}</span> },
      { id: "employees", header: "Employees", meta: { right: true }, cell: ({ row }) => <span className="tnum">{row.original.employees ? num(row.original.employees) : ""}</span> },
      { id: "openValueCents", header: "Open deals", meta: { right: true }, cell: ({ row }) => row.original.openValueCents ? (
        <span className="tnum whitespace-nowrap">{money(row.original.openValueCents)} <span className="text-xs text-muted-foreground">{row.original.bestStage ? STAGE_LABEL[row.original.bestStage] : ""}</span></span>
      ) : <span className="text-muted-foreground">none</span> },
      { id: "contacts", header: "Contacts", meta: { right: true }, cell: ({ row }) => <span className="tnum">{row.original.contacts}</span> },
      { id: "lastActivity", header: "Last activity", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.lastActivity ? relative(row.original.lastActivity, now) : "none"}</span> },
      { id: "intentCheckedAt", header: "Intent checked", cell: ({ row }) => {
        const at = row.original.intentCheckedAt;
        const stale = at ? dayDiff(at, now) < -14 : false;
        return <span className={cn("whitespace-nowrap", stale ? "font-medium text-warning" : "text-muted-foreground")}>{at ? relative(at, now) : "never"}{stale && <span className="sr-only"> (stale)</span>}</span>;
      } },
    ],
    [now],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.id, manualSorting: true, manualPagination: true, state: { rowSelection: selection, columnVisibility: visibility }, onRowSelectionChange: setSelection, onColumnVisibilityChange: (u) => setVisibility((old) => { const next = typeof u === "function" ? u(old) : u; try { localStorage.setItem("crm.companies.columns", JSON.stringify(next)); } catch {} return next; }), enableRowSelection: true });

  const selected = Object.keys(selection).filter((k) => selection[k]);
  const over = selected.length > bulkMax;
  const targetIds = () => (selected.length ? selected : rows[cursor] ? [rows[cursor].id] : []);
  const refresh = () => { const ids = targetIds(); if (ids.length && ids.length <= bulkMax) quote({ kind: "intent_refresh", targetIds: ids }); };
  const enrich = () => { const ids = targetIds(); if (ids.length && ids.length <= bulkMax) quote({ kind: "company_enrich", targetIds: ids }); };

  React.useEffect(() => {
    const onRefresh = (e: Event) => {
      if (!selected.length) return;
      e.preventDefault();
      quote({ kind: "intent_refresh", targetIds: selected.slice(0, bulkMax) });
    };
    window.addEventListener("crm:refresh-selected", onRefresh);
    return () => window.removeEventListener("crm:refresh-selected", onRefresh);
  }, [selected, quote, bulkMax]);

  useHotkeys({
    j: () => setCursor((c) => Math.min(rows.length - 1, c + 1)),
    k: () => setCursor((c) => Math.max(0, c - 1)),
    Enter: (e) => { if ((e.target as HTMLElement).closest("a,button,input")) return; if (rows[cursor]) router.push(`/companies/${rows[cursor].id}`); },
    x: () => rows[cursor] && setSelection((s) => ({ ...s, [rows[cursor].id]: !s[rows[cursor].id] })),
    r: refresh,
    e: enrich,
    n: (e) => { e.preventDefault(); setAdding(true); },
  });
  React.useEffect(() => {
    document.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const from = (query.page - 1) * pageSize + 1;
  const to = Math.min(total, query.page * pageSize);
  const filtered = !!query.q || query.filters.length > 0 || !!query.stage;
  const dialogs = (
    <>
      <AddCompanyDialog open={adding} onOpenChange={(o) => { setAdding(o); if (!o && sp.get("new")) router.replace(url({}), { scroll: false }); }} />
      <ImportSheet open={importing} onOpenChange={(o) => { setImporting(o); if (!o && sp.get("import")) router.replace(url({}), { scroll: false }); }} existingDomains={domains} />
      <ConfirmDelete open={deleting} onOpenChange={setDeleting} table="companies" ids={selected} noun="company" onDone={() => setSelection({})} />
    </>
  );

  if (!anyCompanies) {
    return (
      <>
        <EmptyState title="No companies yet" actions={<><Button variant="primary" onClick={() => setImporting(true)}><Upload /> Import CSV</Button><Button onClick={() => setAdding(true)}><Plus /> Add company</Button></>}>
          Import your account list or add a company by its domain. Import is free. Signals are fetched only when you ask, with the price shown first.
        </EmptyState>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or domain" aria-label="Filter companies by name or domain" className="pl-8" />
        </div>
        <div className="scroll-thin -mx-4 flex gap-1.5 relative overflow-x-auto px-4 max-sm:w-screen sm:mx-0 sm:px-0" role="group" aria-label="Filters">
          <Select aria-label="Stage of best deal" value={query.stage} onChange={(e) => router.replace(url({ stage: e.target.value || null, page: null }), { scroll: false })} className={cn("h-7 w-auto shrink-0 text-xs font-medium max-sm:h-9", query.stage ? "border-primary bg-positive-bg text-positive" : "text-muted-foreground")}>
            <option value="">Any stage</option>
            {OPEN_STAGES.map((s) => <option key={s} value={s}>Best deal: {STAGE_LABEL[s]}</option>)}
          </Select>
          <ChipLink href={toggleFilter("score60")} active={query.filters.includes("score60")}>Score 60+</ChipLink>
          <ChipLink href={toggleFilter("open")} active={query.filters.includes("open")}>Has open deal</ChipLink>
          <ChipLink href={toggleFilter("noemail")} active={query.filters.includes("noemail")}>No contact with email</ChipLink>
        </div>
        <div className="ml-auto flex items-center gap-2 max-sm:w-full">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="max-sm:hidden"><Columns3 /> Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {HIDEABLE.map(([id, label]) => (
                <DropdownMenuCheckboxItem key={id} checked={table.getColumn(id)?.getIsVisible()} onCheckedChange={(v) => table.getColumn(id)?.toggleVisibility(v === true)} onSelect={(e) => e.preventDefault()}>
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setImporting(true)} className="max-sm:flex-1"><Upload /> Import CSV</Button>
          <Button variant="primary" onClick={() => setAdding(true)} className="max-sm:flex-1"><Plus /> Add company</Button>
        </div>
      </div>

      {selected.length > 0 && (
        <div role="region" aria-label="Bulk actions" className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-positive-bg px-3 py-1.5">
          <span className="tnum text-13 font-medium">{selected.length} selected</span>
          {over && <span className="text-xs text-warning">One action covers at most {bulkMax} records.</span>}
          <span className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={refresh} disabled={over}><RefreshCw /> Refresh intent ({selected.length})</Button>
            <Button size="sm" onClick={enrich} disabled={over}><Sparkles /> Enrich company ({selected.length})</Button>
            <Button size="sm" variant="danger" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>
            <Button size="iconSm" variant="ghost" onClick={() => setSelection({})} aria-label="Clear selection"><X /></Button>
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No company matches these filters" actions={<Button onClick={() => { clearing.current = true; setSearch(""); router.replace(path, { scroll: false }); }}>Clear filters</Button>} />
      ) : (
        <>
          <div className="scroll-thin mt-3 relative overflow-x-auto rounded-md border border-border bg-surface max-sm:hidden">
            <Table className="min-w-[1040px]">
              <thead className="sticky top-0 z-10">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    <Th className="sticky left-0 z-20 w-9 pr-0">
                      <Checkbox checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false} onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)} aria-label="Select all rows on this page" />
                    </Th>
                    {hg.headers.map((h) => {
                      const sortable = h.column.columnDef.enableSorting !== false;
                      const active = query.sort === h.column.id;
                      const right = (h.column.columnDef.meta as { right?: boolean } | undefined)?.right;
                      return (
                        <Th key={h.id} aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : undefined} className={cn("px-2", h.column.id === "name" && "sticky left-9 z-20 w-60 min-w-52", right && "text-right")}>
                          {sortable ? (
                            <Link href={sortHref(h.column.id)} scroll={false} className={cn("inline-flex items-center gap-1 rounded-sm hover:text-foreground", active && "text-foreground")}>
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {active && (query.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                            </Link>
                          ) : flexRender(h.column.columnDef.header, h.getContext())}
                        </Th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row, i) => {
                  const on = row.getIsSelected();
                  const bg = on ? "bg-positive-bg" : i === cursor ? "bg-muted" : "bg-surface group-hover:bg-muted";
                  return (
                    <tr key={row.id} data-row={i} aria-selected={on} onClick={(e) => { if ((e.target as HTMLElement).closest("a,button,[role=checkbox]")) return; setCursor(i); router.push(`/companies/${row.original.id}`); }} className="group cursor-pointer">
                      <Td className={cn("sticky left-0 z-[5] w-9 pr-0 transition-colors duration-100", bg, i === cursor && "shadow-[inset_2px_0_0_var(--primary)]")}>
                        <Checkbox checked={on} onCheckedChange={(v) => row.toggleSelected(v === true)} aria-label={`Select ${row.original.name}`} />
                      </Td>
                      {row.getVisibleCells().map((cell) => {
                        const right = (cell.column.columnDef.meta as { right?: boolean } | undefined)?.right;
                        return (
                          <Td key={cell.id} className={cn("px-2 transition-colors duration-100", cell.column.id === "topSignal" ? "max-w-44 2xl:max-w-64" : cell.column.id === "industry" ? "max-w-36 2xl:max-w-56" : "max-w-56", bg, cell.column.id === "name" && "sticky left-9 z-[5] w-60 min-w-52 max-w-60 border-r", right && "text-right")}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </Td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          <ul className="mt-3 border-t border-border sm:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/companies/${r.id}`} className="flex items-start gap-3 border-b border-border py-3">
                  <Monogram name={r.name} seed={r.domain} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      <ScoreChip score={r.score} className="ml-auto" />
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-13 text-muted-foreground">
                      {r.topSignal ? (<><SignalIcon kind={r.topSignal.kind} className="size-3.5" /><span className="truncate">{r.topSignal.title}</span></>) : (r.intentCheckedAt ? "No signal in 90 days" : "Not checked yet")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-3 text-13 text-muted-foreground">
            <p className="tnum">{from} to {to} of {num(total)}{filtered ? " matching" : ""}</p>
            <div className="flex items-center gap-1">
              <Button asChild={query.page > 1} size="iconSm" variant="ghost" disabled={query.page <= 1} aria-label="Previous page">
                {query.page > 1 ? <Link href={url({ page: String(query.page - 1) })}><ChevronLeft /></Link> : <ChevronLeft />}
              </Button>
              <Button asChild={to < total} size="iconSm" variant="ghost" disabled={to >= total} aria-label="Next page">
                {to < total ? <Link href={url({ page: String(query.page + 1) })}><ChevronRight /></Link> : <ChevronRight />}
              </Button>
            </div>
          </div>
        </>
      )}
      {dialogs}
    </>
  );
}
