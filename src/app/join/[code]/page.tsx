"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { Wordmark } from "@/components/layout/SiteHeader";
import { AuthGate } from "@/components/shared/AuthGate";
import { Badge, Button, Field, Input, Panel, Spinner } from "@/components/shared/ui";
import type { ApiError, RoomStatus } from "@/types";

type Preview = {
  code: string;
  name: string;
  description: string | null;
  has_password: boolean;
  status: RoomStatus;
  auctioneer_type: string;
  max_participants: number;
  member_count: number;
  host_name: string;
  is_member: boolean;
};

function destination(code: string, status: RoomStatus) {
  if (status === "completed") return `/results/${code}`;
  if (status === "lobby") return `/lobby/${code}`;
  return `/auction/${code}`;
}

function Join() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode.toUpperCase();
  const token = useSearchParams().get("t") ?? undefined;
  const router = useRouter();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const join = useCallback(
    async (withPassword?: string) => {
      setBusy(true);
      setError(null);
      const result = await api<{ code: string; status: RoomStatus }>("/api/rooms/join", {
        code,
        password: withPassword || undefined,
        invite_token: token,
      });
      setBusy(false);
      if (result.ok) router.replace(destination(result.code, result.status));
      else setError(result.error);
    },
    [code, token, router],
  );

  useEffect(() => {
    let active = true;
    api<Preview>(`/api/rooms/preview?code=${encodeURIComponent(code)}`).then((result) => {
      if (!active) return;
      if (!result.ok) return setError(result.error);
      setPreview(result);
      // Existing members and invite-link holders go straight in.
      if (result.is_member) router.replace(destination(result.code, result.status));
      else if (token && result.status === "lobby") void join();
    });
    return () => {
      active = false;
    };
  }, [code, token, router, join]);

  const full = preview ? preview.member_count >= preview.max_participants : false;
  const started = preview ? preview.status !== "lobby" : false;
  const needsPassword = Boolean(preview?.has_password && !token);

  return (
    <div className="stadium grid min-h-dvh place-items-center px-4 py-10">
      <Panel className="w-full max-w-md animate-rise p-7">
        <Wordmark className="mb-6" />
        {!preview && !error && (
          <div className="grid place-items-center py-10"><Spinner className="size-7 text-gold" /></div>
        )}

        {!preview && error && (
          <>
            <h1 className="display text-3xl">Room not found</h1>
            <p className="mt-2 text-sm text-mute">{error.message}</p>
            <Link href="/dashboard" className="mt-6 block">
              <Button variant="outline" className="w-full">Back to dashboard</Button>
            </Link>
          </>
        )}

        {preview && (
          <>
            <p className="eyebrow">You are invited to</p>
            <h1 className="display mt-1 text-4xl">{preview.name}</h1>
            <p className="mt-1 text-sm text-mute">Hosted by {preview.host_name}</p>
            {preview.description && <p className="mt-3 text-sm text-mute">{preview.description}</p>}
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge>Code {preview.code}</Badge>
              <Badge>{preview.member_count}/{preview.max_participants} owners</Badge>
              <Badge>{preview.auctioneer_type} auctioneer</Badge>
            </div>

            {started ? (
              <p className="mt-6 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
                This auction has already started. Late entry is not allowed.
              </p>
            ) : full ? (
              <p className="mt-6 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">This room is full.</p>
            ) : (
              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void join(password);
                }}
              >
                {needsPassword && (
                  <Field label="Room password">
                    <Input value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="off" />
                  </Field>
                )}
                {error && <p className="text-sm text-[#ff8f9b]">{error.message}</p>}
                <Button type="submit" variant="gold" size="lg" busy={busy} className="w-full">
                  Join the lobby
                </Button>
              </form>
            )}
            <Link href="/dashboard" className="mt-3 block text-center text-sm text-mute hover:text-chalk">
              Back to dashboard
            </Link>
          </>
        )}
      </Panel>
    </div>
  );
}

export default function JoinPage() {
  return (
    <AuthGate reason="Pick a name to join this auction room.">
      <Suspense>
        <Join />
      </Suspense>
    </AuthGate>
  );
}
