"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CreateRoomModal } from "@/components/dashboard/CreateRoomModal";
import { SoloModal } from "@/components/dashboard/SoloModal";
import { JoinBox } from "@/components/dashboard/JoinBox";
import { AuthGate } from "@/components/shared/AuthGate";
import { FranchiseLogo } from "@/components/shared/identity";
import { useToast } from "@/components/shared/toast";
import { Badge, Button, EmptyState, LiveDot, Panel, Select, Spinner } from "@/components/shared/ui";
import type { FranchiseId, PublicRoom, RoomStatus } from "@/types";

type MyAuction = {
  room_id: string;
  code: string;
  name: string;
  status: RoomStatus;
  created_at: string;
  franchise_id: FranchiseId | null;
  member_count: number;
  squad_count: number | null;
  spent_lakh: number | null;
};

function roomHref(code: string, status: RoomStatus) {
  if (status === "completed") return `/results/${code}`;
  if (status === "lobby") return `/lobby/${code}`;
  return `/auction/${code}`;
}

function StatusBadge({ status }: { status: RoomStatus }) {
  if (status === "live") return <Badge tone="live"><LiveDot /> Live</Badge>;
  if (status === "paused") return <Badge tone="warn">Paused</Badge>;
  if (status === "completed") return <Badge tone="gold">Finished</Badge>;
  return <Badge tone="go">Waiting</Badge>;
}

