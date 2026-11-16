"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Wordmark } from "@/components/layout/SiteHeader";
import { Button, Field, Input, Panel } from "./ui";

/** Only same-site paths are accepted as a post-login destination. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, profile } = useAuth();
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isGuest = Boolean(user?.is_anonymous);
  const register = mode === "register";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (!register) {
        const { error: failure } = await supabase.auth.signInWithPassword({ email, password });
        if (failure) return setError(failure.message);
        router.push(next);
        return;
      }
      if (name.trim().length < 2) return setError("Enter a display name of at least 2 characters.");
      if (password.length < 8) return setError("Use a password of at least 8 characters.");

      if (isGuest) {
        // Upgrade the guest in place so their rooms and history carry over.
        const { error: failure } = await supabase.auth.updateUser({ email, password, data: { display_name: name.trim() } });
        if (failure) return setError(failure.message);
        await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ display_name: name.trim() }),
        });
        router.push(next);
        return;
      }
      const { data, error: failure } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (failure) return setError(failure.message);
      if (data.session) router.push(next);
      else setNotice("Check your inbox to confirm your email, then log in.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: failure } = isGuest
      ? await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } })
      : await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (failure) setError(failure.message);
  }

  return (
    <div className="stadium grid min-h-dvh place-items-center px-4 py-10">
      <Panel className="w-full max-w-md animate-rise p-7">
        <Wordmark className="mb-6" />
        <h1 className="display text-3xl">{register ? (isGuest ? "Keep your seat" : "Create your account") : "Welcome back"}</h1>
        <p className="mt-2 text-sm text-mute">
          {register
            ? isGuest
              ? `You are playing as guest ${profile?.display_name ?? ""}. Add an email to keep your auctions.`
              : "An account keeps your auction history and lets you rejoin from any device."
            : "Log in to get back to your rooms and results."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {register && (
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="Shown to other owners" required />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
          </Field>
          {error && <p className="text-sm text-[#ff8f9b]">{error}</p>}
          {notice && <p className="text-sm text-go">{notice}</p>}
          <Button type="submit" variant="gold" size="lg" busy={busy} className="w-full">
            {register ? "Create account" : "Log in"}
          </Button>
        </form>

        <Button variant="outline" className="mt-3 w-full" onClick={google}>
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-sm text-mute">
          {register ? "Already have an account? " : "New here? "}
          <Link href={`${register ? "/login" : "/register"}?next=${encodeURIComponent(next)}`} className="font-semibold text-gold hover:underline">
            {register ? "Log in" : "Create one"}
          </Link>
        </p>
      </Panel>
    </div>
  );
}
