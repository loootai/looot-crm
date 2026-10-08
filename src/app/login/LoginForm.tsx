"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { browserSupabase } from "@/lib/supabase/browser";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(linkError ? "That sign-in link has expired or was already used. Ask for a new one." : null);
  const [pending, setPending] = React.useState<"email" | "google" | null>(null);
  const redirect = () => `${window.location.origin}/auth/callback`;
  const magic = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending("email");
    setError(null);
    const { error: err } = await browserSupabase().auth.signInWithOtp({ email, options: { emailRedirectTo: redirect() } });
    setPending(null);
    if (err) setError(err.message);
    else setSent(true);
  };
  const google = async () => {
    setPending("google");
    setError(null);
    const { error: err } = await browserSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect() } });
    if (err) {
      setError(err.message);
      setPending(null);
    }
  };
  if (sent) {
    return (
      <div role="status" className="rounded-md border border-border bg-surface p-4">
        <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-4 text-accent" aria-hidden /> Check your inbox</p>
        <p className="mt-1 text-13 text-muted-foreground">We sent a sign-in link to {email}. It works once and expires in an hour.</p>
        <button onClick={() => setSent(false)} className="mt-3 rounded-sm text-13 font-medium text-primary hover:underline">Use another address</button>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <form onSubmit={magic} className="grid gap-3">
        <Field label="Work email" htmlFor="login-email" error={error}>
          <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus placeholder="you@example.com" className="h-10" aria-invalid={!!error} />
        </Field>
        <Button type="submit" variant="primary" disabled={pending !== null} className="h-10">{pending === "email" ? "Sending the link" : "Email me a sign-in link"}</Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <Button onClick={google} disabled={pending !== null} className="h-10">
        <svg viewBox="0 0 18 18" className="size-4" aria-hidden><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" /><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" /><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" /><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" /></svg>
        {pending === "google" ? "Opening Google" : "Continue with Google"}
      </Button>
    </div>
  );
}
