"use client";

import * as React from "react";
import { AppShell, type ShellNavSection } from "@/components/AppShell";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Contact, Handshake, Keyboard, LogOut, Plus, Receipt, RefreshCw, Search, Settings, Upload } from "lucide-react";
import { signOut } from "@/app/actions";
import { Kbd } from "@/components/common";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/popover";
import { initials, usd2 } from "@/lib/format";
import type { SearchIndex } from "@/lib/queries";
import { shouldIgnoreKey } from "./hotkeys";

const NAV: ShellNavSection[] = [
  {
    items: [
      { href: "/", label: "Today", icon: "dashboard" },
      { href: "/companies", label: "Companies", icon: "building" },
      { href: "/people", label: "People", icon: "users" },
      { href: "/pipeline", label: "Pipeline", icon: "layers", also: ["/deals"] },
    ],
  },
  {
    items: [
      { href: "/spend", label: "Spend", icon: "receipt" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];
/** Go-to keys: "g" then the letter. */
const GO = [
  { href: "/", key: "t" },
  { href: "/companies", key: "c" },
  { href: "/people", key: "p" },
  { href: "/pipeline", key: "d" },
  { href: "/spend", key: "s" },
];

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
  const [balance, setBalance] = React.useState<{ balance: number | null; demo: boolean } | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => alive && b && setBalance(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
        const hit = GO.find((n) => n.key === e.key);
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
    <>
      <AppShell
        appName="looot-crm"
        githubHref="https://github.com/loootai/looot-crm"
        nav={NAV}
        demoLabel={demo ? "Seeded data. No Supabase project, no looot token, no charge." : undefined}
        spend={balance && balance.balance !== null ? { label: balance.demo ? "looot balance (demo)" : "looot balance", spent: usd2(balance.balance) } : undefined}
        primaryAction={{ href: "/companies?new=1", label: "New company" }}
      >
        <div className="flex h-12 items-center gap-2 border-b border-border bg-background/95 px-4 sm:px-6">
          <button
            onClick={() => setPalette(true)}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-border-strong bg-surface px-2.5 text-13 text-muted-foreground transition-colors duration-100 hover:bg-muted sm:h-8 sm:max-w-sm sm:flex-none sm:basis-72"
            aria-label="Search companies, people and deals"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 truncate text-left">Search or run a command</span>
            <span className="hidden gap-0.5 md:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="ml-auto grid size-10 shrink-0 place-items-center sm:size-8" aria-label="Account menu">
              <span className="grid size-8 place-items-center rounded-full border border-border bg-muted text-xs font-medium text-foreground">{initials(user.name)}</span>
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
        </div>
        {children}
      </AppShell>

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
    </>
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
