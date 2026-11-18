"use client";

import { ROLE_LABEL, ROLE_PLURAL, franchise } from "@/lib/franchises";
import { formatMoney } from "@/lib/money";
import { PlayerPortrait, TeamBanner, teamStyle } from "@/components/shared/identity";
import { Badge, EmptyState } from "@/components/shared/ui";
import type { Player, PlayerRole, RoomSettings, SquadEntry, Team } from "@/types";

const ROLES: PlayerRole[] = ["BAT", "WK", "AR", "BWL"];

/** One franchise's purse and squad. Used live in the auction room and on the results page. */
export function SquadView({
  team,
  squad,
  players,
  settings,
  ownerName,
  strategy,
}: {
  team: Team;
  squad: SquadEntry[];
  players: Map<string, Player>;
  settings: RoomSettings;
  ownerName?: string;
  strategy?: string | null;
}) {
  const info = franchise(team.franchise_id);
  const rows = squad
    .map((entry) => ({ entry, player: players.get(entry.player_id) }))
    .sort((a, b) => b.entry.price_lakh - a.entry.price_lakh);
  const spent = team.purse_initial_lakh - team.purse_remaining_lakh;
  const count = (role: PlayerRole) => rows.filter((r) => r.player?.role === role).length;
  const indian = rows.filter((r) => r.player && !r.player.is_overseas).length;
  const unfilled = Math.max(0, settings.squad_min - team.squad_count);

  const stats: [string, string][] = [
    ["Initial purse", formatMoney(team.purse_initial_lakh, { compact: true })],
    ["Spent", formatMoney(spent)],
    ["Remaining", formatMoney(team.purse_remaining_lakh)],
    ["Squad", `${team.squad_count} / ${settings.squad_max}`],
    ["Indian", String(indian)],
    ["Overseas", `${team.overseas_count} / ${settings.overseas_max}`],
  ];

  return (
    <div style={teamStyle(team.franchise_id)}>
      <div className="overflow-hidden rounded-2xl team-glow">
        <TeamBanner id={team.franchise_id} logoSize={84} className="h-36 w-full" />
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="display text-3xl">{info?.name}</h3>
          {ownerName && <p className="text-sm text-mute">Owner: {ownerName}</p>}
          {strategy && <p className="mt-1 max-w-xl text-sm text-gold">AI strategy: {strategy}</p>}
        </div>
        {unfilled > 0 && <Badge tone="warn">{unfilled} below minimum squad</Badge>}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-black/25 px-3 py-2">
            <dt className="eyebrow text-[10px]">{label}</dt>
            <dd className="display tabular text-xl">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {ROLES.map((role) => (
          <div key={role} className="rounded-xl border border-line bg-black/25 px-3 py-2 text-center">
            <p className="display tabular text-2xl">{count(role)}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-mute">{ROLE_PLURAL[role]}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        {rows.length === 0 && <EmptyState title="No players yet" />}
        {rows.map(({ entry, player }) => (
          <div key={entry.player_id} className="flex items-center gap-3 rounded-xl border border-line bg-black/20 px-3 py-2">
            <PlayerPortrait name={player?.full_name ?? "?"} photoUrl={player?.photo_url} teamId={team.franchise_id} size={38} className="rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{player?.full_name ?? "Unknown player"}</p>
              <p className="text-[11px] text-mute">
                {player ? `${ROLE_LABEL[player.role]} · ${player.country}` : ""}
                {player?.is_overseas && " · overseas"}
              </p>
            </div>
            {entry.is_retained && <Badge tone="gold">Retained</Badge>}
            <span className="display tabular text-lg">{formatMoney(entry.price_lakh)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
