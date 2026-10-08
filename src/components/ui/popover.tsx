"use client";

import * as React from "react";
import { Popover as PopoverPrimitive, DropdownMenu as Menu, Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const panel = "z-50 animate-in rounded-md border border-border bg-raised text-13 text-foreground shadow-overlay";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset} collisionPadding={12} className={cn(panel, "w-72 p-3", className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuSub = Menu.Sub;
export function DropdownMenuContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content align={align} sideOffset={sideOffset} collisionPadding={12} className={cn(panel, "min-w-44 p-1", className)} {...props} />
    </Menu.Portal>
  );
}
const item =
  "flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-13 outline-none data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 max-sm:min-h-10 [&_svg]:size-4 [&_svg]:text-muted-foreground";
export function DropdownMenuItem({ className, danger, ...props }: React.ComponentProps<typeof Menu.Item> & { danger?: boolean }) {
  return <Menu.Item className={cn(item, danger && "text-danger [&_svg]:text-danger", className)} {...props} />;
}
export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(item, "pl-7", className)} {...props}>
      <Menu.ItemIndicator className="absolute left-2.5 text-primary">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </Menu.ItemIndicator>
      {children}
    </Menu.CheckboxItem>
  );
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />;
}
export function DropdownMenuSeparator() {
  return <Menu.Separator className="-mx-1 my-1 h-px bg-border" />;
}
export function DropdownMenuSubTrigger({ className, ...props }: React.ComponentProps<typeof Menu.SubTrigger>) {
  return <Menu.SubTrigger className={cn(item, "data-[state=open]:bg-muted", className)} {...props} />;
}
export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent sideOffset={4} collisionPadding={12} className={cn(panel, "min-w-36 p-1", className)} {...props} />
    </Menu.Portal>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;
/** Small label on hover and focus. */
export function Tip({ label, children, side = "top" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} collisionPadding={8} className="z-[70] max-w-64 animate-in rounded-sm bg-foreground px-2 py-1 text-xs text-background shadow-overlay">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
