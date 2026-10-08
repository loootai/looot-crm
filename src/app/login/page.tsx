import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const POINTS = [
  ["Companies, contacts, deals and a pipeline board", "The CRM a team of one to five sellers needs, and no more."],
  ["Five buying signals per account, with a score", "Hiring, funding, tech stack, news and site changes. The score is a sum you can read."],
  ["About $0.03 to refresh one account", "No data subscription. You see the price before every run, and a failed run costs nothing."],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (process.env.NEXT_PUBLIC_DEMO === "1") redirect("/");
  const sp = await searchParams;
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-[#0B4A35] p-10 text-white lg:flex xl:p-14">
        <Image src="/brand/looot-wordmark-white.svg" alt="looot" width={132} height={34} unoptimized priority />
        <div className="max-w-md">
          <p className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">A small CRM that tells you which account to call this week.</p>
          <ul className="mt-8 grid gap-5">
            {POINTS.map(([title, body]) => (
              <li key={title} className="border-l border-white/25 pl-4">
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-0.5 text-13 leading-relaxed text-white/70">{body}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">Open source, MIT. Runs on your own Supabase project. Data through looot.ai.</p>
      </aside>
      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Image src="/brand/looot-wordmark-2048.png" alt="looot" width={120} height={42} className="mb-8 lg:hidden" priority />
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Sign in to looot CRM</h1>
          <p className="mb-6 mt-1 text-13 text-muted-foreground">Use your work email. No password to remember.</p>
          {configured ? (
            <LoginForm linkError={sp.error === "link"} />
          ) : (
            <div role="alert" className="rounded-md border border-warning/40 bg-warning-bg p-4 text-13">
              <p className="font-medium">Supabase is not configured</p>
              <p className="mt-1 text-muted-foreground">Set <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code className="font-mono text-xs">.env.local</code>, or run the demo with <code className="font-mono text-xs">NEXT_PUBLIC_DEMO=1</code>.</p>
            </div>
          )}
          <p className="mt-8 text-xs text-muted-foreground">
            By signing in you agree to the looot <a href="https://looot.ai/terms" className="underline underline-offset-2 hover:text-foreground">terms</a> and <a href="https://looot.ai/privacy" className="underline underline-offset-2 hover:text-foreground">privacy policy</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
