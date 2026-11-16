"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Wordmark } from "@/components/layout/SiteHeader";
import { Button, Field, Input, Panel, Spinner } from "./ui";

/**
 * Renders children only for a signed-in user. Visitors get a one-field guest entry
 * (so an invite link works in seconds) plus links to log in or register.
 */
export function AuthGate({ children, reason }: { children: ReactNode; reason?: string }) {
  const { user, loading, continueAsGuest } = useAuth();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="stadium grid min-h-dvh place-items-center">
        <Spinner className="size-8 text-gold" />
      </div>
    );
  }
  if (user) return <>{children}</>;

  const next = encodeURIComponent(pathname);
  return (
    <div className="stadium grid min-h-dvh place-items-center px-4 py-10">
      <Panel className="w-full max-w-md animate-rise p-7">
        <Wordmark className="mb-6" />
        <h1 className="display text-3xl">Take your seat</h1>
        <p className="mt-2 text-sm text-mute">{reason ?? "Pick a name to jump straight in, or sign in to keep your auction history."}</p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (name.trim().length < 2) {
              setError("Enter a name of at least 2 characters.");
              return;
            }
            setBusy(true);
            const message = await continueAsGuest(name);
            setBusy(false);
            if (message) setError(message);
          }}
        >
          <Field label="Display name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="e.g. Kowshik" autoFocus />
          </Field>
          {error && <p className="text-sm text-[#ff8f9b]">{error}</p>}
          <Button type="submit" variant="gold" size="lg" busy={busy} className="w-full">
            Continue as guest
          </Button>
        </form>

        <div className="mt-6 flex items-center gap-3 text-xs text-dim">
          <span className="h-px flex-1 bg-line" />
          OR
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href={`/login?next=${next}`}>
            <Button variant="outline" className="w-full">Log in</Button>
          </Link>
          <Link href={`/register?next=${next}`}>
            <Button variant="outline" className="w-full">Create account</Button>
          </Link>
        </div>
      </Panel>
    </div>
  );
}
