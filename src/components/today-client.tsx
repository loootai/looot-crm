"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, ListPlus, RefreshCw } from "lucide-react";
import { addActivity, clearNextStep, markSignalsRead, setTaskDone } from "@/app/actions";
import { useQuote } from "@/components/quote";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tip } from "@/components/ui/popover";

/** Row actions for one signal on Today: open the evidence, mark read, add a task. */
export function SignalActions({ signalId, companyId, title, url }: { signalId: string; companyId: string; title: string; url: string | null }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity duration-100 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
      {url && (
        <Tip label="Open the evidence">
          <Button asChild variant="ghost" size="iconSm" className="text-muted-foreground">
            <a href={url} target="_blank" rel="noreferrer noopener" aria-label={`Open the evidence for: ${title}`}>
              <ExternalLink />
            </a>
          </Button>
        </Tip>
      )}
      <Tip label="Add a task">
        <Button
          variant="ghost"
          size="iconSm"
          className="text-muted-foreground"
          aria-label={`Add a task for: ${title}`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await addActivity({ kind: "task", body: `Follow up: ${title}`, company_id: companyId, due_at: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) });
              if (res.ok) toast("Task added, due tomorrow");
              else toast.error(res.error);
              router.refresh();
            })
          }
        >
          <ListPlus />
        </Button>
      </Tip>
      <Tip label="Mark read">
        <Button
          variant="ghost"
          size="iconSm"
          className="text-muted-foreground"
          aria-label={`Mark read: ${title}`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await markSignalsRead([signalId]);
              router.refresh();
            })
          }
        >
          <Check />
        </Button>
      </Tip>
    </span>
  );
}

export function MarkGroupRead({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markSignalsRead(ids);
          router.refresh();
        })
      }
    >
      Mark all read
    </Button>
  );
}

export function DueCheck({ id, type, title }: { id: string; type: "task" | "next_step"; title: string }) {
  const router = useRouter();
  const [done, setDone] = React.useState(false);
  return (
    <Checkbox
      checked={done}
      aria-label={`Complete: ${title}`}
      className="mt-0.5"
      onCheckedChange={async () => {
        setDone(true);
        const res = type === "task" ? await setTaskDone(id, true) : await clearNextStep(id);
        if (!res.ok) {
          setDone(false);
          toast.error(res.error);
        } else toast(type === "task" ? "Task done" : "Next step cleared. Set a new one on the deal.", { action: type === "next_step" ? { label: "Open deal", onClick: () => router.push(`/pipeline?deal=${id}`) } : undefined });
        router.refresh();
      }}
    />
  );
}

export function RefreshIntentButton({ ids, label, variant = "primary" }: { ids: string[]; label: string; variant?: "primary" | "outline" }) {
  const quote = useQuote();
  return (
    <Button variant={variant} onClick={() => quote({ kind: "intent_refresh", targetIds: ids })} disabled={!ids.length}>
      <RefreshCw /> {label}
    </Button>
  );
}

export function LinkButton({ href, children, variant = "outline" }: { href: string; children: React.ReactNode; variant?: "primary" | "outline" }) {
  return (
    <Button asChild variant={variant}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
