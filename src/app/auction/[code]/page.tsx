"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useAnnouncer } from "@/hooks/useAnnouncer";
import { useCountdown } from "@/hooks/useCountdown";
import { usePlayers } from "@/hooks/usePlayers";
import { useRoom } from "@/hooks/useRoom";
import { useVoice } from "@/hooks/useVoice";
import { Controls } from "@/components/auction/Controls";
import { Scoreboard } from "@/components/auction/Scoreboard";
import { SidePanel } from "@/components/auction/SidePanel";
import { Stage } from "@/components/auction/Stage";
import { Wordmark } from "@/components/layout/SiteHeader";
import { SeasonTag } from "@/components/shared/SeasonTag";
import { AuthGate } from "@/components/shared/AuthGate";
import { useToast } from "@/components/shared/toast";
import { Badge, Button, LiveDot, Modal, Panel, Spinner, cn } from "@/components/shared/ui";
import { SquadView } from "@/components/teams/SquadView";
import { VoiceDock } from "@/components/voice/VoiceDock";
import type { FranchiseId } from "@/types";

function AuctionRoom() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode.toUpperCase();
  const router = useRouter();
  const toast = useToast();

  const room = useRoom(code);
  const { byId: players } = usePlayers();
  const voice = useVoice(code);
  const snapshot = room.snapshot;
  const session = snapshot?.session ?? null;

  const bidRemaining = useCountdown(session?.status === "live" && session.phase === "bidding" ? session.bid_deadline : null, room.serverNow);
  const nextIn = useCountdown(session?.status === "live" ? session.next_at : null, room.serverNow);
  const announcer = useAnnouncer(room, players, bidRemaining);

  const [bidBusy, setBidBusy] = useState(false);
  const [teamOpen, setTeamOpen] = useState<FranchiseId | null>(null);
  const [audioOpen, setAudioOpen] = useState(false);

  // Route by room state.
  const status = snapshot?.room.status;
  useEffect(() => {
    if (room.error?.code === "NOT_MEMBER") router.replace(`/join/${code}`);
    if (status === "lobby") router.replace(`/lobby/${code}`);
    if (status === "completed") {
      const timer = setTimeout(() => router.replace(`/results/${code}`), 5000);
      return () => clearTimeout(timer);
    }
  }, [room.error, status, code, router]);

  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  const busyRef = useRef(false);

  const bid = useCallback(async () => {
    const current = snapshotRef.current;
    const live = current?.session;
    if (!current || !live?.current_lot_id || live.next_bid_lakh === null || busyRef.current) return;
    busyRef.current = true;
    setBidBusy(true);
    // The amount sent is the one on screen. If someone got in first the server answers
    // STALE_BID and the button already shows the new amount by the time the toast appears.
    const result = await api("/api/bids", {
      room_id: current.room.id,
      lot_id: live.current_lot_id,
      amount_lakh: live.next_bid_lakh,
      idempotency_key: crypto.randomUUID(),
    });
    busyRef.current = false;
    setBidBusy(false);
    if (!result.ok) toast(result.error.message, "error");
  }, [toast]);

  const pass = useCallback(async () => {
    const current = snapshotRef.current;
    if (!current?.session?.current_lot_id) return;
    const result = await api("/api/bids/pass", { room_id: current.room.id, lot_id: current.session.current_lot_id });
    if (!result.ok) toast(result.error.message, "error");
  }, [toast]);

  // Keyboard: B places the next bid.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const current = snapshotRef.current;
      const live = current?.session;
      if (!current?.me.franchise_id || live?.status !== "live" || live.phase !== "bidding") return;
      if (live.current_bidder === current.me.franchise_id) return;
      void bid();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bid]);

  if (room.loading || !snapshot) {
    return (
      <div className="stadium grid min-h-dvh place-items-center">
        {room.error && room.error.code !== "NOT_MEMBER" ? (
          <Panel className="max-w-sm p-6 text-center">
            <p className="display text-2xl">Auction unavailable</p>
            <p className="mt-2 text-sm text-mute">{room.error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => router.push("/dashboard")}>Back to dashboard</Button>
          </Panel>
        ) : (
          <Spinner className="size-8 text-gold" />
        )}
      </div>
    );
  }

  const { room: info, teams, squads, settings, members } = snapshot;
  const openTeam = teams.find((t) => t.franchise_id === teamOpen);
  const progress = session && session.lots_total > 0 ? Math.min(100, Math.round((session.lots_done / session.lots_total) * 100)) : 0;
  const completed = info.status === "completed";

  return (
    <div className="stadium min-h-dvh">
      {/* Broadcast bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-4">
            <Wordmark className="hidden md:flex" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {completed ? (
                  <Badge tone="gold">Finished</Badge>
                ) : session?.status === "paused" ? (
                  <Badge tone="warn">Paused</Badge>
                ) : (
                  <Badge tone="live"><LiveDot /> Live</Badge>
                )}
                <SeasonTag size="sm" />
                <span className="font-mono text-xs tracking-widest text-dim">{info.code}</span>
              </div>
              <h1 className="display truncate text-xl sm:text-2xl">{info.name}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {session && (
              <div className="hidden items-center gap-2 sm:flex" title="Auction progress">
                <span className="tabular text-xs font-semibold text-mute">
                  {session.lots_done}/{session.lots_total} players
                </span>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            <Badge tone={room.connected ? "go" : "warn"}>{room.connected ? "Synced" : "Reconnecting"}</Badge>
            <VoiceDock voice={voice} compact />
            <Button size="sm" variant="ghost" onClick={() => setAudioOpen(true)} aria-label="Sound settings">
              Sound
            </Button>
            <Link href="/dashboard">
              <Button size="sm" variant="outline">Exit</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[100rem] gap-4 px-4 py-4 lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)_21rem]">
        {/* Stage first on small screens */}
        <section className="order-1 space-y-4 lg:order-2">
          {completed ? (
            <Panel className="grid min-h-[26rem] place-items-center p-8 text-center">
              <div>
                <p className="display gold-text animate-pop text-7xl">Auction complete</p>
                <p className="mt-3 text-mute">Final squads and spending are ready. Taking you to the results.</p>
                <Link href={`/results/${code}`} className="mt-6 inline-block">
                  <Button variant="gold" size="lg">View results</Button>
                </Link>
              </div>
            </Panel>
          ) : (
            <Stage snapshot={snapshot} players={players} remainingMs={bidRemaining} nextInMs={nextIn} onBid={bid} onPass={pass} busy={bidBusy} />
          )}
          {!completed && <Controls snapshot={snapshot} />}
          {session?.phase === "result" && nextIn !== null && !completed && (
            <p className="text-center text-sm text-mute">Next player in {Math.ceil(nextIn / 1000)} seconds</p>
          )}
        </section>

        <aside className="order-2 lg:order-1">
          <p className="eyebrow mb-2 px-1">Franchises</p>
          <Scoreboard snapshot={snapshot} online={room.online} speaking={voice.speaking} onSelect={setTeamOpen} />
        </aside>

        <aside className="order-3 lg:col-span-2 xl:col-span-1 xl:h-[calc(100dvh-6rem)] xl:sticky xl:top-20">
          <SidePanel snapshot={snapshot} players={players} />
        </aside>
      </main>

      <Modal open={Boolean(openTeam)} onClose={() => setTeamOpen(null)} title="Franchise squad" wide>
        {openTeam && (
          <SquadView
            team={openTeam}
            squad={squads.filter((entry) => entry.franchise_id === openTeam.franchise_id)}
            players={players}
            settings={settings}
            ownerName={members.find((m) => m.user_id === openTeam.user_id)?.display_name}
          />
        )}
      </Modal>

      <Modal open={audioOpen} onClose={() => setAudioOpen(false)} title="Sound">
        <div className="space-y-4">
          {([
            ["voice", "Auctioneer voice", "Spoken announcements for players, bids and results"],
            ["sfx", "Sound effects", "Bid, countdown, sold and unsold sounds"],
          ] as const).map(([key, label, note]) => (
            <button
              key={key}
              role="switch"
              aria-checked={announcer.prefs[key]}
              onClick={() => announcer.update({ [key]: !announcer.prefs[key] })}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-black/25 p-3 text-left"
            >
              <span>
                <span className="block text-sm font-bold">{label}</span>
                <span className="text-xs text-dim">{note}</span>
              </span>
              <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", announcer.prefs[key] ? "bg-gold" : "bg-white/15")}>
                <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", announcer.prefs[key] ? "left-[22px]" : "left-0.5")} />
              </span>
            </button>
          ))}
          <label className="block text-sm">
            <span className="mb-2 block font-bold">Announcer and effects volume</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={announcer.prefs.volume}
              onChange={(e) => announcer.update({ volume: Number(e.target.value) })}
              className="w-full accent-[#f6c453]"
            />
          </label>
          <p className="text-xs text-dim">Voice chat volume is separate: open Options next to the microphone button.</p>
        </div>
      </Modal>
    </div>
  );
}

export default function AuctionPage() {
  return (
    <AuthGate reason="Sign in to return to your seat in this auction.">
      <AuctionRoom />
    </AuthGate>
  );
}
