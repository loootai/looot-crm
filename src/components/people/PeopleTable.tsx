"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, MailCheck, Plus, Search, Sparkles, Trash2, UserSearch, X } from "lucide-react";
import { addCandidates, createContact, loadContactTimeline } from "@/app/actions";
import { ConfirmDelete } from "@/components/companies/dialogs";
import { EmailStatusLabel, EmptyState, LinkedinGlyph, Monogram, PersonAvatar } from "@/components/common";
import { useQuote } from "@/components/quote";
import { useHotkeys } from "@/components/shell/hotkeys";
import { Composer, Timeline } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, Td, Th } from "@/components/ui/table";
import type { Candidate } from "@/lib/apply";
import { relative, usd4 } from "@/lib/format";
import type { PriceMap } from "@/lib/jobs";
import type { PersonRow, TimelineEntry } from "@/lib/queries";
import type { EmailStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const SENIORITY = new Set(["vp", "svp", "evp", "head", "director", "manager", "lead", "senior", "chief", "officer", "of", "the", "and", "sr", "jr", "analyst", "supervisor", "coordinator", "specialist", "planner"]);
/** Keywords for a people search, from the seed's title with seniority words dropped, plus the role keywords from Settings. */
export function seedKeywords(title: string | null, roleKeywords: string[]): string {
  const own = (title ?? "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w && !SENIORITY.has(w)).join(" ");
  return [...new Set([own, ...roleKeywords.slice(0, 2)].map((k) => k.trim()).filter(Boolean))].join(", ");
}

export function PeopleTable({ rows, prices, roleKeywords, companies, bulkMax, scoped, demoEmpty }: { rows: PersonRow[]; prices: PriceMap; roleKeywords: string[]; companies: { id: string; name: string }[]; bulkMax: number; scoped?: { id: string; name: string }; demoEmpty?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const quote = useQuote();
  const [q, setQ] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [status, setStatus] = React.useState<"" | EmailStatus>("");
  const [hasEmail, setHasEmail] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [cursor, setCursor] = React.useState(0);
  const openId = sp.get("contact");
  const [adding, setAdding] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [finding, setFinding] = React.useState<PersonRow | null>(null);
  const [found, setFound] = React.useState<{ seed: PersonRow; candidates: Candidate[]; note: string | null } | null>(null);
  const now = React.useMemo(() => new Date(), []);

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (id) next.set("contact", id);
    else next.delete("contact");
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
  };

  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (needle && !`${r.name} ${r.title ?? ""}`.toLowerCase().includes(needle)) return false;
    if (company && r.company_id !== company) return false;
    if (status && r.email_status !== status) return false;
    if (hasEmail && !r.email) return false;
    return true;
  });
  const ids = [...selected].filter((id) => shown.some((r) => r.id === id));
  const over = ids.length > bulkMax;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((r) => selected.has(r.id));
  const enrich = (list: string[]) => list.length && list.length <= bulkMax && quote({ kind: "contact_enrich", targetIds: list });
  const current = rows.find((r) => r.id === openId) ?? null;

  useHotkeys({
    j: () => setCursor((c) => Math.min(shown.length - 1, c + 1)),
    k: () => setCursor((c) => Math.max(0, c - 1)),
    Enter: (e) => { if ((e.target as HTMLElement).closest("a,button,input,select")) return; if (shown[cursor]) setOpen(shown[cursor].id); },
    x: () => shown[cursor] && toggle(shown[cursor].id),
    e: () => enrich(ids.length ? ids : shown[cursor] ? [shown[cursor].id] : []),
    n: (e) => { e.preventDefault(); setAdding(true); },
  }, !scoped);

  const startFind = (seed: PersonRow, keywords: string[], limit: number) => {
    setFinding(null);
    quote({
      kind: "find_people",
      targetIds: [seed.id],
      options: { keywords, limit },
      onDone: (res) => setFound({ seed, candidates: res.candidates ?? [], note: res.runs[0]?.note ?? res.runs[0]?.error ?? null }),
    });
  };

  const overlays = (
    <>
      <AddContactDialog open={adding} onOpenChange={setAdding} companies={companies} fixedCompany={scoped?.id} />
      <ConfirmDelete open={deleting} onOpenChange={setDeleting} table="contacts" ids={ids} noun="contact" onDone={() => setSelected(new Set())} />
      <ContactDrawer key={current?.id ?? "none"} person={current} prices={prices} onClose={() => setOpen(null)} onFind={(p) => { setOpen(null); setFinding(p); }} />
      {finding && <FindPeopleDialog seed={finding} roleKeywords={roleKeywords} price={prices["people.search"]} onClose={() => setFinding(null)} onRun={startFind} />}
      {found && <CandidatesDialog found={found} onClose={() => setFound(null)} />}
    </>
  );

  if (!rows.length || demoEmpty) {
    return (
      <>
        <EmptyState title="No people yet" actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus /> Add a person</Button>}>
          {scoped ? `Add one, or open a contact and use Find more people to search ${scoped.name} by title.` : "Add one, import a CSV, or open a company and use Find more people."}
        </EmptyState>
        {overlays}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or title contains" aria-label="Filter people by name or title" className="pl-8" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!scoped && (
            <Select aria-label="Company" value={company} onChange={(e) => setCompany(e.target.value)} className={cn("h-7 w-40 text-xs font-medium max-sm:h-9", company ? "border-primary bg-positive-bg text-positive" : "text-muted-foreground")}>
              <option value="">Any company</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Select aria-label="Email status" value={status} onChange={(e) => setStatus(e.target.value as EmailStatus | "")} className={cn("h-7 w-36 text-xs font-medium max-sm:h-9", status ? "border-primary bg-positive-bg text-positive" : "text-muted-foreground")}>
            <option value="">Any email status</option>
            <option value="verified">Verified</option>
            <option value="risky">Risky</option>
            <option value="invalid">Invalid</option>
            <option value="unchecked">Not checked</option>
            <option value="not_found">Not found</option>
          </Select>
          <button aria-pressed={hasEmail} onClick={() => setHasEmail((v) => !v)} className={cn("inline-flex h-7 items-center rounded-sm border px-2 text-xs font-medium transition-colors duration-100 max-sm:h-9 max-sm:px-3", hasEmail ? "border-primary bg-positive-bg text-positive" : "border-border-strong bg-surface text-muted-foreground hover:bg-muted")}>
            Has email
          </button>
        </div>
        <Button variant={scoped ? "outline" : "primary"} onClick={() => setAdding(true)} className="ml-auto max-sm:w-full"><Plus /> Add person</Button>
      </div>

      {ids.length > 0 && (
        <div role="region" aria-label="Bulk actions" className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-positive-bg px-3 py-1.5">
          <span className="tnum text-13 font-medium">{ids.length} selected</span>
          {over && <span className="text-xs text-warning">One action covers at most {bulkMax} records.</span>}
          <span className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" disabled={over} onClick={() => enrich(ids)}><Sparkles /> Enrich ({ids.length})</Button>
            <Button size="sm" disabled={over} onClick={() => quote({ kind: "email_verify", targetIds: ids })}><MailCheck /> Verify emails ({ids.length})</Button>
            <Button size="sm" variant="danger" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>
            <Button size="iconSm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection"><X /></Button>
          </span>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState title="No person matches these filters" actions={<Button onClick={() => { setQ(""); setCompany(""); setStatus(""); setHasEmail(false); }}>Clear filters</Button>} />
      ) : (
        <>
          <div className="scroll-thin mt-3 relative overflow-x-auto rounded-md border border-border bg-surface max-sm:hidden">
            <Table className={scoped ? "min-w-[720px]" : "min-w-[1040px]"}>
              <thead>
                <tr>
                  <Th className="w-9 pr-0"><Checkbox checked={allOn ? true : ids.length ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v === true ? new Set(shown.map((r) => r.id)) : new Set())} aria-label="Select all people shown" /></Th>
                  <Th className="min-w-56">Name</Th>
                  {!scoped && <Th>Company</Th>}
                  <Th>Email</Th>
                  <Th>Phone</Th>
                  <Th className="w-10"><span className="sr-only">LinkedIn</span></Th>
                  <Th>Last activity</Th>
                  {!scoped && <Th>Added</Th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const on = selected.has(r.id);
                  return (
                    <tr key={r.id} aria-selected={on} onClick={(e) => { if ((e.target as HTMLElement).closest("a,button,[role=checkbox]")) return; setCursor(i); setOpen(r.id); }} className={cn("cursor-pointer transition-colors duration-100", on ? "bg-positive-bg" : !scoped && i === cursor ? "bg-muted" : "hover:bg-muted")}>
                      <Td className={cn("w-9 pr-0", !scoped && i === cursor && "shadow-[inset_2px_0_0_var(--primary)]")}><Checkbox checked={on} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} /></Td>
                      <Td>
                        <button onClick={() => setOpen(r.id)} className="flex max-w-72 items-center gap-2 rounded-sm text-left">
                          <PersonAvatar name={r.name} />
                          <span className="truncate font-medium">{r.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{r.title}</span>
                        </button>
                      </Td>
                      {!scoped && (
                        <Td>
                          {r.company_id && r.companyName ? (
                            <Link href={`/companies/${r.company_id}`} className="inline-flex max-w-48 items-center gap-1.5 rounded-sm hover:underline">
                              <Monogram name={r.companyName} seed={r.companyDomain ?? r.companyName} size={20} />
                              <span className="truncate">{r.companyName}</span>
                            </Link>
                          ) : <span className="text-muted-foreground">none</span>}
                        </Td>
                      )}
                      <Td>
                        <span className="flex items-center gap-2.5">
                          {r.email && <span className="max-w-52 truncate">{r.email}</span>}
                          <EmailStatusLabel status={r.email_status} />
                        </span>
                      </Td>
                      <Td className="tnum whitespace-nowrap">{r.phone ?? <span className="text-muted-foreground">none</span>}</Td>
                      <Td>
                        {r.linkedin_url && (
                          <a href={r.linkedin_url} target="_blank" rel="noreferrer noopener" aria-label={`${r.name} on LinkedIn`} className="grid size-6 place-items-center rounded-sm text-muted-foreground hover:bg-border hover:text-foreground">
                            <LinkedinGlyph />
                          </a>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{r.lastActivity ? relative(r.lastActivity, now) : "none"}</Td>
                      {!scoped && <Td className="whitespace-nowrap text-muted-foreground">{relative(r.created_at, now)}</Td>}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <ul className="mt-3 border-t border-border sm:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <button onClick={() => setOpen(r.id)} className="flex w-full items-start gap-3 border-b border-border py-3 text-left">
                  <PersonAvatar name={r.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="block truncate text-13 text-muted-foreground">{[r.title, scoped ? null : r.companyName].filter(Boolean).join(", ")}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs"><EmailStatusLabel status={r.email_status} />{r.phone && <span className="text-muted-foreground">has phone</span>}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="tnum mt-3 text-13 text-muted-foreground">{shown.length} of {rows.length} people</p>
        </>
      )}
      {overlays}
    </>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button variant="ghost" size="iconSm" className="text-muted-foreground" aria-label={`Copy ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); } catch { toast.error("Copy is blocked in this browser."); } }}>
      {done ? <Check className="text-accent" /> : <Copy />}
    </Button>
  );
}

function ContactDrawer({ person, prices, onClose, onFind }: { person: PersonRow | null; prices: PriceMap; onClose: () => void; onFind: (p: PersonRow) => void }) {
  const quote = useQuote();
  const [timeline, setTimeline] = React.useState<TimelineEntry[] | null>(null);
  const id = person?.id;
  const stamp = person ? `${person.email}${person.phone}${person.email_status}${person.lastActivity}` : "";
  React.useEffect(() => {
    if (!id) return;
    let alive = true;
    loadContactTimeline(id).then((t) => alive && setTimeline(t));
    return () => { alive = false; };
  }, [id, stamp]);
  if (!person) return null;
  const now = new Date();
  const missing = [!person.email, person.email_status === "unchecked", !person.phone].filter(Boolean).length;
  const row = (label: string, value: React.ReactNode, meta: string | null, action: React.ReactNode) => (
    <div className="flex min-h-12 items-center gap-3 border-b border-border py-2 last:border-0">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">
        <div className="truncate text-13">{value}</div>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </dd>
      {action}
    </div>
  );
  const via = (at: string | null) => (at ? `${person.source === "looot" || person.email_checked_at ? "found" : "added"} ${relative(at, now)} via looot` : null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <DialogHeader className="flex items-center gap-3">
          <PersonAvatar name={person.name} size={40} />
          <div className="min-w-0">
            <DialogTitle className="truncate">{person.name}</DialogTitle>
            <p className="truncate text-13 text-muted-foreground">
              {person.title}
              {person.company_id && person.companyName && (<>{person.title ? " at " : ""}<Link href={`/companies/${person.company_id}`} className="text-foreground hover:underline">{person.companyName}</Link></>)}
            </p>
          </div>
        </DialogHeader>
        <DialogBody className="grid grid-cols-1 content-start gap-6 [&>*]:min-w-0">
          <section aria-labelledby="cd-h">
            <h3 id="cd-h" className="text-13 font-semibold">Contact data</h3>
            <dl className="mt-1 border-t border-border">
              {row("Work email", person.email ?? <span className="text-muted-foreground">{person.email_status === "not_found" ? "Looked for, not found" : "Not found yet"}</span>, person.email ? (person.source === "looot" ? via(person.email_checked_at) : `from ${person.source === "csv" ? "your CSV" : "manual entry"}`) : person.email_status === "not_found" && person.email_checked_at ? `checked ${relative(person.email_checked_at, now)}, $0` : null,
                person.email ? <CopyButton value={person.email} label="email" /> : <Button size="sm" onClick={() => quote({ kind: "contact_enrich", targetIds: [person.id], steps: ["email", "verify"] })}>Find <span className="font-mono">({usd4(prices["people.email.find"]).replace(/0$/, "")})</span></Button>)}
              {row("Email status", <EmailStatusLabel status={person.email_status} className="text-13" />, person.email_checked_at && person.email_status !== "unchecked" && person.email_status !== "not_found" ? `checked ${relative(person.email_checked_at, now)} via looot` : null,
                person.email && person.email_status === "unchecked" ? <Button size="sm" onClick={() => quote({ kind: "email_verify", targetIds: [person.id] })}>Verify <span className="font-mono">({usd4(prices["people.email.verify"])})</span></Button> : null)}
              {row("Phone", person.phone ? <span className="tnum">{person.phone}</span> : <span className="text-muted-foreground">Not found yet</span>, person.phone ? via(person.phone_found_at) : null,
                person.phone ? <CopyButton value={person.phone} label="phone" /> : <Button size="sm" onClick={() => quote({ kind: "contact_enrich", targetIds: [person.id], steps: ["phone"] })}>Find <span className="font-mono">({usd4(prices["people.phone.find"])})</span></Button>)}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" disabled={!missing} onClick={() => quote({ kind: "contact_enrich", targetIds: [person.id] })} title={missing ? undefined : "Email, status and phone are already filled"}>
                <Sparkles /> {missing ? "Enrich contact" : "Nothing left to enrich"}
              </Button>
              <Button onClick={() => onFind(person)} disabled={!person.company_id}><UserSearch /> Find more people like this</Button>
            </div>
          </section>
          <section aria-labelledby="ct-h">
            <h3 id="ct-h" className="mb-2 text-13 font-semibold">Timeline</h3>
            <Composer companyId={person.company_id} contactId={person.id} compact />
            <div className="mt-4">
              {timeline === null ? (
                <div className="grid gap-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <Timeline entries={timeline} empty="No activity with this person yet." />
              )}
            </div>
          </section>
        </DialogBody>
      </SheetContent>
    </Dialog>
  );
}

function FindPeopleDialog({ seed, roleKeywords, price, onClose, onRun }: { seed: PersonRow; roleKeywords: string[]; price: number; onClose: () => void; onRun: (seed: PersonRow, keywords: string[], limit: number) => void }) {
  const [keywords, setKeywords] = React.useState(() => seedKeywords(seed.title, roleKeywords));
  const [limit, setLimit] = React.useState(10);
  const n = Math.max(1, Math.min(25, Math.floor(limit) || 10));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); onRun(seed, keywords.split(",").map((k) => k.trim()).filter(Boolean), n); }} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>Find more people like this</DialogTitle>
            <DialogDescription>
              Seed: {seed.title ?? "No title"} at {seed.companyName}. Searches the same company. Nothing is saved until you pick.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Title keywords" htmlFor="fp-kw" hint="Comma separated. A person is kept when their title contains one of them.">
              <Input id="fp-kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} autoFocus />
            </Field>
            <Field label="How many" htmlFor="fp-n" hint={`Up to 25. About ${usd4((price / 10) * n)} for ${n}.`}>
              <Input id="fp-n" type="number" min={1} max={25} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="tnum w-24" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">See the quote</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CandidatesDialog({ found, onClose }: { found: { seed: PersonRow; candidates: Candidate[]; note: string | null }; onClose: () => void }) {
  const router = useRouter();
  const fresh = found.candidates.filter((c) => !c.already);
  const [picked, setPicked] = React.useState<Set<number>>(() => new Set(found.candidates.map((c, i) => (c.already ? -1 : i)).filter((i) => i >= 0)));
  const [pending, start] = React.useTransition();
  const save = () =>
    start(async () => {
      const rows = found.candidates.filter((_, i) => picked.has(i)).map((c) => ({ first_name: c.first_name, last_name: c.last_name, title: c.title, linkedin_url: c.linkedin_url, company_id: c.company_id }));
      const res = await addCandidates(rows);
      if (!res.ok) return void toast.error(res.error);
      toast(`Added ${res.added} to People`);
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>People at {found.seed.companyName}</DialogTitle>
          <DialogDescription>{found.note ?? "Search finished."} Pick who to add. Nothing is saved until you do.</DialogDescription>
        </DialogHeader>
        <DialogBody className="px-0 py-0">
          {found.candidates.length === 0 ? (
            <p className="px-5 py-6 text-13 text-muted-foreground">No one matched. Try broader keywords, such as one word instead of a phrase.</p>
          ) : (
            <ul>
              {found.candidates.map((c, i) => (
                <li key={`${c.name}-${i}`} className={cn("flex min-h-12 items-center gap-3 border-b border-border px-5 last:border-0", c.already && "text-muted-foreground")}>
                  <Checkbox id={`cand-${i}`} disabled={c.already} checked={picked.has(i)} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); if (v === true) n.add(i); else n.delete(i); return n; })} />
                  <label htmlFor={`cand-${i}`} className="min-w-0 flex-1 py-2">
                    <span className="block truncate text-13 font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.title ?? "No title"}</span>
                  </label>
                  {c.already ? <span className="text-xs">already added</span> : c.linkedin_url ? (
                    <a href={c.linkedin_url} target="_blank" rel="noreferrer noopener" aria-label={`${c.name} on LinkedIn`} className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"><LinkedinGlyph /></a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>{fresh.length ? "Add no one" : "Close"}</Button>
          {fresh.length > 0 && <Button variant="primary" disabled={!picked.size || pending} onClick={save}>{pending ? "Adding" : `Add ${picked.size} to People`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddContactDialog({ open, onOpenChange, companies, fixedCompany }: { open: boolean; onOpenChange: (o: boolean) => void; companies: { id: string; name: string }[]; fixedCompany?: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    start(async () => {
      const res = await createContact({ company_id: fixedCompany ?? (get("company") || null), first_name: get("first"), last_name: get("last"), title: get("title") || null, email: get("email") || null, linkedin_url: get("linkedin") || null });
      if (!res.ok) return setError(res.error);
      setError(null);
      onOpenChange(false);
      toast("Person added");
      router.refresh();
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>Add person</DialogTitle>
            <DialogDescription>Leave the email empty to find it later with Enrich contact.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" htmlFor="pf"><Input id="pf" name="first" required autoFocus autoComplete="off" /></Field>
              <Field label="Last name" htmlFor="pl"><Input id="pl" name="last" autoComplete="off" /></Field>
            </div>
            {!fixedCompany && (
              <Field label="Company" htmlFor="pc">
                <Select id="pc" name="company" defaultValue=""><option value="">No company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              </Field>
            )}
            <Field label="Title" htmlFor="pt"><Input id="pt" name="title" autoComplete="off" placeholder="VP Operations" /></Field>
            <Field label="Email (optional)" htmlFor="pe" error={error}><Input id="pe" name="email" type="email" autoComplete="off" spellCheck={false} /></Field>
            <Field label="LinkedIn URL (optional)" htmlFor="pli"><Input id="pli" name="linkedin" type="url" autoComplete="off" spellCheck={false} /></Field>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving" : "Add person"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
