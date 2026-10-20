import fs from "node:fs";
import path from "node:path";

export interface RouteEntry {
  /** URL path such as /api/actions/[key]. */
  url: string;
  file: string;
  methods: string[];
}

const ROOT = path.resolve(import.meta.dirname, "..", "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Every route handler under src/app, read from the file tree so a new route is picked up with no edit here. */
export function routeMap(): RouteEntry[] {
  return walk(ROOT)
    .filter((f) => /[\\/]route\.ts$/.test(f))
    .map((file) => {
      const src = fs.readFileSync(file, "utf8");
      const methods = [...src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      const url = "/" + path.relative(ROOT, path.dirname(file)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/");
      return { url, file, methods };
    })
    .sort((a, b) => a.url.localeCompare(b.url));
}

/** Routes a third party must reach without a session. Anything not listed here is private. */
export const PUBLIC_ROUTES = ["/auth/callback", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"];

/** Routes that take a bearer token instead of the cookie session. They have their own tests in auth.routes.test.ts. */
export const BEARER_ROUTES = ["/mcp"];

/** Names of the exported server actions in src/app/actions.ts. */
export function actionNames(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "actions.ts"), "utf8");
  return [...src.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
}
