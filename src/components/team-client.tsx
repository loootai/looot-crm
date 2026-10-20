"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inviteMember, removeMember, renameWorkspace } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import type { WorkspaceRole } from "@/lib/types";

export interface TeamRow {
  email: string;
  role: WorkspaceRole;
  joined: boolean;
  you: boolean;
  /** False when the email is not on LOOOT_CRM_ALLOWED_EMAILS or LOOOT_CRM_ALLOWED_DOMAINS, so it could not sign in. */
  allowed: boolean;
}

export function TeamSection({ name, role, members, demo }: { name: string; role: WorkspaceRole; members: TeamRow[]; demo: boolean }) {
  const router = useRouter();
  const owner = role === "owner";
  const [wsName, setWsName] = React.useState(name);
  const [email, setEmail] = React.useState("");
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast(done);
      after?.();
      router.refresh();
    });
  const invite = () => {
    const e = email.trim();
    if (e) run(() => inviteMember(e), `Invited ${e.toLowerCase()}`, () => setEmail(""));
  };
  return (
    <section id="team" aria-labelledby="team-h" className="scroll-mt-16 border-b border-border py-6">
      <h2 id="team-h" className="text-base font-semibold">Team</h2>
      <p className="mt-1 max-w-xl text-13 text-muted-foreground">
        Everyone here works on the same companies, people, deals and budget. {owner ? "You are the owner: you invite and remove people and set the budget." : "The owner invites and removes people and sets the budget."}
      </p>

      {owner ? (
        <form className="mt-4 flex max-w-xl items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (wsName.trim() && wsName.trim() !== name) run(() => renameWorkspace(wsName), "Workspace renamed"); }}>
          <Field label="Workspace name" htmlFor="ws-name" className="flex-1">
            <Input id="ws-name" value={wsName} maxLength={80} onChange={(e) => setWsName(e.target.value)} />
          </Field>
          <Button type="submit" disabled={pending || !wsName.trim() || wsName.trim() === name}>Rename</Button>
        </form>
      ) : (
        <p className="mt-4 text-13">Workspace <span className="font-medium">{name}</span></p>
      )}

      <ul className="mt-4 max-w-xl divide-y divide-border border-y border-border" aria-label="Members">
        {members.map((m) => (
          <li key={m.email} className="flex min-h-11 items-center gap-3 py-2 text-13">
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {m.email}
                {m.you && <span className="text-muted-foreground"> (you)</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {m.role === "owner" ? "Owner" : m.joined ? "Member" : "Invited, has not signed in yet"}
                {!m.allowed && !demo && <span className="text-danger"> · Not on the allow-list, so this email cannot sign in</span>}
              </p>
            </div>
            {owner && !m.you && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeMember(m.email), m.joined ? `Removed ${m.email}` : `Invitation to ${m.email} cancelled`)}>
                {m.joined ? "Remove" : "Cancel invitation"}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {owner && (
        <form className="mt-4 flex max-w-xl items-end gap-2" onSubmit={(e) => { e.preventDefault(); invite(); }}>
          <Field label="Invite by email" htmlFor="invite-email" className="flex-1">
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" autoComplete="off" />
          </Field>
          <Button type="submit" variant="primary" disabled={pending || !email.trim()}>Invite</Button>
        </form>
      )}
      {owner && <p className="mt-1.5 max-w-xl text-xs text-muted-foreground">They join the next time they sign in with that email. The email must also be on the server allow-list.</p>}
    </section>
  );
}
