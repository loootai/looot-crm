"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Remembers what had focus when an overlay opened and hands focus back when it closes.
 * Radix only returns focus to a DialogTrigger, and every overlay here is opened from state
 * (a button's onClick, a shortcut, a URL), so without this focus would drop to <body>.
 */
function useReturnFocus(onCloseAutoFocus?: (event: Event) => void) {
  const opener = React.useRef<HTMLElement | null>(null);
  const remember = React.useCallback(() => {
    const el = document.activeElement;
    opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
  }, []);
  const giveBack = React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      const el = opener.current;
      if (event.defaultPrevented || !el || !el.isConnected) return;
      event.preventDefault();
      el.focus();
    },
    [onCloseAutoFocus],
  );
  return { remember, giveBack };
}

/** Mounts with the overlay content, before Radix moves focus into it. */
function RememberOpener({ remember }: { remember: () => void }) {
  // Once per mount. Strict mode runs effects twice, and by the second run focus is already inside the overlay.
  const done = React.useRef(false);
  React.useLayoutEffect(() => {
    if (done.current) return;
    done.current = true;
    remember();
  }, [remember]);
  return null;
}

const overlay = "fixed inset-0 z-50 bg-[#06150f]/45 animate-in dark:bg-black/60";

/** `top` puts the dialog above an open sheet. The quote dialog uses it. */
export function DialogContent({ className, children, hideClose, top, onCloseAutoFocus, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { hideClose?: boolean; top?: boolean }) {
  const { remember, giveBack } = useReturnFocus(onCloseAutoFocus);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn(overlay, top && "z-[60]")} />
      <DialogPrimitive.Content
        className={cn(
          top ? "z-[60]" : "z-50",
          "fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 animate-dialog flex-col overflow-hidden rounded-lg border border-border bg-raised shadow-overlay outline-none focus-visible:outline-none",
          className,
        )}
        {...props}
        onCloseAutoFocus={giveBack}
      >
        <RememberOpener remember={remember} />
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Side panel. Slides from the right, full screen under 640 px. */
export function SheetContent({ className, children, onCloseAutoFocus, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const { remember, giveBack } = useReturnFocus(onCloseAutoFocus);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content className={cn("fixed inset-y-0 right-0 z-50 flex w-full animate-sheet flex-col border-l border-border bg-raised shadow-overlay sm:max-w-[480px]", className)} {...props} onCloseAutoFocus={giveBack}>
        <RememberOpener remember={remember} />
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-sm:size-10" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shrink-0 border-b border-border px-5 py-4 pr-12", className)} {...props} />;
}
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-base font-semibold leading-snug tracking-[-0.01em]", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1 text-13 text-muted-foreground", className)} {...props} />;
}
