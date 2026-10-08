import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-separate border-spacing-0 text-13", className)} {...props} />;
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("h-9 whitespace-nowrap border-b border-border bg-surface px-3 text-left text-xs font-medium text-muted-foreground", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-9 border-b border-border px-3 align-middle", className)} {...props} />;
}
