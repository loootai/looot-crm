import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-xs font-medium [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-muted text-foreground",
      muted: "bg-muted text-muted-foreground",
      positive: "bg-positive-bg text-positive",
      warning: "bg-warning-bg text-warning",
      danger: "bg-danger-bg text-danger",
      outline: "border border-border-strong text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
