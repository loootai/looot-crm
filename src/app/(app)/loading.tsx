import { Page } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Page>
      <div className="flex items-center gap-2" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="ml-auto h-8 w-28" />
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-border bg-surface">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex h-9 items-center gap-4 border-b border-border px-3 last:border-0">
            <Skeleton className="size-4" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-10" />
            <Skeleton className="h-3.5 w-56 max-md:hidden" />
            <Skeleton className="ml-auto h-3.5 w-20 max-sm:hidden" />
          </div>
        ))}
      </div>
    </Page>
  );
}
