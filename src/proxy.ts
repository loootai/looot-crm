import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refreshes the Supabase session cookie on every request and sends signed-out visitors to /login. Does nothing in demo mode. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (process.env.NEXT_PUBLIC_DEMO === "1") {
    if (path.startsWith("/login")) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next({ request });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    // Not configured yet: the sign-in page explains which variables to set.
    if (path.startsWith("/login") || path.startsWith("/api/")) return NextResponse.next({ request });
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
  if (!data.user && !path.startsWith("/login") && !path.startsWith("/auth/") && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png|favicon.ico).*)"],
};
