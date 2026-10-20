import { createServerClient } from "@supabase/ssr";
import { accessFor } from "@/lib/access";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request. Signed-out visitors go to /login (401 for the API).
 * Signed-in users who are not on the allow-list go to /not-authorised (403 for the API), and everyone goes to
 * /setup (503 for the API) while no allow-list is set. Does nothing in demo mode.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // The MCP endpoint and its OAuth metadata check their own bearer token; they never use the cookie session.
  if (path === "/mcp" || path.startsWith("/mcp/") || path.startsWith("/.well-known/")) return NextResponse.next({ request });
  // Scheduled jobs check CRON_SECRET themselves; there is no cookie session on a cron call.
  if (path.startsWith("/api/cron/")) return NextResponse.next({ request });
  if (process.env.NEXT_PUBLIC_DEMO === "1") {
    if (path.startsWith("/login")) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next({ request });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    // Not configured yet: the sign-in page explains which variables to set.
    if (path.startsWith("/login")) return NextResponse.next({ request });
    if (path.startsWith("/api/")) return refuse(503, "setup_required", "Supabase is not configured.");
    return NextResponse.redirect(new URL("/login", request.url));
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const isApi = path.startsWith("/api/");
  const open = path.startsWith("/login") || path.startsWith("/auth/");
  if (!data.user) {
    if (isApi) return refuse(401, "unauthorized", "Sign in first.");
    if (open || path === "/setup" || path === "/not-authorised") return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Come back here after signing in, e.g. to the consent page of an app being connected.
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  const state = accessFor(data.user);
  if (state === "ok") {
    if (path === "/setup" || path === "/not-authorised") return NextResponse.redirect(new URL("/", request.url));
    return response;
  }
  if (path.startsWith("/auth/")) return response;
  if (isApi) return state === "setup" ? refuse(503, "setup_required", "Set LOOOT_CRM_ALLOWED_EMAILS on the server, then try again.") : refuse(403, "forbidden", "You are not authorised for this workspace.");
  const target = state === "setup" ? "/setup" : "/not-authorised";
  if (path === target) return response;
  return NextResponse.redirect(new URL(target, request.url));
}

function refuse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png|favicon.ico).*)"],
};
