import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-13 font-medium transition-[background-color,border-color,color,transform] duration-100 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline: "border border-border-strong bg-surface text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        subtle: "bg-muted text-foreground hover:bg-border",
        danger: "border border-danger/40 bg-surface text-danger hover:bg-danger-bg",
        link: "h-auto px-0 text-primary underline-offset-2 hover:underline",
      },
      size: {
        md: "h-8 px-3 max-sm:h-10",
        sm: "h-7 px-2 text-xs max-sm:h-9",
        icon: "size-8 max-sm:size-10",
        iconSm: "size-7",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...(asChild ? {} : { type: type ?? "button" })} {...props} />;
}

export { Button, buttonVariants };
