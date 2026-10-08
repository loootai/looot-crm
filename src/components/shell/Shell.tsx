"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Building2, CalendarCheck, Contact, Ellipsis, Handshake, KanbanSquare, Keyboard, LogOut, Moon, Plus, Receipt, RefreshCw, Search, Settings, Sun, Upload, Users } from "lucide-react";
import { signOut } from "@/app/actions";
import { Kbd } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tip } from "@/components/ui/popover";
import { initials, usd2 } from "@/lib/format";
import type { SearchIndex } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { shouldIgnoreKey } from "./hotkeys";

const NAV = [
  { href: "/", label: "Today", icon: CalendarCheck, key: "t" },
  { href: "/companies", label: "Companies", icon: Building2, key: "c" },
  { href: "/people", label: "People", icon: Users, key: "p" },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, key: "d" },
] as const;
const NAV2 = [
  { href: "/spend", label: "Spend", icon: Receipt, key: "s" },
  { href: "/settings", label: "Settings", icon: Settings, key: "" },
] as const;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/pipeline" && path.startsWith("/deals")));
const titleOf = (path: string) => [...NAV, ...NAV2].find((n) => isActive(path, n.href))?.label ?? "looot CRM";

const SHORTCUTS: [string, string[]][] = [
  ["Search and commands", ["⌘", "K"]],
  ["Search", ["/"]],
  ["Go to Today", ["g", "t"]],
  ["Go to Companies", ["g", "c"]],
  ["Go to People", ["g", "p"]],
  ["Go to Pipeline", ["g", "d"]],
  ["Go to Spend", ["g", "s"]],
  ["Move the row cursor", ["j", "k"]],
  ["Open the row", ["Enter"]],
  ["Select the row", ["x"]],
  ["Enrich", ["e"]],
  ["Refresh intent", ["r"]],
  ["New record", ["n"]],
  ["Pick up and drop a deal card", ["Space"]],
  ["Close the top layer", ["Esc"]],
  ["This list", ["?"]],
];

