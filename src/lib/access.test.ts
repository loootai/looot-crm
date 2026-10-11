import { describe, expect, it } from "vitest";
import { accessFor, safeNext } from "./access";

const u = (email: string, confirmed = true) => ({ email, email_confirmed_at: confirmed ? "2026-10-01T00:00:00Z" : null });

describe("accessFor", () => {
  it("asks for setup when no list is set", () => {
    expect(accessFor(u("a@x.example"), {})).toBe("setup");
    expect(accessFor(u("a@x.example"), { LOOOT_CRM_ALLOWED_EMAILS: " , ", LOOOT_CRM_ALLOWED_DOMAINS: "" })).toBe("setup");
  });
  it("matches emails exactly, ignoring case", () => {
    const env = { LOOOT_CRM_ALLOWED_EMAILS: "Owner@Acme.example, two@acme.example" };
    expect(accessFor(u("owner@acme.example"), env)).toBe("ok");
    expect(accessFor(u("TWO@acme.example"), env)).toBe("ok");
    expect(accessFor(u("owner@acme.example.evil.example"), env)).toBe("denied");
    expect(accessFor(u("xowner@acme.example"), env)).toBe("denied");
  });
  it("matches a domain exactly, not as a suffix", () => {
    const env = { LOOOT_CRM_ALLOWED_DOMAINS: "acme.example, @beta.example" };
    expect(accessFor(u("a@acme.example"), env)).toBe("ok");
    expect(accessFor(u("a@beta.example"), env)).toBe("ok");
    expect(accessFor(u("a@evilacme.example"), env)).toBe("denied");
    expect(accessFor(u("a@sub.acme.example"), env)).toBe("denied");
  });
  it("refuses an unconfirmed email even when listed", () => {
    expect(accessFor(u("owner@acme.example", false), { LOOOT_CRM_ALLOWED_EMAILS: "owner@acme.example" })).toBe("denied");
  });
  it("refuses a user with no email", () => {
    expect(accessFor({ email: undefined, email_confirmed_at: "x" }, { LOOOT_CRM_ALLOWED_EMAILS: "a@b.example" })).toBe("denied");
  });
});

describe("safeNext", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNext("/companies?x=1")).toBe("/companies?x=1");
  });
  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "evil.example", "/\n//evil.example", "", null, undefined])("rejects %s", (v) => {
    expect(safeNext(v as string | null)).toBe("/");
  });
});
