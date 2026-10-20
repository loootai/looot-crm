import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("MCP endpoint auth", () => {
  it("answers 401 with the metadata location when there is no bearer token", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
    const { handleMcp } = await import("./server");
    const res = await handleMcp(new Request("https://crm.example/mcp", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Bearer resource_metadata="https://crm.example/.well-known/oauth-protected-resource"');
  });

  it("points clients at the project's Supabase OAuth server", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
    const { protectedResourceMetadata } = await import("./server");
    expect(protectedResourceMetadata("https://crm.example")).toMatchObject({ resource: "https://crm.example/mcp", authorization_servers: ["http://127.0.0.1:1/auth/v1"], bearer_methods_supported: ["header"] });
  });

  it("serves tools without a token in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO", "1");
    const { handleMcp } = await import("./server");
    const res = await handleMcp(
      new Request("https://crm.example/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toContain("move_card");
  });
});
