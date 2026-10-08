import Link from "next/link";
import { EmptyState, Page } from "@/components/common";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Page>
      <EmptyState title="Nothing here" actions={<Button asChild><Link href="/">Go to Today</Link></Button>}>
        This page does not exist or belongs to another account.
      </EmptyState>
    </Page>
  );
}
