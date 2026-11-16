"use client";

import { ROLE_LABEL, franchise, setLabel } from "@/lib/franchises";
import { formatMoney, maxBid } from "@/lib/money";
import { FranchiseLogo, PlayerPortrait, TeamBanner, teamStyle } from "@/components/shared/identity";
import { Badge, Button, cn } from "@/components/shared/ui";
import type { Lot, Player, RoomSnapshot } from "@/types";

function Countdown({ remainingMs, totalSec, open }: { remainingMs: number | null; totalSec: number; open: boolean }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  if (remainingMs === null) {
    return (
      <div className="grid size-32 shrink-0 place-items-center rounded-full border-2 border-dashed border-line-strong text-center">
        <span className="eyebrow px-3 leading-tight">{open ? "Open bidding" : "Clock stopped"}</span>
      </div>
    );
  }
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = Math.min(1, remainingMs / (totalSec * 1000));
  const urgent = seconds <= 5;
  return (
    <div className={cn("relative grid size-32 shrink-0 place-items-center", urgent && "animate-urgent")} role="timer" aria-label={`${seconds} seconds left`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius} fill="none" strokeWidth="8" strokeLinecap="round"
          stroke={urgent ? "#ff3b4e" : "#f6c453"}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 120ms linear, stroke 200ms" }}
        />
      </svg>
      <div className="text-center">
        <p className={cn("display tabular text-5xl leading-none", urgent ? "text-live" : "text-chalk")}>{String(seconds).padStart(2, "0")}</p>
        <p className="eyebrow mt-1 text-[10px]">seconds</p>
      </div>
    </div>
  );
}

function ResultStamp({ lot, playerName }: { lot: Lot; playerName: string }) {
  if (lot.status === "sold" && lot.sold_to) {
    const team = franchise(lot.sold_to);
    return (
      <div data-testid="result-stamp" className="absolute inset-0 z-10 grid place-items-center bg-ink/80 backdrop-blur-sm" style={teamStyle(lot.sold_to)}>
        <div className="text-center">
          <p className="display animate-stamp gold-text text-8xl drop-shadow-[0_6px_30px_rgba(246,196,83,0.5)] sm:text-9xl">Sold</p>
          <div className="mx-auto mt-4 w-72 animate-rise overflow-hidden rounded-2xl team-glow [animation-delay:250ms]">
            <TeamBanner id={lot.sold_to} logoSize={92} className="aspect-[3/2] w-full" />
          </div>
          <p className="display mt-4 animate-rise text-3xl [animation-delay:350ms]">
            {playerName} <span className="text-mute">to</span> {team?.name}
          </p>
          <p className="display tabular gold-text animate-rise text-6xl [animation-delay:450ms]">{formatMoney(lot.sold_price_lakh)}</p>
        </div>
      </div>
    );
  }
  return (
    <div data-testid="result-stamp" className="absolute inset-0 z-10 grid place-items-center bg-ink/80 backdrop-blur-sm">
      <div className="text-center">
        <p className="display animate-stamp text-8xl text-mute sm:text-9xl">{lot.status === "withdrawn" ? "Withdrawn" : "Unsold"}</p>
        <p className="display mt-4 animate-rise text-3xl [animation-delay:250ms]">{playerName}</p>
        <p className="mt-1 text-sm text-dim">
          {lot.status === "withdrawn" ? "Removed from this auction." : "No bids. May return in the final round."}
        </p>
      </div>
    </div>
  );
}

