"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { createCompany, deleteRecords } from "@/app/actions";
import { useQuote } from "@/components/quote";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Label, Select } from "@/components/ui/input";
import { buildImport, guessMapping, IMPORT_FIELDS, IMPORT_LIMIT, parseCsv, type ImportField, type Mapping } from "@/lib/csv";
import { cleanDomain, num } from "@/lib/format";

export function AddCompanyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const quote = useQuote();
  const [name, setName] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [enrich, setEnrich] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanDomain(domain)) return setError("Enter a domain such as brightwell-logistics.com, without a path.");
    start(async () => {
      const res = await createCompany({ name, domain });
      if (!res.ok) return setError(res.error);
      onOpenChange(false);
      setName("");
      setDomain("");
      setError(null);
      toast(`${name.trim()} added`, { action: { label: "Open", onClick: () => router.push(`/companies/${res.id}`) } });
      router.refresh();
      if (enrich) quote({ kind: "company_enrich", targetIds: [res.id] });
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>Add company</DialogTitle>
            <DialogDescription>Saving is free. Intent signals are fetched only when you ask.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Name" htmlFor="co-name">
              <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus autoComplete="off" placeholder="Brightwell Logistics" />
            </Field>
            <Field label="Domain" htmlFor="co-domain" error={error} hint="The host only. Used for enrichment and for the pages to watch.">
              <Input id="co-domain" value={domain} onChange={(e) => { setDomain(e.target.value); setError(null); }} required autoComplete="off" spellCheck={false} placeholder="brightwell-logistics.com" aria-invalid={!!error} />
            </Field>
            <div className="flex items-start gap-2.5">
              <Checkbox id="co-enrich" checked={enrich} onCheckedChange={(v) => setEnrich(v === true)} className="mt-0.5" />
              <Label htmlFor="co-enrich" className="text-13 font-normal leading-snug">
                Enrich after saving <span className="font-mono text-muted-foreground">($0.0019)</span>
                <span className="block text-xs text-muted-foreground">Fills industry, headcount and HQ. You confirm the quote first.</span>
              </Label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving" : "Add company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FIELD_LABEL: Record<ImportField, string> = { name: "Company name", domain: "Domain (required)", first_name: "First name", last_name: "Last name", title: "Title", email: "Email", linkedin_url: "LinkedIn URL" };

export function ImportSheet({ open, onOpenChange, existingDomains }: { open: boolean; onOpenChange: (o: boolean) => void; existingDomains: string[] }) {
  const router = useRouter();
  const [file, setFile] = React.useState<{ name: string; text: string } | null>(null);
  const [mapping, setMapping] = React.useState<Mapping>({});
  const [drag, setDrag] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const rows = React.useMemo(() => (file ? parseCsv(file.text) : []), [file]);
  const header = rows[0] ?? [];
  const plan = React.useMemo(() => (rows.length > 1 && mapping.domain !== undefined ? buildImport(rows.slice(1), mapping, existingDomains) : null), [rows, mapping, existingDomains]);

  const read = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 4_000_000) return setError("This file is over 4 MB. Split it and import in parts.");
    const text = await f.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) return setError("This file has no data rows. The first row must be the header.");
    setError(null);
    setFile({ name: f.name, text });
    setMapping(guessMapping(parsed[0]));
  };
  const submit = () =>
    start(async () => {
      const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: file!.text, mapping, hasHeader: true }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) return setError(body?.error?.message ?? "The import failed.");
      toast(`Imported ${body.companies} companies and ${body.contacts} contacts`, { description: body.duplicates ? `${body.duplicates} already in your CRM were skipped.` : undefined });
      onOpenChange(false);
      setFile(null);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>Companies with optional contact columns. Import is free. Up to {num(IMPORT_LIMIT)} rows.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid content-start gap-5">
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void read(e.dataTransfer.files[0]); }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed px-4 py-7 text-center transition-colors duration-100 focus-within:border-primary ${drag ? "border-primary bg-positive-bg" : "border-border-strong bg-surface hover:bg-muted"}`}
          >
            <FileUp className="size-5 text-muted-foreground" aria-hidden />
            <span className="text-13 font-medium">{file ? file.name : "Drop a CSV here, or choose a file"}</span>
            <span className="text-xs text-muted-foreground">{file ? `${num(rows.length - 1)} rows, ${header.length} columns` : "The first row must be the header."}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => read(e.target.files?.[0])} />
          </label>
          {error && <p className="text-13 text-danger" role="alert">{error}</p>}
          {file && (
            <>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-13 font-semibold">Match your columns</legend>
                {IMPORT_FIELDS.map((f) => (
                  <div key={f} className="grid grid-cols-[140px_1fr] items-center gap-3">
                    <Label htmlFor={`map-${f}`} className="font-normal text-muted-foreground">{FIELD_LABEL[f]}</Label>
                    <Select id={`map-${f}`} value={mapping[f] ?? ""} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === "") delete n[f]; else n[f] = Number(e.target.value); return n; })}>
                      <option value="">Not in this file</option>
                      {header.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </Select>
                  </div>
                ))}
              </fieldset>
              {mapping.domain === undefined ? (
                <p className="text-13 text-warning">Pick the column that holds the company domain.</p>
              ) : plan ? (
                <div>
                  <p className="text-13 font-semibold">Preview</p>
                  <p className="mt-0.5 text-13 text-muted-foreground">
                    {num(plan.companies.length)} new companies and {num(plan.contacts)} contacts from {num(plan.rows)} rows. {plan.duplicates} already in your CRM skipped, {plan.invalid} without a valid domain skipped.
                  </p>
                  <div className="mt-2 relative overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-surface text-left text-muted-foreground">
                          <th scope="col" className="h-8 px-2.5 font-medium">Company</th>
                          <th scope="col" className="h-8 px-2.5 font-medium">Domain</th>
                          <th scope="col" className="h-8 px-2.5 font-medium">Contacts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.companies.slice(0, 5).map((c) => (
                          <tr key={c.domain}>
                            <td className="h-8 border-t border-border px-2.5">{c.name}</td>
                            <td className="h-8 border-t border-border px-2.5 font-mono">{c.domain}</td>
                            <td className="h-8 border-t border-border px-2.5">{c.contacts.map((p) => [p.first_name, p.last_name].filter(Boolean).join(" ")).join(", ") || "none"}</td>
                          </tr>
                        ))}
                        {!plan.companies.length && (
                          <tr><td colSpan={3} className="h-10 border-t border-border px-2.5 text-muted-foreground">No new company in this file.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!plan || !plan.companies.length || pending} onClick={submit}>
            {pending ? "Importing" : plan?.companies.length ? `Import ${num(plan.companies.length)} companies` : "Import"}
          </Button>
        </DialogFooter>
      </SheetContent>
    </Dialog>
  );
}

/** Confirmation for a delete. Deleting cannot be undone, so it never happens on one click. */
export function ConfirmDelete({ open, onOpenChange, table, ids, noun, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; table: "companies" | "contacts" | "deals"; ids: string[]; noun: string; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" role="alertdialog">
        <DialogHeader>
          <DialogTitle>Delete {ids.length === 1 ? `this ${noun}` : `${ids.length} ${noun === "company" ? "companies" : `${noun}s`}`}?</DialogTitle>
          <DialogDescription>{table === "companies" ? "Their contacts, deals, signals and timeline go with them." : "This removes it from every list."} This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} autoFocus>Cancel</Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteRecords(table, ids);
                if (!res.ok) return void toast.error(res.error);
                toast(`Deleted ${res.removed}`);
                onOpenChange(false);
                onDone?.();
                router.refresh();
              })
            }
          >
            {pending ? "Deleting" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
