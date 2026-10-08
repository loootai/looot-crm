"use client";

import { ErrorPanel, Page } from "@/components/common";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Page>
      <ErrorPanel message={error.message || "Something went wrong while loading this screen."} requestId={error.digest} action={<Button onClick={reset}>Try again</Button>} />
    </Page>
  );
}
