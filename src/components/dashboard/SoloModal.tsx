"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { FRANCHISES } from "@/lib/franchises";
import { useToast } from "@/components/shared/toast";
import { Button, Field, Modal, Select } from "@/components/shared/ui";

const DIFFICULTY = [
  { id: "easy", label: "Easy", note: "AI bids loosely and makes mistakes" },
  { id: "normal", label: "Normal", note: "Sensible, with some variety" },
  { id: "hard", label: "Hard", note: "Disciplined and hard to out-bid" },
] as const;

/** Play against AI franchise owners: no waiting for anyone to join. */
export function SoloModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [franchise, setFranchise] = useState<string>("");
  const [aiCount, setAiCount] = useState(9);
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTY)[number]["id"]>("normal");
  const [length, setLength] = useState<"quick" | "full">("quick");
  const [busy, setBusy] = useState(false);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await api<{ code: string }>("/api/ai/solo", {
      franchise_id: franchise || null,
      ai_count: aiCount,
      difficulty,
      timer_sec: 15,
      pool_limit: length === "quick" ? 60 : null,
    });
    setBusy(false);
    if (!result.ok) {
      toast(result.error.message, "error");
      return;
    }
    router.push(`/auction/${result.code}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Play against AI">
      <form onSubmit={start} className="space-y-4">
        <p className="text-sm text-mute">The auction starts straight away. AI owners scout players, watch their purse and squad needs, and bid like real franchises.</p>
        <Field label="Your franchise">
          <Select value={franchise} onChange={(e) => setFranchise(e.target.value)}>
            <option value="">Random</option>
            {FRANCHISES.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <Field label={`AI rivals: ${aiCount}`}>
          <input type="range" min={3} max={9} value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))} className="w-full accent-[var(--color-gold)]" />
        </Field>
        <Field label="Difficulty" hint={DIFFICULTY.find((d) => d.id === difficulty)?.note}>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTY.map((d) => (
              <Button key={d.id} type="button" size="sm" variant={difficulty === d.id ? "gold" : "outline"} onClick={() => setDifficulty(d.id)}>{d.label}</Button>
            ))}
          </div>
        </Field>
        <Field label="Length">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant={length === "quick" ? "gold" : "outline"} onClick={() => setLength("quick")}>Quick · 60 players</Button>
            <Button type="button" size="sm" variant={length === "full" ? "gold" : "outline"} onClick={() => setLength("full")}>Full pool</Button>
          </div>
        </Field>
        <Button type="submit" variant="gold" size="lg" className="w-full" busy={busy}>Start auction</Button>
      </form>
    </Modal>
  );
}
