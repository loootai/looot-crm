import "server-only";
import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { accessFor } from "../access";
import { demoStore, IS_DEMO } from "../store";
import { SupabaseStore } from "../store/supabaseStore";
import type { Store } from "../store/types";
import { callCrmTool, CRM_TOOLS } from "./tools";

/** Where the protected-resource metadata lives, for the WWW-Authenticate header and discovery. */
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource`;

/** RFC 9728 metadata: this endpoint is protected by the Supabase Auth OAuth 2.1 server of this project. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: process.env.NEXT_PUBLIC_SUPABASE_URL ? [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`] : [],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "email", "profile"],
    resource_name: "looot CRM",
  };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

/**
 * The store for an MCP request. The bearer token is a Supabase access token issued by the project's
 * OAuth server, so queries run as that person and row level security applies. The allow-list is
 * checked like in the app. Demo mode needs no token.
 */
export async function storeForRequest(req: Request): Promise<Store | Response> {
  if (IS_DEMO) return demoStore();
  const origin = new URL(req.url).origin;
  const challenge = (error?: string) =>
    json(401, { error: { code: "unauthorized", message: "Connect with your CRM sign-in." } }, { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(origin)}"${error ? `, error="${error}"` : ""}` });
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return challenge();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return json(503, { error: { code: "setup_required", message: "Supabase is not configured." } });
  const db = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await db.auth.getUser(token);
  if (!data.user) return challenge("invalid_token");
  const state = accessFor(data.user);
  if (state !== "ok") return json(state === "setup" ? 503 : 403, { error: { code: state === "setup" ? "setup_required" : "forbidden", message: state === "setup" ? "Set LOOOT_CRM_ALLOWED_EMAILS on the server first." : "You are not authorised for this workspace." } });
  const { data: joined, error } = await db.rpc("join_workspace");
  if (error || !joined) return json(500, { error: { code: "workspace", message: "Could not open your workspace." } });
  return new SupabaseStore(db, (joined as { workspace_id: string }).workspace_id);
}

/** A fresh server per request: the endpoint is stateless, and every tool closes over this person's store. */
export function crmServer(store: Store): McpServer {
  const server = new McpServer({ name: "looot-crm", version: "0.2.0" }, { instructions: "A team CRM: companies, people, and cards on pipelines (boards with stages). Look things up with search, then use the ids it returns. Moving a card or adding a note is recorded in the CRM's history like in the app." });
  for (const t of CRM_TOOLS) {
    server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.input, annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false } }, (args: Record<string, unknown>) => callCrmTool(store, t, args));
  }
  return server;
}

/** Handles one MCP request over Streamable HTTP, statelessly, with JSON responses. */
export async function handleMcp(req: Request): Promise<Response> {
  const store = await storeForRequest(req);
  if (store instanceof Response) return store;
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await crmServer(store).connect(transport);
  return transport.handleRequest(req);
}
