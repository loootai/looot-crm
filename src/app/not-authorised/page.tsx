import type { Metadata } from "next";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not authorised" };
export const dynamic = "force-dynamic";

/** Shown to a signed-in user whose email is not on the allow-list. */
export default function NotAuthorisedPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <h1 className="text-xl font-semibold tracking-[-0.01em]">Not authorised for this workspace</h1>
      <p className="mt-2 text-13 text-muted-foreground">You are signed in, but your email is not on this workspace&apos;s allow-list. Ask the owner to add it, or sign in with another email.</p>
      <form action={signOut} className="mt-6">
        <Button type="submit" variant="outline" size="sm">Sign out</Button>
      </form>
    </main>
  );
}
