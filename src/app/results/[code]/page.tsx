"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { ROLE_LABEL, franchise } from "@/lib/franchises";
import { formatMoney } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/client";
import { usePlayers } from "@/hooks/usePlayers";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AuthGate } from "@/components/shared/AuthGate";
import { Avatar, FranchiseLogo, PlayerPortrait, TeamBanner, teamStyle } from "@/components/shared/identity";
import { Badge, Button, EmptyState, Panel, Spinner, cn } from "@/components/shared/ui";
import { SquadView } from "@/components/teams/SquadView";
import type { ApiError, FranchiseId, Lot, RoomSnapshot } from "@/types";

type BidRow = { lot_id: string; franchise_id: FranchiseId; amount_lakh: number; created_at: string; is_void: boolean };
type EventRow = { seq: number; type: string; payload: { lot?: Lot }; created_at: string };
type Tab = "overview" | "squads" | "players" | "timeline";

const TIMELINE_TYPES = ["auction_started", "player_sold", "player_unsold", "player_withdrawn", "auction_paused", "auction_resumed", "round_started", "auction_completed"];

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Panel className="p-4">
      <p className="eyebrow text-[10px]">{label}</p>
      <p className="display tabular mt-1 text-3xl">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-mute">{sub}</p>}
    </Panel>
  );
}

