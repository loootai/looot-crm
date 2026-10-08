import { Shell } from "@/components/shell/Shell";
import { searchIndex } from "@/lib/queries";
import { requireSession } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { store, user } = await requireSession();
  const index = await searchIndex(store);
  return (
    <Shell user={user} demo={store.demo} index={index}>
      {children}
    </Shell>
  );
}
