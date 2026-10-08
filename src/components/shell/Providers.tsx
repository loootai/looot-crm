"use client";

import * as React from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/popover";
import { QuoteProvider } from "@/components/quote";

/** Lets a link pick the theme: ?theme=dark or ?theme=light. Used for screenshots and reviews. */
function ThemeFromUrl() {
  const { setTheme } = useTheme();
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("theme");
    if (t === "dark" || t === "light") setTheme(t);
  }, [setTheme]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <ThemeFromUrl />
      <TooltipProvider delayDuration={250}>
        <QuoteProvider>{children}</QuoteProvider>
        <Toaster
          position="bottom-right"
          offset={{ bottom: 20, right: 20 }}
          mobileOffset={{ bottom: 76 }}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: "flex w-full items-start gap-2.5 rounded-md border border-border bg-raised px-3.5 py-3 text-13 text-foreground shadow-overlay",
              title: "font-medium",
              description: "text-muted-foreground",
              actionButton: "ml-auto shrink-0 rounded-sm bg-primary px-2 py-1 text-xs font-medium text-primary-foreground",
              error: "border-danger/40",
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
