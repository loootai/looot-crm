/** Who may use this workspace. Pure and edge-safe, so the proxy and the server share it. */
export type AccessState = "ok" | "setup" | "denied";

type Env = Record<string, string | undefined>;

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** The allow-list from LOOOT_CRM_ALLOWED_EMAILS and LOOOT_CRM_ALLOWED_DOMAINS, lower-cased. */
export function readAllowList(env: Env = process.env) {
  return { emails: list(env.LOOOT_CRM_ALLOWED_EMAILS), domains: list(env.LOOOT_CRM_ALLOWED_DOMAINS).map((d) => d.replace(/^@/, "")) };
}

/** True when the operator has set at least one allowed email or domain. */
export const hasAllowList = (env: Env = process.env) => {
  const a = readAllowList(env);
  return a.emails.length + a.domains.length > 0;
};

/**
 * Whether a signed-in Supabase user may use the workspace. "setup" means the operator set no list, so
 * nobody is let in. The email must be confirmed, and it must match a listed email exactly or the
 * exact domain after the last "@" (case-insensitive, no suffix matching).
 */
export function accessFor(user: { email?: string | null; email_confirmed_at?: string | null }, env: Env = process.env): AccessState {
  const allow = readAllowList(env);
  if (!allow.emails.length && !allow.domains.length) return "setup";
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return "denied";
  if (allow.emails.includes(email)) return "ok";
  const at = email.lastIndexOf("@");
  return at > 0 && allow.domains.includes(email.slice(at + 1)) ? "ok" : "denied";
}

/** Whether an email, confirmed or not yet, matches the allow-list. Used to warn before inviting someone who could not sign in. */
export function emailAllowed(email: string, env: Env = process.env): boolean {
  return accessFor({ email, email_confirmed_at: "listed" }, env) === "ok";
}

/** A post-sign-in destination that is a same-origin relative path, or "/" for anything else. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return "/";
  return value;
}
