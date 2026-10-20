import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionNames, BEARER_ROUTES, CRON_ROUTES, PUBLIC_ROUTES, routeMap } from "./routeMap";

type FakeUser = { id: string; email: string; email_confirmed_at: string } | null;
let user: FakeUser = null;
let joined = false;
let nextCookie: string | undefined;
const DB_TOUCHED = "db touched";

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], get: (n: string) => (n === "crm_next" && nextCookie ? { name: n, value: nextCookie } : undefined), set: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user } }), signOut: async () => ({}), exchangeCodeForSession: async () => ({ error: null }) },
    from: () => { throw new Error("db touched"); },
    rpc: async (fn: string) => {
      // Joining the workspace is the first database call of an allowed user. Anything else counts as touching data.
      if (fn !== "join_workspace") throw new Error("db touched");
      joined = true;
      return { data: { workspace_id: "w1", role: "owner", name: "Workspace" }, error: null };
    },
  }),
}));

// The MCP endpoint builds its own client from the bearer token. "token-<email>" stands for a valid Supabase access token.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async (token: string) => ({ data: { user: token.startsWith("token-") ? signedIn(token.slice(6)) : null } }) },
    from: () => { throw new Error("db touched"); },
    rpc: async (fn: string) => {
      if (fn !== "join_workspace") throw new Error("db touched");
      joined = true;
      return { data: { workspace_id: "w1", role: "owner", name: "Workspace" }, error: null };
    },
  }),
}));

const signedIn = (email: string): FakeUser => ({ id: "u1", email, email_confirmed_at: "2026-10-01T00:00:00Z" });
const GATE_CLOSED = [401, 403, 503];

async function call(file: string, method: string): Promise<{ status: number; touchedDb: boolean }> {
  const mod = await import(/* @vite-ignore */ file);
  const req = new Request("http://localhost/x?table=companies", method === "GET" ? {} : { method, headers: { "Content-Type": "application/json" }, body: "{}" });
  try {
    const res: Response = await mod[method](req, { params: Promise.resolve({ key: "k" }) });
    return { status: res.status, touchedDb: false };
  } catch (e) {
    if (e instanceof Error && e.message === DB_TOUCHED) return { status: 200, touchedDb: true };
    throw e;
  }
}

const routes = routeMap().filter((r) => !PUBLIC_ROUTES.includes(r.url) && !BEARER_ROUTES.includes(r.url) && !CRON_ROUTES.includes(r.url));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("LOOOT_CRM_ALLOWED_EMAILS", "owner@acme.example");
  vi.stubEnv("LOOOT_CRM_ALLOWED_DOMAINS", "");
  vi.stubEnv("LOOOT_TOKEN", "");
  vi.stubEnv("SPEND_RATE_LIMIT_PER_MIN", "1000");
  vi.resetModules();
  user = null;
  joined = false;
  nextCookie = undefined;
});
afterEach(() => vi.unstubAllEnvs());

describe("route map", () => {
  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(6);
    for (const r of routes) expect(r.methods.length, r.url).toBeGreaterThan(0);
  });
});

describe.each(routes.flatMap((r) => r.methods.map((m) => ({ ...r, method: m }))))("$method $url", ({ file, method }) => {
  it("is closed when not signed in", async () => {
    user = null;
    expect((await call(file, method)).status).toBe(401);
  });
  it("is closed to a signed-in user who is not on the list", async () => {
    user = signedIn("stranger@evil.example");
    const r = await call(file, method);
    expect(r.touchedDb).toBe(false);
    expect(joined).toBe(false);
    expect(r.status).toBe(403);
  });
  it("is closed to everyone when no allow-list is set", async () => {
    vi.stubEnv("LOOOT_CRM_ALLOWED_EMAILS", "");
    user = signedIn("owner@acme.example");
    const r = await call(file, method);
    expect(r.touchedDb).toBe(false);
    expect(r.status).toBe(503);
  });
  it("is open to a user on the list", async () => {
    user = signedIn("Owner@Acme.example");
    const r = await call(file, method);
    expect(r.touchedDb || !GATE_CLOSED.includes(r.status)).toBe(true);
  });
});

describe("server actions", () => {
  const names = actionNames().filter((n) => n !== "signOut");
  it("finds the actions", () => expect(names.length).toBeGreaterThan(10));
  it.each(names)("%s refuses anon, strangers and a missing allow-list", async (name) => {
    const mod = await import("../app/actions");
    const fn = mod[name as keyof typeof mod] as unknown as (...a: unknown[]) => Promise<unknown>;
    const refused = (out: unknown) => Array.isArray(out) ? out.length === 0 : out === null || (typeof out === "object" && (out as { ok?: boolean }).ok === false);
    user = null;
    expect(refused(await fn("x", "x"))).toBe(true);
    user = signedIn("stranger@evil.example");
    expect(refused(await fn("x", "x"))).toBe(true);
    vi.stubEnv("LOOOT_CRM_ALLOWED_EMAILS", "");
    user = signedIn("owner@acme.example");
    expect(refused(await fn("x", "x"))).toBe(true);
  });
});

