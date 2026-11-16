"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AuthGate } from "@/components/shared/AuthGate";
import { Avatar } from "@/components/shared/identity";
import { useToast } from "@/components/shared/toast";
import { Badge, Button, Field, Input, Panel } from "@/components/shared/ui";

function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState("");
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? "");
    setAvatar(profile?.avatar_url ?? "");
  }, [profile]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await api("/api/profile", { display_name: name, avatar_url: avatar || undefined });
    setSaving(false);
    if (!result.ok) return toast(result.error.message, "error");
    await refreshProfile();
    toast("Profile saved", "success");
  }

  async function sendReport(event: React.FormEvent) {
    event.preventDefault();
    setReporting(true);
    const result = await api("/api/reports", { message: report });
    setReporting(false);
    if (!result.ok) return toast(result.error.message, "error");
    setReport("");
    toast("Thanks. The report was sent to the admins.", "success");
  }

  return (
    <div className="stadium min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="display mt-1 text-5xl">Your profile</h1>
        </div>

        <Panel className="p-6">
          <div className="flex items-center gap-4">
            <Avatar name={name || "You"} src={avatar || null} size={72} />
            <div className="min-w-0">
              <p className="display truncate text-3xl">{profile?.display_name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {profile?.is_guest ? <Badge tone="warn">Guest</Badge> : <Badge tone="go">Account</Badge>}
                {profile?.is_admin && <Badge tone="gold">Admin</Badge>}
                {user?.email && <span className="truncate text-sm text-mute">{user.email}</span>}
              </div>
            </div>
          </div>

          {profile?.is_guest && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 p-4">
              <p className="text-sm">Guest sessions live in this browser only. Add an email to keep your seat and history everywhere.</p>
              <Link href="/register?next=/profile"><Button variant="gold" size="sm">Create account</Button></Link>
            </div>
          )}

          <form onSubmit={save} className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Display name" hint="Shown to other owners in lobbies and auctions.">
              <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={32} required />
            </Field>
            <Field label="Profile picture URL (optional)">
              <Input type="url" value={avatar} onChange={(e) => setAvatar(e.target.value)} maxLength={400} placeholder="https://" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="gold" busy={saving}>Save profile</Button>
            </div>
          </form>
        </Panel>

        <Panel className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <h2 className="display text-2xl">Auction history</h2>
            <p className="text-sm text-mute">Every auction you took part in, with final squads and spending.</p>
          </div>
          <Link href="/dashboard"><Button variant="outline">Open dashboard</Button></Link>
        </Panel>

        <Panel className="p-6">
          <h2 className="display text-2xl">Report a problem</h2>
          <p className="text-sm text-mute">Something broke, or someone spoiled a room? Tell the admins.</p>
          <form onSubmit={sendReport} className="mt-4 space-y-3">
            <textarea
              value={report}
              onChange={(e) => setReport(e.target.value)}
              minLength={3}
              maxLength={1000}
              required
              rows={3}
              aria-label="Report details"
              placeholder="What happened? Include the room code if you have it."
              className="w-full rounded-xl border border-line bg-black/30 p-3 text-sm outline-none focus:border-gold/70"
            />
            <Button type="submit" variant="outline" busy={reporting}>Send report</Button>
          </form>
        </Panel>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGate>
      <Profile />
    </AuthGate>
  );
}
