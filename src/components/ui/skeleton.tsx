import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse-slow rounded-sm bg-muted", className)} />;
}
