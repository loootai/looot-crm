import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-md border border-border-strong bg-surface px-2.5 text-13 text-foreground placeholder:text-muted-foreground/80 transition-colors duration-100 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 disabled:opacity-60 aria-[invalid=true]:border-danger max-sm:text-base";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(field, "h-8 max-sm:h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        field,
        "h-8 appearance-none bg-[length:14px] bg-[right_8px_center] bg-no-repeat pr-7 max-sm:h-10",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235b6b63%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-foreground", className)} {...props} />;
}

/** Label above, control, optional hint or error below. */
export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor: string; hint?: string; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
