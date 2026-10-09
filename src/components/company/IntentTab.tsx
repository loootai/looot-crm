import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { RampDot, ScoreLine, StackedBar } from "@/components/charts";
import { SignalIcon } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { relative, shortDate, usd4 } from "@/lib/format";
import type { CompanyDetail, IntentSection } from "@/lib/queries";
import { ageDays, basePoints, decayed, KIND_CAPS } from "@/lib/score";
import { KIND_LABEL, SIGNAL_KINDS, type Signal, type SignalKind, type Weights } from "@/lib/types";
import { KindRefresh } from "./client";

const WEIGHT_TEXT: Record<SignalKind, (w: Weights) => string> = {
  funding: (w) => `${w.funding} per round`,
  hiring: (w) => `${w.hiring} per matching role`,
  tech: (w) => `${w.tech} per change`,
  news: (w) => `${w.news_tagged} tagged, ${w.news_other} other`,
  site: (w) => `${w.site} per changed page`,
};
const SECTION_TITLE: Record<SignalKind, string> = { hiring: "Hiring", funding: "Funding", tech: "Tech stack", news: "News", site: "Site changes" };
const ORDER: SignalKind[] = ["hiring", "funding", "tech", "news", "site"];

function parse(detail: string | null): Record<string, unknown> {
  try {
    return detail ? (JSON.parse(detail) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function IntentTab({ detail, now }: { detail: CompanyDetail; now: Date }) {
  const { company, score, sections, weights } = detail;
  const bySection = new Map(sections.map((s) => [s.kind, s]));
  return (
    <div className="grid min-w-0 grid-cols-1 gap-8 [&>*]:min-w-0">
      <section aria-labelledby="score-h" className="rounded-md border border-border bg-surface p-4 sm:p-5">
        <h2 id="score-h" className="sr-only">Intent score</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_280px_1fr] md:items-center [&>*]:min-w-0">
          <div>
            <p className="tnum text-5xl font-semibold leading-none tracking-[-0.03em]">{score.score}</p>
            <p className="mt-2 text-xs text-muted-foreground">Intent score, out of 100</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{company.intent_checked_at ? `checked ${relative(company.intent_checked_at, now)}` : "never checked"}</p>
          </div>
          <ScoreLine points={detail.history} />
          <p className="max-w-md text-13 leading-relaxed text-muted-foreground">Score is the sum of points from signals found in the last 90 days. A signal loses half its points every 30 days. Each kind has a cap, and the five caps add up to 100.</p>
        </div>
        <StackedBar className="mt-5" label="Score breakdown" total={Math.max(score.score, 1)} segments={SIGNAL_KINDS.map((k) => ({ label: KIND_LABEL[k], value: score.breakdown[k] }))} />
        <div className="mt-2 relative overflow-x-auto">
          <table className="w-full text-13 sm:min-w-[520px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="h-8 font-medium">Signal kind</th>
                <th scope="col" className="h-8 text-right font-medium">Points now</th>
                <th scope="col" className="hidden h-8 pl-6 font-medium sm:table-cell">Weight</th>
                <th scope="col" className="h-8 text-right font-medium">Newest evidence</th>
              </tr>
            </thead>
            <tbody>
              {SIGNAL_KINDS.map((k, i) => (
                <tr key={k}>
                  <th scope="row" className="h-8 border-t border-border text-left font-normal">
                    <a href={`#intent-${k}`} className="inline-flex items-center gap-2 hover:underline"><RampDot i={i} />{KIND_LABEL[k]}</a>
                  </th>
                  <td className="tnum h-8 border-t border-border text-right font-mono">{score.breakdown[k]}<span className="text-muted-foreground"> / {KIND_CAPS[k]}</span></td>
                  <td className="hidden h-8 border-t border-border pl-6 text-muted-foreground sm:table-cell">{WEIGHT_TEXT[k](weights)}</td>
                  <td className="tnum h-8 border-t border-border text-right text-muted-foreground">{score.newest[k] ? shortDate(score.newest[k]) : "none"}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="h-8 border-t border-border-strong text-left font-medium">Total</th>
                <td className="tnum h-8 border-t border-border-strong text-right font-mono font-medium">{score.score}<span className="font-normal text-muted-foreground"> / 100</span></td>
                <td className="border-t border-border-strong" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {ORDER.map((k) => (
        <Section key={k} section={bySection.get(k)!} companyId={company.id} now={now} weights={weights} roleKeywords={detail.roleKeywords} tech={company.tech} />
      ))}
    </div>
  );
}

function Section({ section: s, companyId, now, weights, roleKeywords, tech }: { section: IntentSection; companyId: string; now: Date; weights: Weights; roleKeywords: string[]; tech: string[] }) {
  const pts = (sig: Signal) => Math.round(decayed(basePoints(sig.kind, sig.tag, weights), ageDays(sig.occurred_at, now)) * 10) / 10;
  return (
    <section id={`intent-${s.kind}`} aria-labelledby={`h-${s.kind}`} className="scroll-mt-16">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-strong pb-2">
        <h3 id={`h-${s.kind}`} className="flex items-center gap-2 text-base font-semibold"><SignalIcon kind={s.kind} className="text-foreground" />{SECTION_TITLE[s.kind]}</h3>
        <span className="text-xs text-muted-foreground">{s.checkedAt ? `checked ${relative(s.checkedAt, now)}` : "not checked yet"}</span>
        <span className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{s.jobId}{s.runs > 1 ? ` x ${s.runs}` : ""}</span>
          <span className="tnum font-mono text-xs">{usd4(s.price)}</span>
          <KindRefresh companyId={companyId} kind={s.kind} price={s.price} label={s.state === "error" ? "Try again" : s.state === "never" ? "Check" : "Refresh"} />
        </span>
      </header>

      {s.kind === "hiring" && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Roles matched on
          {roleKeywords.length ? roleKeywords.map((w) => <Link key={w} href="/settings#intent" className="inline-flex h-5 items-center rounded-sm border border-border bg-surface px-1.5 text-foreground hover:bg-muted">{w}</Link>) : <Link href="/settings#intent" className="font-medium text-primary hover:underline">any title. Add role keywords in Settings</Link>}
        </p>
      )}

      {s.state === "never" && <p className="py-4 text-13 text-muted-foreground">Not checked yet. A check costs about <span className="font-mono text-foreground">{usd4(s.price)}</span>.</p>}
      {s.state === "error" && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-13" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <span>{s.error ?? "The run failed."} <span className="font-mono">$0.</span> Nothing was charged. Try again.</span>
        </p>
      )}
      {s.state === "empty" && <p className="py-4 text-13 text-muted-foreground">Checked {shortDate(s.checkedAt)}, nothing found. <span className="font-mono">{usd4(s.lastCost ?? 0)}.</span></p>}
      {s.state === "baseline" && <p className="py-4 text-13 text-muted-foreground">Baseline saved {shortDate(s.checkedAt)}. Changes will show after the next check.</p>}

      {s.state === "data" && s.kind === "hiring" && (
        <Rows head={["Role", "Location", "Posted", "Points"]}>
          {s.signals.map((sig) => (
            <tr key={sig.id}>
              <Cell><Evidence sig={sig} /></Cell>
              <Cell muted>{String(parse(sig.detail).location ?? "")}</Cell>
              <Cell muted nowrap>{relative(sig.occurred_at, now)}</Cell>
              <Cell right mono>{pts(sig)}</Cell>
            </tr>
          ))}
        </Rows>
      )}
      {s.state === "data" && s.kind === "funding" && (
        <Rows head={["Round", "Investors", "Date", "Points"]}>
          {s.signals.map((sig) => {
            const d = parse(sig.detail);
            return (
              <tr key={sig.id}>
                <Cell><span className="font-medium">{String(d.type ?? sig.title)}</span>{d.amount ? <span className="tnum ml-2 font-mono text-xs">{String(d.amount)}</span> : null}</Cell>
                <Cell muted>{String(d.investors ?? "")}</Cell>
                <Cell muted nowrap>{shortDate(sig.occurred_at)}</Cell>
                <Cell right mono>{pts(sig)}</Cell>
              </tr>
            );
          })}
        </Rows>
      )}
      {s.state === "data" && s.kind === "news" && (
        <Rows head={["Headline", "Source", "Date", "Points"]}>
          {s.signals.map((sig) => (
            <tr key={sig.id}>
              <Cell><span className="flex items-center gap-2"><Evidence sig={sig} />{sig.tag && <Badge tone={sig.tag === "other" ? "muted" : "neutral"}>{sig.tag}</Badge>}</span></Cell>
              <Cell muted>{String(parse(sig.detail).source ?? "")}</Cell>
              <Cell muted nowrap>{relative(sig.occurred_at, now)}</Cell>
              <Cell right mono>{pts(sig)}</Cell>
            </tr>
          ))}
        </Rows>
      )}
      {s.kind === "tech" && s.state === "data" && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(["added", "removed"] as const).map((tag) => {
            const list = s.signals.filter((x) => x.tag === tag);
            return (
              <div key={tag}>
                <h4 className="text-xs font-medium text-muted-foreground">{tag === "added" ? "Added since last check" : "Removed since last check"}</h4>
                {list.length ? (
                  <ul className="mt-1 border-t border-border">
                    {list.map((sig) => (
                      <li key={sig.id} className="flex min-h-9 items-center gap-2 border-b border-border text-13">
                        <span className={tag === "removed" ? "text-muted-foreground line-through" : "font-medium"}>{sig.title.replace(/^(Added|Removed) /, "")}</span>
                        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{relative(sig.occurred_at, now)}</span>
                        <span className="tnum w-8 text-right font-mono text-xs">{pts(sig)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 border-t border-border py-2 text-13 text-muted-foreground">Nothing {tag}.</p>}
              </div>
            );
          })}
        </div>
      )}
      {s.kind === "tech" && tech.length > 0 && s.state !== "never" && (
        <details className="mt-3 text-13">
          <summary className="inline-block rounded-sm text-xs font-medium text-primary hover:underline">Full stack, {tech.length} {tech.length === 1 ? "technology" : "technologies"}</summary>
          <p className="mt-2 leading-relaxed text-muted-foreground">{tech.join(", ")}</p>
        </details>
      )}
      {s.state === "data" && s.kind === "site" && (
        <ul className="mt-1">
          {s.signals.map((sig) => {
            const d = parse(sig.detail) as { page?: string; added?: string[]; removed?: string[] };
            const lines = (d.added?.length ?? 0) + (d.removed?.length ?? 0);
            return (
              <li key={sig.id} className="border-b border-border py-2">
                <details open={s.signals.length === 1}>
                  <summary className="flex min-h-6 cursor-pointer list-none items-center gap-2 rounded-sm text-13 [&::-webkit-details-marker]:hidden">
                    <span className="font-mono text-xs">{d.page ?? "/"}</span>
                    <span className="text-muted-foreground">changed {shortDate(sig.occurred_at)}</span>
                    <span className="text-xs font-medium text-primary">{lines} {lines === 1 ? "line" : "lines"}</span>
                    {sig.url && <a href={sig.url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${d.page ?? "the page"}`} className="ml-auto grid size-6 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="size-3.5" /></a>}
                    <span className="tnum w-8 text-right font-mono text-xs">{pts(sig)}</span>
                  </summary>
                  <div className="mt-2 overflow-hidden rounded-md border border-border font-mono text-xs leading-relaxed">
                    {(d.removed ?? []).map((l, i) => <p key={`r${i}`} className="flex gap-2 bg-danger-bg/50 px-2.5 py-1 text-muted-foreground"><span aria-hidden className="select-none">-</span><span className="sr-only">Removed: </span><span className="line-through">{l}</span></p>)}
                    {(d.added ?? []).map((l, i) => <p key={`a${i}`} className="flex gap-2 bg-diff-add px-2.5 py-1"><span aria-hidden className="select-none text-positive">+</span><span className="sr-only">Added: </span><span>{l}</span></p>)}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Evidence({ sig }: { sig: Signal }) {
  return sig.url ? (
    <a href={sig.url} target="_blank" rel="noreferrer noopener" className="group inline-flex min-w-0 items-center gap-1.5 hover:underline">
      <span className="truncate">{sig.title}</span>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  ) : (
    <span className="truncate">{sig.title}</span>
  );
}

function Rows({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[560px] text-13">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            {head.map((h, i) => <th key={h} scope="col" className={`h-8 font-medium ${i === head.length - 1 ? "w-14 text-right" : i ? "pl-4" : ""}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Cell({ children, muted, right, mono, nowrap }: { children: React.ReactNode; muted?: boolean; right?: boolean; mono?: boolean; nowrap?: boolean }) {
  return <td className={`h-9 max-w-[420px] border-t border-border ${muted ? "pl-4 text-muted-foreground" : ""} ${right ? "tnum text-right" : ""} ${mono ? "font-mono text-xs" : ""} ${nowrap ? "whitespace-nowrap" : ""}`}>{children}</td>;
}
