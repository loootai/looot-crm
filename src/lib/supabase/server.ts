import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client for server components and route handlers. Acts as the signed-in user, so row level security applies. */
export async function serverSupabase() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Server components cannot set cookies. The proxy refreshes the session instead.
        }
      },
    },
  });
}