function Results() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode.toUpperCase();
  const params = useSearchParams();
  const { byId: players } = usePlayers();

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [teamId, setTeamId] = useState<FranchiseId | null>((params.get("team") as FranchiseId | null) ?? null);
  const [playerFilter, setPlayerFilter] = useState<"sold" | "unsold">("sold");

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await api<RoomSnapshot>(`/api/auctions/state?code=${encodeURIComponent(code)}`);
      if (!active) return;
      if (!result.ok) return setError(result.error);
      setSnapshot(result);
      if (!result.session) return;
      // Full history is read straight from the tables; row level security limits it to members.
      const supabase = supabaseBrowser();
      const [bidRows, eventRows] = await Promise.all([
        supabase.from("bids").select("lot_id, franchise_id, amount_lakh, created_at, is_void").eq("session_id", result.session.id).order("created_at").limit(5000),
        supabase.from("auction_events").select("seq, type, payload, created_at").eq("room_id", result.room.id).in("type", TIMELINE_TYPES).order("seq").limit(2000),
      ]);
      if (!active) return;
      setBids((bidRows.data as BidRow[] | null) ?? []);
      setEvents((eventRows.data as EventRow[] | null) ?? []);
      setHistoryLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [code]);

  const summary = useMemo(() => {
    if (!snapshot) return null;
    const { lots, teams } = snapshot;
    const sold = lots.filter((l) => l.status === "sold");
    const unsold = lots.filter((l) => l.status === "unsold" || l.status === "withdrawn");
    const total = sold.reduce((sum, l) => sum + (l.sold_price_lakh ?? 0), 0);
    const top = [...sold].sort((a, b) => (b.sold_price_lakh ?? 0) - (a.sold_price_lakh ?? 0));
    const bySpend = [...teams].sort((a, b) => (b.purse_initial_lakh - b.purse_remaining_lakh) - (a.purse_initial_lakh - a.purse_remaining_lakh));
    const byBids = [...teams].sort((a, b) => b.bids_placed - a.bids_placed);
    return {
      sold, unsold, total, top, bySpend,
      presented: sold.length + unsold.length,
      average: sold.length > 0 ? Math.round(total / sold.length) : 0,
      mostActive: byBids[0],
    };
  }, [snapshot]);

  if (error) {
    return (
      <div className="stadium grid min-h-dvh place-items-center px-4">
        <Panel className="max-w-sm p-6 text-center">
          <p className="display text-2xl">Results unavailable</p>
          <p className="mt-2 text-sm text-mute">{error.code === "NOT_MEMBER" ? "Only participants of this auction can see its results." : error.message}</p>
          <Link href="/dashboard" className="mt-4 inline-block"><Button variant="outline">Back to dashboard</Button></Link>
        </Panel>
      </div>
    );
  }
  if (!snapshot || !summary) {
    return <div className="stadium grid min-h-dvh place-items-center"><Spinner className="size-8 text-gold" /></div>;
  }

  const { room, teams, squads, settings, members } = snapshot;
  const ownerName = (userId: string) => members.find((m) => m.user_id === userId)?.display_name ?? "Owner";
  const playerName = (id: string | undefined) => (id ? players.get(id)?.full_name : undefined) ?? "Player";
  const selected = teams.find((t) => t.franchise_id === (teamId ?? snapshot.me.franchise_id ?? teams[0]?.franchise_id));
  const champion = summary.top[0];
  const bidCount = (lotId: string) => bids.filter((b) => b.lot_id === lotId && !b.is_void).length;

  return (
    <div className="stadium min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="animate-rise">
            <p className="eyebrow">Auction results · {room.code}</p>
            <h1 className="display text-5xl sm:text-6xl">{room.name}</h1>
            <p className="mt-1 text-sm text-mute">
              {room.status === "completed" ? "Completed" : "In progress"}
              {room.completed_at && ` on ${new Date(room.completed_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
              {` · ${teams.length} franchises`}
            </p>
          </div>
          {room.status !== "completed" && (
            <Link href={`/auction/${room.code}`}><Button variant="gold">Back to live auction</Button></Link>
          )}
        </div>

        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-black/30 p-1">
          {(["overview", "squads", "players", "timeline"] as Tab[]).map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition", tab === id ? "bg-gold text-ink" : "text-mute hover:text-chalk")}
            >
              {id}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Players presented" value={summary.presented} />
              <Stat label="Sold" value={summary.sold.length} sub={`${summary.unsold.length} unsold`} />
              <Stat label="Total spending" value={formatMoney(summary.total)} />
              <Stat label="Average sale price" value={formatMoney(summary.average)} />
              <Stat
                label="Highest-priced player"
                value={champion ? formatMoney(champion.sold_price_lakh) : "—"}
                sub={champion ? `${playerName(champion.player_id)} · ${champion.sold_to}` : undefined}
              />
              <Stat
                label="Highest spender"
                value={summary.bySpend[0] ? summary.bySpend[0].franchise_id : "—"}
                sub={summary.bySpend[0] ? formatMoney(summary.bySpend[0].purse_initial_lakh - summary.bySpend[0].purse_remaining_lakh) : undefined}
              />
              <Stat
                label="Most active franchise"
                value={summary.mostActive ? summary.mostActive.franchise_id : "—"}
                sub={summary.mostActive ? `${summary.mostActive.bids_placed} bids placed` : undefined}
              />
              <Stat label="Total bids" value={historyLoaded ? bids.filter((b) => !b.is_void).length : "…"} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel className="p-5">
                <h2 className="display mb-4 text-3xl">Spending leaderboard</h2>
                <ol className="space-y-2">
                  {summary.bySpend.map((team, index) => {
                    const spent = team.purse_initial_lakh - team.purse_remaining_lakh;
                    const info = franchise(team.franchise_id);
                    return (
                      <li key={team.franchise_id}>
                        <button
                          onClick={() => {
                            setTeamId(team.franchise_id);
                            setTab("squads");
                          }}
                          className="flex w-full items-center gap-3 rounded-xl border border-line bg-black/20 p-3 text-left transition hover:border-line-strong"
                        >
                          <span className="display w-6 text-xl text-dim">{index + 1}</span>
                          <FranchiseLogo id={team.franchise_id} size={38} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">{info?.name}</p>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full" style={{ width: `${Math.round((spent / team.purse_initial_lakh) * 100)}%`, background: info?.color }} />
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="display tabular text-xl">{formatMoney(spent)}</p>
                            <p className="tabular text-[11px] text-mute">{team.squad_count} players · {formatMoney(team.purse_remaining_lakh)} left</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </Panel>

              <Panel className="p-5">
                <h2 className="display mb-4 text-3xl">Highest-priced players</h2>
                {summary.top.length === 0 && <EmptyState title="No sales recorded" />}
                <ol className="space-y-2">
                  {summary.top.slice(0, 8).map((lot, index) => {
                    const player = players.get(lot.player_id);
                    return (
                      <li key={lot.id} className="flex items-center gap-3 rounded-xl border border-line bg-black/20 p-3">
                        <span className="display w-6 text-xl text-dim">{index + 1}</span>
                        <PlayerPortrait name={player?.full_name ?? "?"} photoUrl={player?.photo_url} teamId={lot.sold_to} size={38} className="rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{player?.full_name ?? "Player"}</p>
                          <p className="text-[11px] text-mute">{player ? `${ROLE_LABEL[player.role]} · ${player.country}` : ""} {historyLoaded && ` · ${bidCount(lot.id)} bids`}</p>
                        </div>
                        <FranchiseLogo id={lot.sold_to} size={28} />
                        <span className="display tabular gold-text text-xl">{formatMoney(lot.sold_price_lakh)}</span>
                      </li>
                    );
                  })}
                </ol>
              </Panel>
            </div>

            <Panel className="p-5">
              <h2 className="display mb-4 text-3xl">Owners</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((team) => {
                  const owner = members.find((m) => m.user_id === team.user_id);
                  return (
                    <div key={team.franchise_id} className="flex items-center gap-3 rounded-xl border border-line bg-black/20 p-3">
                      <FranchiseLogo id={team.franchise_id} size={36} />
                      <span className="flex-1 truncate text-sm font-bold">{franchise(team.franchise_id)?.name}</span>
                      <Avatar name={ownerName(team.user_id)} src={owner?.avatar_url} size={24} />
                      <span className="max-w-28 truncate text-xs text-mute">{ownerName(team.user_id)}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        )}

        {tab === "squads" && (
          <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
            <div className="grid grid-cols-2 gap-2 self-start sm:grid-cols-5 lg:grid-cols-2">
              {teams.map((team) => (
                <button
                  key={team.franchise_id}
                  onClick={() => setTeamId(team.franchise_id)}
                  style={teamStyle(team.franchise_id)}
                  className={cn("overflow-hidden rounded-xl border border-line transition", selected?.franchise_id === team.franchise_id ? "team-glow" : "opacity-70 hover:opacity-100")}
                  aria-label={franchise(team.franchise_id)?.name}
                  aria-pressed={selected?.franchise_id === team.franchise_id}
                >
                  <TeamBanner id={team.franchise_id} logoSize={52} className="aspect-[3/2] w-full" />
                </button>
              ))}
            </div>
            <Panel className="p-5">
              {selected ? (
                <SquadView
                  team={selected}
                  squad={squads.filter((entry) => entry.franchise_id === selected.franchise_id)}
                  players={players}
                  settings={settings}
                  ownerName={ownerName(selected.user_id)}
                />
              ) : (
                <EmptyState title="No franchises in this auction" />
              )}
            </Panel>
          </div>
        )}

        {tab === "players" && (
          <Panel className="p-5">
            <div className="mb-4 flex gap-2">
              <Button size="sm" variant={playerFilter === "sold" ? "gold" : "ghost"} onClick={() => setPlayerFilter("sold")}>Sold · {summary.sold.length}</Button>
              <Button size="sm" variant={playerFilter === "unsold" ? "gold" : "ghost"} onClick={() => setPlayerFilter("unsold")}>Unsold · {summary.unsold.length}</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-mute">
                    <th className="pb-2 pr-3 font-semibold">Lot</th>
                    <th className="pb-2 pr-3 font-semibold">Player</th>
                    <th className="pb-2 pr-3 font-semibold">Role</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Base</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Bids</th>
                    <th className="pb-2 pr-3 font-semibold">Franchise</th>
                    <th className="pb-2 text-right font-semibold">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(playerFilter === "sold" ? summary.sold : summary.unsold).map((lot) => {
                    const player = players.get(lot.player_id);
                    return (
                      <tr key={lot.id} className="border-t border-line">
                        <td className="tabular py-2 pr-3 text-dim">{String(lot.lot_order).padStart(3, "0")}</td>
                        <td className="py-2 pr-3 font-bold">
                          {player?.full_name ?? "Player"}
                          {player?.is_overseas && <span className="ml-1.5 text-[10px] font-semibold text-warn">OS</span>}
                        </td>
                        <td className="py-2 pr-3 text-mute">{player ? ROLE_LABEL[player.role] : ""}</td>
                        <td className="tabular py-2 pr-3 text-right text-mute">{formatMoney(lot.base_price_lakh)}</td>
                        <td className="tabular py-2 pr-3 text-right text-mute">{historyLoaded ? bidCount(lot.id) : "…"}</td>
                        <td className="py-2 pr-3">
                          {lot.sold_to ? (
                            <span className="flex items-center gap-2"><FranchiseLogo id={lot.sold_to} size={22} /> {lot.sold_to}</span>
                          ) : (
                            <Badge>{lot.status}</Badge>
                          )}
                        </td>
                        <td className="display tabular py-2 text-right text-lg">{formatMoney(lot.sold_price_lakh)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {tab === "timeline" && (
          <Panel className="p-5">
            {events.length === 0 && <EmptyState title={historyLoaded ? "No events recorded yet" : "Loading timeline"} />}
            <ol className="space-y-2">
              {events.map((event) => {
                const lot = event.payload.lot;
                let text: React.ReactNode = event.type.replaceAll("_", " ");
                if (event.type === "player_sold" && lot) {
                  text = (
                    <>
                      <b>{playerName(lot.player_id)}</b> sold to <b>{franchise(lot.sold_to)?.name ?? lot.sold_to}</b> for{" "}
                      <b className="text-gold">{formatMoney(lot.sold_price_lakh)}</b>
                    </>
                  );
                } else if (event.type === "player_unsold" && lot) {
                  text = <><b>{playerName(lot.player_id)}</b> went unsold</>;
                } else if (event.type === "player_withdrawn" && lot) {
                  text = <><b>{playerName(lot.player_id)}</b> was withdrawn</>;
                } else if (event.type === "round_started") {
                  text = "Accelerated round started: unsold players return";
                } else if (event.type === "auction_started") {
                  text = "Auction started";
                } else if (event.type === "auction_completed") {
                  text = "Auction completed";
                } else if (event.type === "auction_paused") {
                  text = "Auction paused";
                } else if (event.type === "auction_resumed") {
                  text = "Auction resumed";
                }
                return (
                  <li key={event.seq} className="flex items-baseline gap-4 border-b border-line pb-2 text-sm last:border-0">
                    <time className="tabular w-20 shrink-0 text-xs text-dim">
                      {new Date(event.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </time>
                    <span>{text}</span>
                  </li>
                );
              })}
            </ol>
          </Panel>
        )}
      </main>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <AuthGate reason="Sign in to see the results of this auction.">
      <Suspense>
        <Results />
      </Suspense>
    </AuthGate>
  );
}
