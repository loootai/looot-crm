"use client";

import * as React from "react";
import { usd4, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 12-week score sparkline: a muted 1.5 px line with the last point as an emerald dot. */
export function Sparkline({ values, width = 64, height = 20, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return <span className={cn("inline-block text-xs text-muted-foreground", className)} style={{ width }}>no history</span>;
  const max = Math.max(...values, 10);
  const pad = 3;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0", className)} role="img" aria-label={`Score over ${values.length} weeks, from ${values[0]} to ${values[last]}`}>
      <path d={d} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <circle cx={x(last)} cy={y(values[last])} r="3" fill="var(--accent)" />
    </svg>
  );
}

/** Score line chart with rules at 30 and 60 and one dot per refresh. The value shows on hover and focus. */
export function ScoreLine({ points, width = 280, height = 96 }: { points: { at: string; score: number }[]; width?: number; height?: number }) {
  const [active, setActive] = React.useState<number | null>(null);
  if (!points.length) return <div className="grid h-24 w-full max-w-[280px] place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">No score history yet</div>;
  const padX = 8;
  const padT = 14;
  const padB = 6;
  const x = (i: number) => (points.length === 1 ? width / 2 : padX + (i * (width - padX * 2 - 18)) / (points.length - 1));
  const y = (v: number) => height - padB - (v / 100) * (height - padT - padB);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");
  const shown = active ?? points.length - 1;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="max-w-[280px] overflow-visible" role="img" aria-label={`Intent score over the last ${points.length} checks, now ${points[points.length - 1].score}`}>
      {[30, 60].map((v) => (
        <g key={v}>
          <line x1={padX} x2={width - 18} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
          <text x={width} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[9px]">
            {v}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={p.at}
          cx={x(i)}
          cy={y(p.score)}
          r={i === shown ? 4 : 2.5}
          fill={i === points.length - 1 ? "var(--accent)" : "var(--surface)"}
          stroke={i === points.length - 1 ? "var(--accent)" : "var(--muted-foreground)"}
          strokeWidth="1.5"
          tabIndex={0}
          aria-label={`${shortDate(p.at)}: ${p.score}`}
          onMouseEnter={() => setActive(i)}
          onMouseLeave={() => setActive(null)}
          onFocus={() => setActive(i)}
          onBlur={() => setActive(null)}
          className="cursor-default outline-none focus-visible:stroke-[var(--ring)]"
        />
      ))}
      <text x={Math.min(Math.max(x(shown), 26), width - 58)} y={Math.max(9, y(points[shown].score) - 9)} textAnchor="middle" className="pointer-events-none fill-foreground font-mono text-[10px] font-medium">
        {points[shown].score} · {shortDate(points[shown].at)}
      </text>
    </svg>
  );
}

export const RAMP = ["var(--ramp-1)", "var(--ramp-2)", "var(--ramp-3)", "var(--ramp-4)", "var(--ramp-5)"];

/** One horizontal stacked bar, 10 px tall, 2 px gaps. The table under it is the key, never the color alone. */
export function StackedBar({ segments, total, className, label }: { segments: { label: string; value: number }[]; total?: number; className?: string; label: string }) {
  const sum = total ?? segments.reduce((s, x) => s + x.value, 0);
  return (
    <div role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`} className={cn("flex h-2.5 w-full gap-0.5 overflow-hidden rounded-sm bg-muted", className)}>
      {segments.map((s, i) => (s.value > 0 && sum > 0 ? <div key={s.label} style={{ width: `${(s.value / sum) * 100}%`, background: RAMP[i % RAMP.length] }} className="h-full min-w-[3px] first:rounded-l-sm last:rounded-r-sm" /> : null))}
    </div>
  );
}

export function RampDot({ i }: { i: number }) {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: RAMP[i % RAMP.length] }} />;
}

/** Spend per day, last 30 days, bars stacked by action type. Dollar labels in mono, only the zero line drawn. */
export function SpendChart({ days, groups }: { days: { date: string; byGroup: Record<string, number> }[]; groups: readonly string[] }) {
  const [active, setActive] = React.useState<number | null>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  // On a narrow screen the chart scrolls sideways. Start at the newest days.
  React.useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);
  const W = 720;
  const H = 150;
  const left = 52;
  const bottom = 20;
  const top = 8;
  const totals = days.map((d) => groups.reduce((s, g) => s + (d.byGroup[g] ?? 0), 0));
  const rawMax = Math.max(...totals, 0.0001);
  const step = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5].find((s) => rawMax / s <= 4) ?? 10;
  const max = Math.ceil(rawMax / step) * step;
  const slot = (W - left) / days.length;
  const y = (v: number) => H - bottom - (v / max) * (H - bottom - top);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  return (
    <div className="relative">
      <div ref={scroller} className="scroll-thin overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Spend per day for the last 30 days. Highest day ${usd4(rawMax)}.`} className="block min-w-[640px]">
        {ticks.map((t) => (
          <text key={t} x={left - 8} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
            ${t.toFixed(step < 0.01 ? 3 : 2)}
          </text>
        ))}
        <line x1={left} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth="1" />
        {days.map((d, i) => {
          let acc = 0;
          const cx = left + i * slot + slot / 2;
          return (
            <g key={d.date} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <rect x={left + i * slot} y={top} width={slot} height={H - bottom - top} fill={active === i ? "var(--muted)" : "transparent"} />
              {groups.map((g, gi) => {
                const v = d.byGroup[g] ?? 0;
                if (v <= 0) return null;
                const y1 = y(acc + v);
                const h = Math.max(1.5, y(acc) - y1);
                acc += v;
                return <rect key={g} x={cx - 4} y={y1} width="8" height={h} fill={RAMP[gi]} rx="1" />;
              })}
              {(i % 5 === 0 || i === days.length - 1) && (
                <text x={i === days.length - 1 ? left + (i + 1) * slot : cx} y={H - 5} textAnchor={i === days.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">
                  {shortDate(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      </div>
      <p className="tnum mt-1 h-5 text-xs text-muted-foreground" aria-live="polite">
        {active !== null && totals[active] > 0 ? (
          <>
            <span className="font-medium text-foreground">{shortDate(days[active].date)}</span> {usd4(totals[active])}:{" "}
            {groups.filter((g) => days[active].byGroup[g] > 0).map((g) => `${g} ${usd4(days[active].byGroup[g])}`).join(", ")}
          </>
        ) : (
          "Hover a bar for the day's split."
        )}
      </p>
    </div>
  );
}
