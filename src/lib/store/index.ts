import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { seedDemo } from "@/demo/seed";
import { accessFor, type AccessState } from "../access";
import { serverSupabase } from "../supabase/server";
import type { WorkspaceInfo, WorkspaceRole } from "../types";
import { DEMO_WORKSPACE, MemoryStore } from "./demoStore";
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
  workspace: WorkspaceInfo;
}

export type Gate = { kind: "anon" } | { kind: "setup" } | { kind: "denied"; email: string } | { kind: "ok"; session: Session };

/**
 * Who is asking and whether the allow-list lets them in. Demo mode is always "ok" and never creates a
 * Supabase client. A user who passes the allow-list joins their workspace: an invitation for their
 * email is claimed, or a new workspace is made with them as the owner. Cached for one request.
 */
export const resolveGate = cache(async (): Promise<Gate> => {
  if (IS_DEMO) return { kind: "ok", session: { store: demoStore(), user: { id: "demo", email: "ines@harborline.example", name: "Inès Marchetti" }, workspace: { ...DEMO_WORKSPACE, name: demoStore().workspaceName } } };
  const db = await serverSupabase();
  const { data } = await db.auth.getUser();
  if (!data.user) return { kind: "anon" };
  const email = data.user.email ?? "";
  const state: AccessState = accessFor(data.user);
  if (state === "setup") return { kind: "setup" };
  if (state === "denied") return { kind: "denied", email };
  const name = (data.user.user_metadata?.full_name as string | undefined) ?? email.split("@")[0] ?? "You";
  const { data: joined, error } = await db.rpc("join_workspace");
  if (error || !joined) throw new Error(`Could not open your workspace: ${error?.message ?? "no answer"}. Check that every migration in supabase/migrations is applied.`);
  const ws = joined as { workspace_id: string; role: WorkspaceRole; name: string };
  const workspace: WorkspaceInfo = { id: ws.workspace_id, role: ws.role, name: ws.name };
  return { kind: "ok", session: { store: new SupabaseStore(db, workspace.id), user: { id: data.user.id, email, name }, workspace } };
});

/** The store for this request, or null when nobody is signed in or the user is not on the allow-list. */
export async function getSession(): Promise<Session | null> {
  const g = await resolveGate();
  return g.kind === "ok" ? g.session : null;
}

/** For pages: the store, or a redirect to /login. */
export async function requireSession(): Promise<Session> {
  const g = await resolveGate();
  if (g.kind === "anon") redirect("/login");
  if (g.kind === "setup") redirect("/setup");
  if (g.kind === "denied") redirect("/not-authorised");
  return g.session;
}

export type { Store } from "./types";
