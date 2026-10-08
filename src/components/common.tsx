import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Banknote, Briefcase, CheckCircle2, CircleDashed, CircleHelp, FileDiff, Layers, Newspaper, XCircle } from "lucide-react";
import { hashIndex, initials } from "@/lib/format";
import { scoreBand } from "@/lib/score";
import type { EmailStatus, SignalKind } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Rounded square with the first letter, on one of six muted tints picked from a hash of the domain. */
export function Monogram({ name, seed, size = 24, className }: { name: string; seed?: string; size?: 20 | 24 | 32 | 40; className?: string }) {
  const px = { 20: "size-5 text-[11px]", 24: "size-6 text-xs", 32: "size-8 text-sm", 40: "size-10 text-base" }[size];
  return (
    <span aria-hidden className={cn("grid shrink-0 select-none place-items-center rounded-sm font-semibold", px, `tint-${hashIndex(seed ?? name, 6)}`, className)}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Circle with initials. */
export function PersonAvatar({ name, size = 24, className }: { name: string; size?: 24 | 32 | 40; className?: string }) {
  const px = { 24: "size-6 text-[10px]", 32: "size-8 text-xs", 40: "size-10 text-sm" }[size];
  return (
    <span aria-hidden className={cn("grid shrink-0 select-none place-items-center rounded-full border border-border bg-muted font-medium text-muted-foreground", px, className)}>
      {initials(name)}
    </span>
  );
}

/** Intent score as a small chip. 0 to 29 muted, 30 to 59 neutral, 60 and up emerald. */
export function ScoreChip({ score, className, label = true }: { score: number; className?: string; label?: boolean }) {
  const band = scoreBand(score);
  return (
    <span
      className={cn(
        "tnum inline-flex h-5 min-w-7 items-center justify-center rounded-sm px-1.5 font-mono text-xs font-medium",
        band === "high" ? "bg-positive-bg text-positive" : band === "mid" ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground ring-1 ring-inset ring-border",
        className,
      )}
    >
      {label && <span className="sr-only">Intent score </span>}
      {score}
    </span>
  );
}

export const KIND_ICON: Record<SignalKind, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  hiring: Briefcase,
  funding: Banknote,
  tech: Layers,
  news: Newspaper,
  site: FileDiff,
};

export function SignalIcon({ kind, className }: { kind: SignalKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon className={cn("size-4 shrink-0 text-muted-foreground", className)} strokeWidth={1.5} aria-hidden />;
}

const EMAIL: Record<EmailStatus, { text: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  verified: { text: "verified", cls: "text-positive", Icon: CheckCircle2 },
  risky: { text: "risky", cls: "text-warning", Icon: AlertTriangle },
  invalid: { text: "invalid", cls: "text-danger", Icon: XCircle },
  unchecked: { text: "not checked", cls: "text-muted-foreground", Icon: CircleDashed },
  not_found: { text: "not found", cls: "text-muted-foreground", Icon: CircleHelp },
};

/** Email status as an icon and a word, never color alone. */
export function EmailStatusLabel({ status, className }: { status: EmailStatus; className?: string }) {
  const s = EMAIL[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs", s.cls, className)}>
      <s.Icon className="size-3.5" aria-hidden />
      {s.text}
    </span>
  );
}

/** Left-aligned empty state: a heading, one or two lines, actions. No illustration. */
export function EmptyState({ title, children, actions, className }: { title: string; children?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-xl py-10", className)}>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="mt-1.5 text-13 leading-relaxed text-muted-foreground">{children}</div>}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Inline error panel with the message and a retry control. */
export function ErrorPanel({ title = "This did not load", message, requestId, action }: { title?: string; message: string; requestId?: string | null; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex max-w-2xl items-start gap-3 rounded-md border border-danger/30 bg-danger-bg px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-13 font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-13 text-muted-foreground">{message}</p>
        {requestId && <p className="mt-1 font-mono text-xs text-muted-foreground">Request {requestId}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1 font-mono text-[11px] text-muted-foreground">{children}</kbd>;
}

/** Page frame: gutters and max width shared by every screen. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 sm:pb-10", className)}>{children}</div>;
}

export function SectionTitle({ children, aside, className }: { children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-8 items-center justify-between gap-3", className)}>
      <h2 className="text-base font-semibold">{children}</h2>
      {aside}
    </div>
  );
}

/** Filter chip that is a link, so the filter lives in the URL. */
export function ChipLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 text-xs font-medium transition-colors duration-100 max-sm:h-9 max-sm:px-3",
        active ? "border-primary bg-positive-bg text-positive" : "border-border-strong bg-surface text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** Company name with its monogram, linking to the company page. */
export function CompanyLink({ id, name, domain, className }: { id: string; name: string; domain?: string | null; className?: string }) {
  return (
    <Link href={`/companies/${id}`} className={cn("inline-flex min-w-0 items-center gap-1.5 rounded-sm hover:underline", className)}>
      <Monogram name={name} seed={domain ?? name} size={20} />
      <span className="truncate">{name}</span>
    </Link>
  );
}

/** Small "in" glyph for LinkedIn links. lucide no longer ships brand icons. */
export function LinkedinGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-3.5", className)} fill="currentColor" aria-hidden>
      <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.500-1.500v-11A1.5 1.5 0 0 0 13.500 1h-11Zm1.600 5.200h1.800V12H4.100V6.200ZM5 3.600a1.050 1.050 0 1 1 0 2.100 1.050 1.050 0 0 1 0-2.100Zm2.100 2.600h1.700v.800c.300-.500.900-.950 1.850-.950 1.650 0 2.250 1.050 2.250 2.700V12h-1.800V9.100c0-.800-.250-1.350-.950-1.350-.750 0-1.250.500-1.250 1.350V12H7.100V6.200Z" />
    </svg>
  );
}
