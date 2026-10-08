import type { LoootRun } from "./looot";
import type { PlanLine } from "./plan";
import {
  changedLines,
  extractCompany,
  extractEmail,
  extractEmailStatus,
  extractFunding,
  extractItems,
  extractMarkdown,
  extractPeople,
  extractPhone,
  extractTech,
  isMatchingJob,
  mentionsCompany,
  normalizePage,
  removedLines,
  sha256,
  tagHeadline,
  titleMatches,
} from "./extract";
import { basePoints, DEFAULT_WEIGHTS } from "./score";
import type { Store } from "./store/types";
import type { RunOutcome, Settings, Signal } from "./types";

export interface Candidate {
  name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  linkedin_url: string | null;
  company_id: string | null;
  already: boolean;
}

export interface Applied {
  outcome: RunOutcome;
  note?: string;
  /** Set by the email finder: the email found, or null. */
  email?: string | null;
  candidates?: Candidate[];
}

interface Ctx {
  store: Store;
  line: PlanLine;
  run: LoootRun;
  settings: Pick<Settings, "role_keywords" | "weights">;
  now: Date;
  runId: string;
}

const iso = (v: string | null | undefined, now: Date) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t <= now.getTime() + 86_400_000 ? new Date(t).toISOString() : now.toISOString();
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Turns one completed looot run into rows. With no output pin the run's result is the provider's
 * raw body, which differs per provider, so every reader here is tolerant and "no field found"
 * counts as no_result. Raw bodies are never stored.
 */
