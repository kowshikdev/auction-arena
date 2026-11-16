"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { DEFAULT_SETTINGS, SettingsForm, type EditableSettings } from "@/components/lobby/SettingsForm";
import { useToast } from "@/components/shared/toast";
import { Button, Field, Input, Modal, Select } from "@/components/shared/ui";

export function CreateRoomModal({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults?: Partial<EditableSettings> }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [auctioneer, setAuctioneer] = useState<"system" | "human">("system");
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [password, setPassword] = useState("");
  const [settings, setSettings] = useState<EditableSettings>({ ...DEFAULT_SETTINGS, ...defaults });
  const [showRules, setShowRules] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (settings.squad_min > settings.squad_max) {
      toast("Minimum squad size cannot exceed the maximum.", "error");
      return;
    }
    setBusy(true);
    const result = await api<{ code: string }>("/api/rooms", {
      name: name.trim() || "Auction night",
      description: description.trim() || undefined,
      visibility,
      auctioneer_type: auctioneer,
      max_participants: maxParticipants,
      password: password || undefined,
      settings,
    });
    setBusy(false);
    if (!result.ok) {
      toast(result.error.message, "error");
      return;
    }
    router.push(`/lobby/${result.code}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a room" wide>
      <form onSubmit={create} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Room name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Auction night" autoFocus />
          </Field>
          <Field label="Visibility">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "public")}>
              <option value="private">Private: invite only</option>
              <option value="public">Public: listed for anyone</option>
            </Select>
          </Field>
          <Field label="Auctioneer">
            <Select value={auctioneer} onChange={(e) => setAuctioneer(e.target.value as "system" | "human")}>
              <option value="system">System: automatic with voice</option>
              <option value="human">Human: one of you runs it</option>
            </Select>
          </Field>
          <Field label="Franchise owners (max)">
            <Select value={maxParticipants} onChange={(e) => setMaxParticipants(Number(e.target.value))}>
              {[4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </Field>
          <Field label="Password (optional)" hint="Invite links skip the password.">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64} autoComplete="off" />
          </Field>
          <Field label="Description (optional)">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} />
          </Field>
        </div>

        <div className="rounded-xl border border-line">
          <button type="button" onClick={() => setShowRules((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
            <span>
              <span className="block text-sm font-bold">Auction rules</span>
              <span className="text-xs text-dim">
                ₹{settings.purse_lakh / 100} Cr purse · {settings.bid_timer_sec}s timer · squad {settings.squad_min}–{settings.squad_max} · {settings.overseas_max} overseas
              </span>
            </span>
            <span className="text-mute">{showRules ? "Hide" : "Edit"}</span>
          </button>
          {showRules && (
            <div className="border-t border-line p-4">
              <SettingsForm value={settings} onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gold" busy={busy}>Create room</Button>
        </div>
      </form>
    </Modal>
  );
}