export function Stage({
  snapshot,
  players,
  remainingMs,
  nextInMs,
  onBid,
  onPass,
  busy,
}: {
  snapshot: RoomSnapshot;
  players: Map<string, Player>;
  remainingMs: number | null;
  nextInMs: number | null;
  onBid: () => void;
  onPass: () => void;
  busy: boolean;
}) {
  const { session, settings, lots, teams, me, room } = snapshot;
  if (!session) return null;

  const lot = lots.find((l) => l.id === session.current_lot_id);
  const player = lot ? players.get(lot.player_id) : undefined;
  const paused = session.status === "paused";
  const human = room.auctioneer_type === "human";

  // Waiting states: before the first lot, or between lots with a human auctioneer.
  if (!lot || session.phase === "intro" || session.phase === "idle") {
    return (
      <div className="panel relative grid min-h-[26rem] place-items-center overflow-hidden p-8 text-center">
        <div>
          <p className="eyebrow">{paused ? "Paused" : "Stand by"}</p>
          <p className="display mt-2 text-5xl sm:text-6xl">
            {paused ? "Auction paused" : session.phase === "intro" ? "The auction is about to begin" : "Waiting for the auctioneer"}
          </p>
          <p className="mt-3 text-mute">
            {paused
              ? "The host or auctioneer will resume shortly."
              : session.phase === "intro" && nextInMs !== null
                ? `First player in ${Math.ceil(nextInMs / 1000)} seconds`
                : human
                  ? "The auctioneer will present the next player."
                  : "Preparing the next player."}
          </p>
          <p className="tabular mt-6 text-sm text-dim">{session.lots_total} players in today&apos;s list</p>
        </div>
      </div>
    );
  }

  const myTeam = teams.find((t) => t.franchise_id === me.franchise_id);
  const leader = franchise(session.current_bidder);
  // Same rule as the server: cheapest base price still in the pool, or 30 lakh if none is left.
  const pendingBases = lots.filter((l) => l.status === "pending").map((l) => l.base_price_lakh);
  const cheapest = pendingBases.length > 0 ? Math.min(...pendingBases) : 30;
  const myMax = myTeam ? maxBid(myTeam.purse_remaining_lakh, myTeam.squad_count, settings.squad_min, cheapest) : 0;
  const nextAmount = session.next_bid_lakh ?? lot.base_price_lakh;
  const bidding = session.phase === "bidding" && !paused;
  const name = player?.full_name ?? "Player";

  let blocked: string | null = null;
  if (!myTeam) blocked = "You are not bidding in this auction";
  else if (!bidding) blocked = paused ? "Auction paused" : "Bidding closed";
  else if (session.current_bidder === me.franchise_id) blocked = "You hold the highest bid";
  else if (session.passes.includes(myTeam.franchise_id)) blocked = "You passed on this player";
  else if (myTeam.squad_count >= settings.squad_max) blocked = "Your squad is full";
  else if (player?.is_overseas && myTeam.overseas_count >= settings.overseas_max) blocked = "Overseas limit reached";
  else if (nextAmount > myTeam.purse_remaining_lakh) blocked = "Not enough purse";
  else if (nextAmount > myMax) blocked = "Purse reserved for minimum squad";

  const canPass = Boolean(myTeam) && bidding && session.current_bidder !== me.franchise_id && !session.passes.includes(myTeam!.franchise_id);

  return (
    <div className="panel relative overflow-hidden" style={teamStyle(session.current_bidder)}>
      {session.phase === "result" && <ResultStamp lot={lot} playerName={name} />}
      {paused && session.phase === "bidding" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink/75 backdrop-blur-sm">
          <p className="display animate-blink text-7xl text-warn">Paused</p>
        </div>
      )}

      {/* Lower-third header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="strip bg-gold px-4 py-1 pr-6 font-[family-name:var(--font-display)] text-sm font-extrabold uppercase tracking-widest text-ink">
            Lot {String(lot.lot_order).padStart(3, "0")}
          </span>
          <span className="eyebrow">{setLabel(lot.auction_set)}</span>
        </div>
        <div className="flex gap-1.5">
          {session.round > 1 && <Badge tone="warn">Accelerated round</Badge>}
          {player?.is_marquee && <Badge tone="gold">Marquee</Badge>}
        </div>
      </div>

      {/* Player presentation. `key` restarts the reveal animation for each lot. */}
      <div key={lot.id} className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[auto_1fr]">
        <div className="animate-pop mx-auto">
          <PlayerPortrait name={name} photoUrl={player?.photo_url} teamId={player?.franchise_id} size={176} className="shadow-2xl" />
        </div>
        <div className="animate-rise min-w-0">
          <h2 data-testid="player-name" className="display text-5xl sm:text-6xl">{name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {player && <Badge tone="gold">{ROLE_LABEL[player.role]}</Badge>}
            {player && <Badge>{player.country}</Badge>}
            {player && <Badge tone={player.is_overseas ? "warn" : "neutral"}>{player.is_overseas ? "Overseas" : "Indian"}</Badge>}
            {player && <Badge>{player.is_capped ? "Capped" : "Uncapped"}</Badge>}
            {player?.bowling_style && <Badge>{player.bowling_style}</Badge>}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="eyebrow">Base price</dt>
              <dd className="display tabular text-2xl">{formatMoney(lot.base_price_lakh)}</dd>
            </div>
            {player?.franchise_id && (
              <div>
                <dt className="eyebrow">Last team</dt>
                <dd className="mt-0.5 flex items-center gap-2 font-semibold">
                  <FranchiseLogo id={player.franchise_id} size={24} /> {player.franchise_id}
                </dd>
              </div>
            )}
            {Object.entries(player?.stats ?? {}).slice(0, 4).map(([label, value]) => (
              <div key={label}>
                <dt className="eyebrow">{label}</dt>
                <dd className="display tabular text-2xl">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Live bid strip */}
      <div className={cn("flex flex-wrap items-center justify-between gap-5 border-t border-line px-5 py-5 sm:px-7", leader && "team-wash")}>
        <div className="min-w-0">
          <p className="eyebrow">{session.current_bid_lakh === null ? "Opening bid" : "Current highest bid"}</p>
          {/* key retriggers the pop on every new bid */}
          <p key={session.current_bid_lakh ?? "open"} data-testid="current-bid" className="display tabular gold-text animate-pop text-6xl sm:text-7xl">
            {formatMoney(session.current_bid_lakh ?? lot.base_price_lakh)}
          </p>
          <div className="mt-1 flex h-8 items-center gap-2">
            {leader ? (
              <>
                <FranchiseLogo id={leader.id} size={28} />
                <span data-testid="leader" className="display text-2xl" style={{ color: leader.color }}>{leader.name}</span>
              </>
            ) : (
              <span className="text-sm text-mute">No bids yet</span>
            )}
          </div>
        </div>
        <Countdown remainingMs={bidding ? remainingMs : null} totalSec={session.timer_sec} open={bidding && human} />
      </div>

      {/* Bid controls */}
      <div className="grid gap-3 border-t border-line bg-black/25 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Button
            variant="gold"
            size="lg"
            disabled={Boolean(blocked)}
            busy={busy}
            onClick={onBid}
            className={cn("h-16 flex-col gap-0 text-lg", !blocked && "shine")}
            aria-label={blocked ?? `Bid ${formatMoney(nextAmount)}`}
          >
            <span className="display text-2xl leading-none">{blocked ? blocked : `Bid ${formatMoney(nextAmount)}`}</span>
            {!blocked && <span className="text-[11px] font-semibold opacity-70">press B</span>}
          </Button>
          <Button variant="outline" size="lg" disabled={!canPass} onClick={onPass} className="h-16 px-6">
            <span className="display text-2xl leading-none">Pass</span>
          </Button>
        </div>
        {myTeam && (
          <dl className="grid grid-cols-3 gap-4 text-right sm:min-w-72">
            <div>
              <dt className="eyebrow text-[10px]">Your purse</dt>
              <dd className="display tabular text-2xl">{formatMoney(myTeam.purse_remaining_lakh)}</dd>
            </div>
            <div>
              <dt className="eyebrow text-[10px]">Max bid</dt>
              <dd className="display tabular text-2xl">{formatMoney(myMax)}</dd>
            </div>
            <div>
              <dt className="eyebrow text-[10px]">Squad</dt>
              <dd className="display tabular text-2xl">
                {String(myTeam.squad_count).padStart(2, "0")}<span className="text-mute">/{settings.squad_max}</span>
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