export async function applyResult(ctx: Ctx): Promise<Applied> {
  const { store, line, run, now } = ctx;
  const w = ctx.settings.weights ?? DEFAULT_WEIGHTS;
  const at = now.toISOString();
  const signal = (s: Pick<Signal, "kind" | "title" | "dedupe_key" | "occurred_at"> & Partial<Signal>): Partial<Signal> => ({
    company_id: line.targetId,
    run_id: ctx.runId,
    points: basePoints(s.kind, s.tag, w),
    ...s,
  });
  const addSignals = (rows: Partial<Signal>[]) => store.insertIgnore("signals", rows, ["company_id", "kind", "dedupe_key"]);

  switch (line.step) {
    case "hiring": {
      const company = await store.get("companies", line.targetId);
      const items = extractItems(run.result).filter((i) => isMatchingJob(i, company?.name ?? "", ctx.settings.role_keywords));
      if (!items.length) return { outcome: "no_result", note: "No matching open role" };
      await addSignals(items.slice(0, 12).map((i) => signal({ kind: "hiring", title: i.title, url: i.url, occurred_at: iso(i.date, now), dedupe_key: sha256(i.url).slice(0, 24) })));
      return { outcome: "data", note: plural(items.length, "matching role") };
    }
    case "news": {
      const company = await store.get("companies", line.targetId);
      const items = extractItems(run.result).filter((i) => mentionsCompany(i.title, company?.name ?? ""));
      if (!items.length) return { outcome: "no_result", note: "No headline names this company" };
      await addSignals(
        items.slice(0, 10).map((i) => signal({ kind: "news", title: i.title, url: i.url, tag: tagHeadline(i.title), detail: i.source ? JSON.stringify({ source: i.source }) : null, occurred_at: iso(i.date, now), dedupe_key: sha256(i.url).slice(0, 24) })),
      );
      return { outcome: "data", note: plural(items.length, "headline") };
    }
    case "funding": {
      const rounds = extractFunding(run.result);
      if (!rounds.length) return { outcome: "no_result", note: "No funding round found" };
      await addSignals(
        rounds.slice(0, 8).map((r) =>
          signal({
            kind: "funding",
            title: [r.type, r.amount].filter(Boolean).join(", "),
            detail: JSON.stringify({ type: r.type, amount: r.amount, investors: r.investors }),
            occurred_at: iso(r.date, now),
            dedupe_key: `${r.date ?? "undated"}:${r.type}`.toLowerCase(),
          }),
        ),
      );
      return { outcome: "data", note: plural(rounds.length, "round") };
    }
    case "tech": {
      const names = extractTech(run.result);
      if (!names) return { outcome: "no_result", note: "This provider returned categories only" };
      const [base] = await store.all("signal_baselines", { company_id: line.targetId, kind: "tech", key: "tech" });
      await store.update("companies", line.targetId, { tech: names });
      if (!base) {
        await store.insert("signal_baselines", [{ company_id: line.targetId, kind: "tech", key: "tech", content: names.join("\n"), checked_at: at }]);
        return { outcome: "data", note: "Baseline saved" };
      }
      const before = new Set((base.content ?? "").split("\n").filter(Boolean));
      const after = new Set(names);
      const added = names.filter((n) => !before.has(n));
      const removed = [...before].filter((n) => !after.has(n));
      await store.update("signal_baselines", base.id, { content: names.join("\n"), checked_at: at });
      if (!added.length && !removed.length) return { outcome: "no_result", note: "No change since the last check" };
      const day = at.slice(0, 10);
      await addSignals([
        ...added.map((n) => signal({ kind: "tech", title: `Added ${n}`, tag: "added", occurred_at: at, dedupe_key: `added:${n}:${day}` })),
        ...removed.map((n) => signal({ kind: "tech", title: `Removed ${n}`, tag: "removed", occurred_at: at, dedupe_key: `removed:${n}:${day}` })),
      ]);
      return { outcome: "data", note: `${added.length} added, ${removed.length} removed` };
    }
    case "site": {
      const md = extractMarkdown(run);
      if (!md || !line.url) return { outcome: "no_result", note: "The page returned no text" };
      const text = normalizePage(md);
      const hash = sha256(text);
      const [base] = await store.all("signal_baselines", { company_id: line.targetId, kind: "site", key: line.url });
      if (!base) {
        await store.insert("signal_baselines", [{ company_id: line.targetId, kind: "site", key: line.url, hash, content: text.slice(0, 60_000), checked_at: at }]);
        return { outcome: "data", note: "Baseline saved" };
      }
      const prev = { hash: base.hash, content: base.content ?? "" };
      await store.update("signal_baselines", base.id, { hash, content: text.slice(0, 60_000), checked_at: at });
      if (prev.hash === hash) return { outcome: "no_result", note: "No change since the last check" };
      const page = new URL(line.url).pathname || "/";
      const name = page.replace(/^\//, "").split("/")[0] || "home";
      await addSignals([
        signal({
          kind: "site",
          title: `${name.charAt(0).toUpperCase()}${name.slice(1)} page changed`,
          url: line.url,
          detail: JSON.stringify({ page, added: changedLines(prev.content, text, 6), removed: removedLines(prev.content, text, 6) }),
          occurred_at: at,
          dedupe_key: `${sha256(line.url).slice(0, 12)}:${hash.slice(0, 12)}`,
        }),
      ]);
      return { outcome: "data", note: "Page changed" };
    }
    case "enrich": {
      const fields = extractCompany(run.result);
      if (!Object.keys(fields).length) return { outcome: "no_result", note: "No company field found" };
      await store.update("companies", line.targetId, { ...fields, enriched_at: at, updated_at: at });
      return { outcome: "data", note: `filled ${Object.keys(fields).map((k) => k.replace("_url", "").replace("hq", "HQ")).join(", ")}` };
    }
    case "email": {
      const email = extractEmail(run.result);
      if (!email) {
        await store.update("contacts", line.targetId, { email_status: "not_found", email_checked_at: at });
        return { outcome: "no_result", note: "email not found", email: null };
      }
      await store.update("contacts", line.targetId, { email, email_status: "unchecked", email_checked_at: at });
      return { outcome: "data", note: "email found", email };
    }
    case "verify": {
      const status = extractEmailStatus(run.result);
      if (!status) return { outcome: "no_result", note: "the verifier gave no verdict" };
      await store.update("contacts", line.targetId, { email_status: status, email_checked_at: at });
      return { outcome: "data", note: `email ${status}` };
    }
    case "phone": {
      const phone = extractPhone(run.result);
      if (!phone) return { outcome: "no_result", note: "phone not found" };
      await store.update("contacts", line.targetId, { phone, phone_found_at: at });
      return { outcome: "data", note: "phone found" };
    }
    case "search": {
      const seed = await store.get("contacts", line.targetId);
      const people = extractPeople(run.result);
      const keywords = String(line.input.job_title ?? "").split(",");
      const matched = people.filter((p) => titleMatches(p.title, keywords));
      const existing = await store.all("contacts");
      const key = (n: string) => n.trim().toLowerCase();
      const candidates = matched.map((p) => ({
        ...p,
        company_id: seed?.company_id ?? null,
        already: existing.some((e) => (p.linkedin_url && e.linkedin_url === p.linkedin_url) || (e.company_id === seed?.company_id && key(`${e.first_name ?? ""} ${e.last_name ?? ""}`) === key(p.name))),
      }));
      if (!people.length) return { outcome: "no_result", note: "No person returned", candidates: [] };
      return { outcome: candidates.length ? "data" : "no_result", note: `${matched.length} of ${people.length} matched your keywords`, candidates };
    }
  }
}
