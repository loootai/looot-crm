import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState, Page } from "@/components/common";
import { DealPageView } from "@/components/pipeline/DealView";
import { Button } from "@/components/ui/button";
import { dealDetail } from "@/lib/queries";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Deal" };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requireSession();
  const detail = await dealDetail(store, id);
  return (
    <Page>
      <Link href="/pipeline" className="mb-3 inline-flex items-center gap-1.5 text-13 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Pipeline
      </Link>
      {detail ? (
        <DealPageView detail={detail} />
      ) : (
        <EmptyState title="This deal does not exist" actions={<Button asChild><Link href="/pipeline">Go to Pipeline</Link></Button>}>
          It was deleted, or it belongs to another account.
        </EmptyState>
      )}
    </Page>
  );
}
