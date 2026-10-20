import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/access";
import { serverSupabase } from "@/lib/supabase/server";

/** Lands the magic link and the Google sign-in: trades the code for a session cookie, then opens the app or a same-origin `next` path. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (process.env.NEXT_PUBLIC_DEMO === "1" || !code) return NextResponse.redirect(new URL("/", url.origin));
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  // `next` from the query, else the cookie the login form set (see LoginForm), used once.
  const jar = await cookies();
  const remembered = jar.get("crm_next")?.value;
  const res = NextResponse.redirect(new URL(error ? "/login?error=link" : safeNext(url.searchParams.get("next") ?? decodeNext(remembered)), url.origin));
  if (remembered) res.cookies.set("crm_next", "", { path: "/", maxAge: 0 });
  return res;
}

function decodeNext(v: string | undefined): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return null;
  }
}
