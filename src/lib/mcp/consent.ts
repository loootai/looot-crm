/** Which OAuth clients the consent page may approve. Pure, so it is tested without a server. */

type Env = Record<string, string | undefined>;

export const DEFAULT_REDIRECT_HOSTS = ["claude.ai", "claude.com", "localhost", "127.0.0.1"];
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Hosts from MCP_ALLOWED_REDIRECT_HOSTS (comma separated, lower-cased), or the defaults when it is unset or empty. */
export function allowedRedirectHosts(env: Env = process.env): string[] {
  const list = (env.MCP_ALLOWED_REDIRECT_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : DEFAULT_REDIRECT_HOSTS;
}

/** The host of a redirect URI, lower-cased, or null when it is not a URL. */
export function redirectHost(uri: string): string | null {
  try {
    return new URL(uri).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Whether the consent page may approve a client that redirects to `uri`. The host must be on the list
 * exactly (no suffix matching), and the scheme must be https, except plain http on a local host.
 */
export function redirectAllowed(uri: string, env: Env = process.env): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (!allowedRedirectHosts(env).includes(host)) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOCAL.has(host));
}
