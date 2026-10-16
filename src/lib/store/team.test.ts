import { describe, expect, it } from "vitest";
import { MemoryStore } from "./demoStore";

describe("demo store team", () => {
  it("starts with the owner and one member", async () => {
    const store = new MemoryStore();
    const members = await store.members();
    expect(members.map((m) => m.role)).toEqual(["owner", "member"]);
  });
  it("invites by email once, lower-cased, and refuses what is not an email", async () => {
    const store = new MemoryStore();
    expect(await store.inviteMember("  New@Harborline.example ")).toEqual({ ok: true });
    expect(await store.inviteMember("new@harborline.example")).toEqual({ ok: false, reason: "already" });
    expect(await store.inviteMember("no-at-sign")).toEqual({ ok: false, reason: "invalid" });
    const added = (await store.members()).find((m) => m.email === "new@harborline.example");
    expect(added).toMatchObject({ role: "member", joined_at: null });
  });
  it("removes a member or an invitation, never the owner", async () => {
    const store = new MemoryStore();
    await store.inviteMember("x@harborline.example");
    expect(await store.removeMember("x@harborline.example")).toEqual({ ok: true });
    expect(await store.removeMember("x@harborline.example")).toEqual({ ok: false, reason: "not_found" });
    expect(await store.removeMember("ines@harborline.example")).toEqual({ ok: false, reason: "self" });
  });
  it("renames the workspace and refuses an empty name", async () => {
    const store = new MemoryStore();
    expect(await store.renameWorkspace("  Fixathon ")).toEqual({ ok: true });
    expect(store.workspaceName).toBe("Fixathon");
    expect(await store.renameWorkspace("   ")).toEqual({ ok: false, reason: "invalid" });
  });
});