describe("spending", () => {
  it("rate-limits /api/actions and /api/quote per user", async () => {
    vi.stubEnv("SPEND_RATE_LIMIT_PER_MIN", "2");
    vi.resetModules();
    user = signedIn("owner@acme.example");
    for (const url of ["actions", "quote"]) {
      const mod = await import(/* @vite-ignore */ routes.find((r) => r.url === `/api/${url}`)!.file);
      const send = () => mod.POST(new Request("http://localhost/x", { method: "POST", body: "{}" }));
      expect((await send()).status).toBe(400);
      expect((await send()).status).toBe(400);
      expect((await send()).status).toBe(429);
    }
  });
});

describe("auth callback", () => {
  const cb = async (qs: string) => {
    const mod = await import("../app/auth/callback/route");
    return mod.GET(new Request(`http://localhost:3000/auth/callback?${qs}`));
  };
  it.each(["//evil.example", "https://evil.example/x", "/\\evil.example", "javascript:alert(1)"])("ignores next=%s", async (next) => {
    user = signedIn("owner@acme.example");
    const res = await cb(`code=abc&next=${encodeURIComponent(next)}`);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });
  it("follows a same-origin relative next", async () => {
    const res = await cb(`code=abc&next=${encodeURIComponent("/pipeline")}`);
    expect(res.headers.get("location")).toBe("http://localhost:3000/pipeline");
  });
  it("follows the next the login form remembered in a cookie, and still refuses another origin", async () => {
    nextCookie = encodeURIComponent("/oauth/consent?authorization_id=a1");
    expect((await cb("code=abc")).headers.get("location")).toBe("http://localhost:3000/oauth/consent?authorization_id=a1");
    nextCookie = encodeURIComponent("//evil.example");
    expect((await cb("code=abc")).headers.get("location")).toBe("http://localhost:3000/");
    nextCookie = "%E0%A4%A";
    expect((await cb("code=abc")).headers.get("location")).toBe("http://localhost:3000/");
  });
});

describe("MCP endpoint", () => {
  const mcp = async (token?: string) => {
    const mod = await import("../app/mcp/route");
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return mod.POST(new Request("http://localhost/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }));
  };
  it("ignores the cookie session and asks for a bearer token", async () => {
    user = signedIn("owner@acme.example");
    const res = await mcp();
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain('resource_metadata="http://localhost/.well-known/oauth-protected-resource"');
    expect(joined).toBe(false);
  });
  it("refuses a token Supabase does not recognise", async () => {
    const res = await mcp("garbage");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
  });
  it("refuses a valid token for someone not on the list, before touching data", async () => {
    expect((await mcp("token-stranger@evil.example")).status).toBe(403);
    expect(joined).toBe(false);
  });
  it("is closed to everyone when no allow-list is set", async () => {
    vi.stubEnv("LOOOT_CRM_ALLOWED_EMAILS", "");
    expect((await mcp("token-owner@acme.example")).status).toBe(503);
    expect(joined).toBe(false);
  });
  it("lists the tools for a user on the list", async () => {
    const res = await mcp("token-Owner@Acme.example");
    expect(res.status).toBe(200);
    expect(joined).toBe(true);
    expect((await res.json()).result.tools.length).toBe(11);
  });
});

describe("OAuth metadata", () => {
  it("is public and names the project's Supabase OAuth server", async () => {
    for (const r of routeMap().filter((x) => x.url.startsWith("/.well-known/"))) {
      const mod = await import(/* @vite-ignore */ r.file);
      const body = await (await mod.GET(new Request("https://crm.example" + r.url))).json();
      expect(body).toMatchObject({ resource: "https://crm.example/mcp", authorization_servers: ["http://127.0.0.1:1/auth/v1"] });
    }
  });
});

describe("cron and webhooks", () => {
  it("every one is listed in CRON_ROUTES, so it gets the tests below", () => {
    const hooks = routeMap().filter((r) => /cron|webhook/i.test(r.url));
    expect(hooks.map((r) => r.url)).toEqual(CRON_ROUTES);
    for (const r of hooks) expect(r.methods).toEqual(["GET"]);
  });
  const SECRET = "s3cret-for-the-cron-tests";
  const cron = async (url: string, auth?: string) => {
    const file = routeMap().find((r) => r.url === url)!.file;
    const mod = await import(/* @vite-ignore */ file);
    const res: Response = await mod.GET(new Request(`http://localhost${url}`, { headers: auth ? { authorization: auth } : {} }));
    return res.status;
  };
  describe.each(CRON_ROUTES)("%s", (url) => {
    it("is closed while CRON_SECRET is unset, even with a signed-in user", async () => {
      vi.stubEnv("CRON_SECRET", "");
      user = signedIn("owner@acme.example");
      expect(await cron(url, "Bearer ")).toBe(503);
      expect(joined).toBe(false);
    });
    it("refuses a missing or wrong secret, and a cookie session does not help", async () => {
      vi.stubEnv("CRON_SECRET", SECRET);
      user = signedIn("owner@acme.example");
      expect(await cron(url)).toBe(401);
      expect(await cron(url, `Bearer ${SECRET}x`)).toBe(401);
      expect(await cron(url, SECRET)).toBe(401);
      expect(joined).toBe(false);
    });
    it("with the right secret, still needs the bot user before it touches data", async () => {
      vi.stubEnv("CRON_SECRET", SECRET);
      vi.stubEnv("CRON_BOT_EMAIL", "");
      vi.stubEnv("CRON_BOT_PASSWORD", "");
      expect(await cron(url, `Bearer ${SECRET}`)).toBe(503);
      expect(joined).toBe(false);
    });
  });
});
