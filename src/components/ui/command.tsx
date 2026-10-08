"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn("flex min-h-0 flex-col", className)} {...props} />;
}
export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <CommandPrimitive.Input className={cn("h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground max-sm:text-base", className)} {...props} />
    </div>
  );
}
export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn("scroll-thin max-h-[min(420px,60dvh)] overflow-y-auto p-1.5", className)} {...props} />;
}
export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="px-3 py-8 text-center text-13 text-muted-foreground" {...props} />;
}
export function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group className={cn("[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground", className)} {...props} />;
}
export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn("flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-sm px-2 text-13 data-[selected=true]:bg-muted max-sm:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground", className)}
      {...props}
    />
  );
}
