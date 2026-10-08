"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("scroll-thin flex h-10 items-end gap-5 relative overflow-x-auto border-b border-border", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-13 font-medium text-muted-foreground transition-colors duration-100 hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-5 focus-visible:outline-none", className)} {...props} />;
}