function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { profile } = useAuth();

  const [soloOpen, setSoloOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(params.get("create") === "1");
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [mine, setMine] = useState<MyAuction[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [seatFilter, setSeatFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("any");

  const refresh = useCallback(async () => {
    const [publicRooms, history] = await Promise.all([
      api<{ data: PublicRoom[] }>("/api/rooms"),
      api<{ data: MyAuction[] }>("/api/history"),
    ]);
    if (publicRooms.ok) setRooms(publicRooms.data);
    if (history.ok) setMine(history.data);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const findMatch = useCallback(async () => {
    setMatching(true);
    const result = await api<{ code: string }>("/api/matchmaking", {});
    setMatching(false);
    if (!result.ok) {
      toast(result.error.message, "error");
      return;
    }
    router.push(`/lobby/${result.code}`);
  }, [router, toast]);

  useEffect(() => {
    if (params.get("match") === "1") void findMatch();
    // Run once on arrival from the landing page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleRooms = useMemo(
    () =>
      (rooms ?? []).filter((room) => {
        if (seatFilter === "open" && (room.status !== "lobby" || room.member_count >= room.max_participants)) return false;
        if (typeFilter !== "any" && room.auctioneer_type !== typeFilter) return false;
        return true;
      }),
    [rooms, seatFilter, typeFilter],
  );

  const active = (mine ?? []).filter((a) => a.status !== "completed");
  const finished = (mine ?? []).filter((a) => a.status === "completed");

  return (
    <div className="stadium min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
        <div className="animate-rise">
          <p className="eyebrow">Dashboard</p>
          <h1 className="display mt-1 text-5xl">Welcome, {profile?.display_name ?? "owner"}</h1>
          {profile?.is_guest && (
            <p className="mt-2 text-sm text-mute">
              You are playing as a guest.{" "}
              <Link href="/register?next=/dashboard" className="font-semibold text-gold hover:underline">Create an account</Link>{" "}
              to keep your auction history on every device.
            </p>
          )}
        </div>

        {/* Primary actions */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Panel className="team-wash p-6">
            <div className="flex items-center gap-2"><h2 className="display text-3xl">Play vs AI</h2><Badge tone="gold">New</Badge></div>
            <p className="mt-1 text-sm text-mute">No waiting. AI franchise owners bid against you right now.</p>
            <Button variant="gold" size="lg" className="mt-5 w-full shine" onClick={() => setSoloOpen(true)}>Start vs AI</Button>
          </Panel>
          <Panel className="team-wash p-6">
            <h2 className="display text-3xl">Create auction</h2>
            <p className="mt-1 text-sm text-mute">Private or public room, your rules, your auctioneer.</p>
            <Button variant="gold" size="lg" className="mt-5 w-full" onClick={() => setCreateOpen(true)}>
              Create a room
            </Button>
          </Panel>
          <Panel className="p-6">
            <h2 className="display text-3xl">Join with code</h2>
            <p className="mt-1 text-sm text-mute">Got a six-character code from a friend?</p>
            <div className="mt-5"><JoinBox size="lg" /></div>
          </Panel>
          <Panel className="p-6">
            <h2 className="display text-3xl">Find a match</h2>
            <p className="mt-1 text-sm text-mute">Get seated in an open public lobby with a random franchise.</p>
            <Button variant="outline" size="lg" className="mt-5 w-full" busy={matching} onClick={findMatch}>
              {matching ? "Finding a table" : "Quick match"}
            </Button>
          </Panel>
        </div>

        {/* Rooms the user is already in */}
        {active.length > 0 && (
          <section>
            <h2 className="display mb-3 text-3xl">Your rooms</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((room) => (
                <Link key={room.room_id} href={roomHref(room.code, room.status)} className="panel flex items-center gap-4 p-4 transition hover:border-line-strong">
                  <FranchiseLogo id={room.franchise_id} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{room.name}</p>
                    <p className="font-mono text-xs tracking-widest text-dim">{room.code} · {room.member_count} in room</p>
                  </div>
                  <StatusBadge status={room.status} />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Public room browser */}
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 className="display text-3xl">Public rooms</h2>
            <div className="flex gap-2">
              <Select value={seatFilter} onChange={(e) => setSeatFilter(e.target.value)} className="h-9 w-40" aria-label="Seat filter">
                <option value="open">Open seats only</option>
                <option value="all">All rooms</option>
              </Select>
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 w-44" aria-label="Auctioneer filter">
                <option value="any">Any auctioneer</option>
                <option value="system">System auctioneer</option>
                <option value="human">Human auctioneer</option>
              </Select>
            </div>
          </div>
          {rooms === null ? (
            <div className="grid place-items-center py-12"><Spinner className="size-6 text-gold" /></div>
          ) : visibleRooms.length === 0 ? (
            <EmptyState title="No public rooms right now">Create one, or hit Quick match and a room opens for you.</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleRooms.map((room) => {
                const full = room.member_count >= room.max_participants;
                const joinable = room.status === "lobby" && !full;
                return (
                  <Panel key={room.room_id} className="flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold">{room.name}</p>
                        <p className="text-xs text-dim">Host {room.host_name}</p>
                      </div>
                      <StatusBadge status={room.status} />
                    </div>
                    {room.description && <p className="mt-2 line-clamp-2 text-sm text-mute">{room.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge>{room.member_count}/{room.max_participants} owners</Badge>
                      <Badge>{room.auctioneer_type} auctioneer</Badge>
                      <Badge>{formatMoney(room.purse_lakh, { compact: true })}</Badge>
                      <Badge>{room.bid_timer_sec}s</Badge>
                      {room.has_password && <Badge tone="warn">Password</Badge>}
                    </div>
                    <Link href={`/join/${room.code}`} className="mt-4" aria-disabled={!joinable}>
                      <Button variant={joinable ? "gold" : "ghost"} disabled={!joinable} className="w-full">
                        {joinable ? "Join room" : full ? "Room full" : "Auction running"}
                      </Button>
                    </Link>
                  </Panel>
                );
              })}
            </div>
          )}
        </section>

        {/* History */}
        <section>
          <h2 className="display mb-3 text-3xl">Recent auctions</h2>
          {mine === null ? (
            <div className="grid place-items-center py-12"><Spinner className="size-6 text-gold" /></div>
          ) : finished.length === 0 ? (
            <EmptyState title="No finished auctions yet">Your completed auctions and squads will appear here.</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {finished.map((auction) => (
                <Link key={auction.room_id} href={`/results/${auction.code}`} className="panel flex items-center gap-4 p-4 transition hover:border-line-strong">
                  <FranchiseLogo id={auction.franchise_id} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{auction.name}</p>
                    <p className="text-xs text-dim">
                      {new Date(auction.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      {auction.squad_count !== null && ` · ${auction.squad_count} players · ${formatMoney(auction.spent_lakh)} spent`}
                    </p>
                  </div>
                  <span className="text-mute">→</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <SoloModal open={soloOpen} onClose={() => setSoloOpen(false)} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate reason="Pick a name to create or join an auction, or sign in to keep your history.">
      <Suspense>
        <Dashboard />
      </Suspense>
    </AuthGate>
  );
}
