import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let user: { id: string; email: string; email_confirmed_at: string } | null = null;
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }));

const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const on = { id: "1", email: "owner@acme.example", email_confirmed_at: "x" };
const off = { id: "2", email: "stranger@evil.example", email_confirmed_at: "x" };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("LOOOT_CRM_ALLOWED_EMAILS", "owner@acme.example");
  user = null;
});
afterEach(() => vi.unstubAllEnvs());

const loc = (r: Response) => r.headers.get("location");

describe("proxy", () => {
  it("sends anon page requests to /login and answers anon API calls 401", async () => {
    const { proxy } = await import("./proxy");
    expect(loc(await proxy(req("/companies")))).toBe("http://localhost:3000/login?next=%2Fcompanies");
    expect((await proxy(req("/api/export?table=deals"))).status).toBe(401);
  });
  it("sends a stranger to /not-authorised and answers APIs 403", async () => {
    const { proxy } = await import("./proxy");
    user = off;
    expect(loc(await proxy(req("/")))).toBe("http://localhost:3000/not-authorised");
    expect((await proxy(req("/api/balance"))).status).toBe(403);
  });
  it("sends everyone to /setup when no allow-list is set", async () => {
    vi.stubEnv("LOOOT_CRM_ALLOWED_EMAILS", "");
    const { proxy } = await import("./proxy");
    user = on;
    expect(loc(await proxy(req("/")))).toBe("http://localhost:3000/setup");
    expect((await proxy(req("/api/balance"))).status).toBe(503);
  });
  it("lets a listed user through", async () => {
    const { proxy } = await import("./proxy");
    user = on;
    const res = await proxy(req("/companies"));
    expect(res.status).toBe(200);
    expect(loc(res)).toBeNull();
  });
  it("keeps the sign-in, callback, setup and not-authorised pages reachable", async () => {
    const { proxy } = await import("./proxy");
    for (const p of ["/login", "/auth/callback", "/setup", "/not-authorised"]) expect(loc(await proxy(req(p))), p).toBeNull();
  });
  it("keeps the consent page address through sign-in", async () => {
    const { proxy } = await import("./proxy");
    expect(loc(await proxy(req("/oauth/consent?authorization_id=a1")))).toBe("http://localhost:3000/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Da1");
  });
  it("leaves /mcp, the OAuth metadata and the cron routes to their own bearer check", async () => {
    const { proxy } = await import("./proxy");
    user = off;
    for (const p of ["/mcp", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "/api/cron/signals", "/api/cron/prospects"]) {
      const res = await proxy(req(p));
      expect(res.status, p).toBe(200);
      expect(loc(res), p).toBeNull();
    }
  });
  it("demo mode stays open with no sign-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO", "1");
    const { proxy } = await import("./proxy");
    for (const p of ["/", "/companies", "/api/balance"]) expect((await proxy(req(p))).status, p).toBe(200);
  });
});