export function Shell({ children, user, demo, index }: { children: React.ReactNode; user: { name: string; email: string }; demo: boolean; index: SearchIndex }) {
  const path = usePathname();
  const router = useRouter();
  const [palette, setPalette] = React.useState(false);
  const [help, setHelp] = React.useState(false);
  const [more, setMore] = React.useState(false);

  React.useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const w = window as unknown as { __crmGoPending?: boolean };
    const clear = () => {
      w.__crmGoPending = false;
      if (pending) clearTimeout(pending);
      pending = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (shouldIgnoreKey(e)) return;
      if (w.__crmGoPending) {
        const hit = [...NAV, ...NAV2].find((n) => n.key && n.key === e.key);
        clear();
        if (hit) {
          e.preventDefault();
          e.stopImmediatePropagation();
          router.push(hit.href);
        }
        return;
      }
      if (e.key === "g") {
        w.__crmGoPending = true;
        pending = setTimeout(clear, 900);
      } else if (e.key === "/") {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      }
    };
    // Capture phase, so the go-to sequence wins over a screen's own single-key shortcuts.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clear();
    };
  }, [router]);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-13 focus:text-primary-foreground">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-14 shrink-0 flex-col bg-sidebar text-sidebar-foreground sm:flex lg:w-[220px]">
        <Link href="/" className="flex h-12 items-center gap-2 px-[14px] lg:px-4" aria-label="looot CRM, go to Today">
          <Image src="/brand/looot-mark.svg" alt="" width={28} height={28} unoptimized />
          <span className="hidden text-[15px] font-semibold tracking-[-0.01em] lg:inline">CRM</span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
          {NAV.map((n) => (
            <NavLink key={n.href} item={n} active={isActive(path, n.href)} />
          ))}
          <div className="mx-2 my-2 h-px bg-white/10" />
          {NAV2.map((n) => (
            <NavLink key={n.href} item={n} active={isActive(path, n.href)} />
          ))}
        </nav>
        <button onClick={() => setHelp(true)} className="m-2 flex h-8 items-center gap-2.5 rounded-md px-2.5 text-13 text-sidebar-muted transition-colors duration-100 hover:bg-white/5 hover:text-sidebar-foreground max-lg:justify-center max-lg:px-0" aria-label="Keyboard shortcuts">
          <Keyboard className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="hidden lg:inline">Shortcuts</span>
          <span className="ml-auto hidden font-mono text-xs lg:inline">?</span>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:gap-3 sm:px-6">
          <Image src="/brand/looot-mark.svg" alt="" width={24} height={24} unoptimized className="sm:hidden" />
          <p className="truncate text-sm font-semibold sm:text-base">{titleOf(path)}</p>
          <button
            onClick={() => setPalette(true)}
            className="ml-auto flex h-8 w-8 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface text-13 text-muted-foreground transition-colors duration-100 hover:bg-muted max-sm:size-10 md:w-64 md:justify-start md:px-2.5"
            aria-label="Search companies, people and deals"
          >
            <Search className="size-4 shrink-0" />
            <span className="hidden flex-1 text-left md:inline">Search or run a command</span>
            <span className="hidden gap-0.5 md:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          {demo && (
            <Tip label="Seeded data. No Supabase project, no looot token, no charge.">
              <span className="inline-flex h-6 shrink-0 items-center rounded-sm border border-warning/40 bg-warning-bg px-2 text-xs font-medium text-warning" tabIndex={0}>
                Demo data
              </span>
            </Tip>
          )}
          <Balance />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-muted text-xs font-medium text-foreground max-sm:hidden" aria-label="Account menu">
              {initials(user.name)}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>
                <span className="block text-13 font-medium text-foreground">{user.name}</span>
                <span className="block font-normal">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/settings")}>
                <Settings /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setHelp(true)}>
                <Keyboard /> Keyboard shortcuts
              </DropdownMenuItem>
              {!demo && (
                <DropdownMenuItem onSelect={() => signOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid h-14 grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        {NAV.map((n) => {
          const active = isActive(path, n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
              <n.icon className="size-5" strokeWidth={active ? 2 : 1.5} />
              {n.label}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium", NAV2.some((n) => isActive(path, n.href)) ? "text-primary" : "text-muted-foreground")} aria-haspopup="dialog">
          <Ellipsis className="size-5" strokeWidth={1.5} />
          More
        </button>
      </nav>

      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="top-auto bottom-0 max-w-none translate-y-0 animate-up rounded-b-none sm:hidden" hideClose>
          <DialogHeader className="pr-5">
            <DialogTitle>{user.name}</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <div className="grid p-2 pb-4">
            {NAV2.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setMore(false)} className="flex h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted">
                <n.icon className="size-4 text-muted-foreground" /> {n.label}
              </Link>
            ))}
            {!demo && (
              <button onClick={() => signOut()} className="flex h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted">
                <LogOut className="size-4 text-muted-foreground" /> Sign out
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Palette open={palette} onOpenChange={setPalette} index={index} />

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Every shortcut also has a visible button.</DialogDescription>
          </DialogHeader>
          <DialogBody className="py-2">
            <dl>
              {SHORTCUTS.map(([label, keys]) => (
                <div key={label} className="flex h-9 items-center justify-between border-b border-border text-13 last:border-0">
                  <dt>{label}</dt>
                  <dd className="flex gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NavLink({ item, active }: { item: { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; key: string }; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-13 font-medium transition-colors duration-100 focus-visible:outline-[#7fe0b8] max-lg:justify-center max-lg:px-0",
        active ? "bg-sidebar-active text-sidebar-foreground" : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
      )}
    >
      <item.icon className="size-4 shrink-0" strokeWidth={1.5} />
      <span className="hidden lg:inline">{item.label}</span>
      {item.key && <span className="ml-auto hidden font-mono text-[11px] opacity-0 transition-opacity duration-100 group-hover:opacity-70 lg:inline">g {item.key}</span>}
    </Link>
  );
}

function Balance() {
  const [state, setState] = React.useState<{ balance: number | null; demo: boolean } | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetch("/api/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => alive && b && setState(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!state || state.balance === null) return null;
  return (
    <span className="tnum hidden shrink-0 whitespace-nowrap text-13 text-muted-foreground lg:inline">
      Balance <span className="font-mono text-foreground">{usd2(state.balance)}</span>
      {state.demo ? " (demo)" : ""}
    </span>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Tip label={dark ? "Switch to light" : "Switch to dark"}>
      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
        {dark ? <Sun /> : <Moon />}
      </Button>
    </Tip>
  );
}

function Palette({ open, onOpenChange, index }: { open: boolean; onOpenChange: (o: boolean) => void; index: SearchIndex }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };
  const needle = q.trim().toLowerCase();
  const pick = <T extends { name: string }>(rows: T[], extra: (r: T) => string) => (needle ? rows.filter((r) => `${r.name} ${extra(r)}`.toLowerCase().includes(needle)) : rows).slice(0, 8);
  const companies = pick(index.companies, (c) => c.domain);
  const people = pick(index.people, (p) => p.sub);
  const deals = pick(index.deals, (d) => d.sub);
  const actions = [
    { label: "New company", icon: Plus, run: () => go("/companies?new=1") },
    { label: "New deal", icon: Handshake, run: () => go("/pipeline?new=1") },
    { label: "Import CSV", icon: Upload, run: () => go("/companies?import=1") },
    {
      label: "Refresh intent for selected",
      icon: RefreshCw,
      run: () => {
        onOpenChange(false);
        const handled = !window.dispatchEvent(new CustomEvent("crm:refresh-selected", { cancelable: true }));
        if (!handled) toast("Select companies in the Companies table first.");
      },
    },
    { label: "Go to Spend", icon: Receipt, run: () => go("/spend") },
  ].filter((a) => !needle || a.label.toLowerCase().includes(needle));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12dvh] max-w-xl translate-y-0 animate-in" hideClose aria-describedby={undefined}>
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <Command shouldFilter={false} label="Search and commands">
          <CommandInput value={q} onValueChange={setQ} placeholder="Search companies, people, deals, or type a command" />
          <CommandList>
            <CommandEmpty>Nothing matches &quot;{q}&quot;.</CommandEmpty>
            {companies.length > 0 && (
              <CommandGroup heading="Companies">
                {companies.map((c) => (
                  <CommandItem key={c.id} value={`c-${c.id}`} onSelect={() => go(`/companies/${c.id}`)}>
                    <Building2 />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{c.domain}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {people.length > 0 && (
              <CommandGroup heading="People">
                {people.map((p) => (
                  <CommandItem key={p.id} value={`p-${p.id}`} onSelect={() => go(`/people?contact=${p.id}`)}>
                    <Contact />
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{p.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {deals.length > 0 && (
              <CommandGroup heading="Deals">
                {deals.map((d) => (
                  <CommandItem key={d.id} value={`d-${d.id}`} onSelect={() => go(`/pipeline?deal=${d.id}`)}>
                    <Handshake />
                    <span className="truncate">{d.name}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{d.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {actions.length > 0 && (
              <CommandGroup heading="Actions">
                {actions.map((a) => (
                  <CommandItem key={a.label} value={`a-${a.label}`} onSelect={a.run}>
                    <a.icon />
                    {a.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
