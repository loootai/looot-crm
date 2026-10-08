import "server-only";
import { redirect } from "next/navigation";
import { seedDemo } from "@/demo/seed";
import { serverSupabase } from "../supabase/server";
import { MemoryStore } from "./demoStore";
import { SupabaseStore } from "./supabaseStore";
import type { Store } from "./types";

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

const g = globalThis as unknown as { __loootCrmDemo?: MemoryStore };

/** The demo store lives in the server process. Writes last until the process restarts. */
export function demoStore(): MemoryStore {
  if (!g.__loootCrmDemo) g.__loootCrmDemo = new MemoryStore(seedDemo(new Date()));
  return g.__loootCrmDemo;
}

export interface Session {
  store: Store;
  user: { id: string; email: string; name: string };
}

/** The store for this request, or null when nobody is signed in. Demo mode never creates a Supabase client. */
export async function getSession(): Promise<Session | null> {
  if (IS_DEMO) return { store: demoStore(), user: { id: "demo", email: "ines@harborline.example", name: "Inès Marchetti" } };
  const db = await serverSupabase();
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const email = data.user.email ?? "";
  const name = (data.user.user_metadata?.full_name as string | undefined) ?? email.split("@")[0] ?? "You";
  return { store: new SupabaseStore(db), user: { id: data.user.id, email, name } };
}

/** For pages: the store, or a redirect to /login. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export type { Store } from "./types";
