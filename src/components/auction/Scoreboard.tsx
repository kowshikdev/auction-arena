"use client";

import { franchise } from "@/lib/franchises";
import { formatMoney } from "@/lib/money";
import { useNow } from "@/hooks/useNow";
import { Avatar, FranchiseLogo, teamStyle } from "@/components/shared/identity";
import { Badge, cn } from "@/components/shared/ui";
import type { FranchiseId, RoomSnapshot } from "@/types";

/** Every active franchise: purse, squad, and where it stands on the current lot. */
export function Scoreboard({
  snapshot,
  online,
  speaking,
  onSelect,
}: {
  snapshot: RoomSnapshot;
  online: Set<string>;
  speaking: Set<string>;
  onSelect: (id: FranchiseId) => void;
}) {
  const { teams, session, settings, members, me, bids } = snapshot;
  const now = useNow();
  const lastBid = new Map<FranchiseId, number>();
  for (const bid of bids) lastBid.set(bid.franchise_id, bid.amount_lakh);
  const passes = new Set(session?.passes ?? []);

  return (
    <div className="space-y-2">
      {teams.map((team) => {
        const info = franchise(team.franchise_id);
        const owner = members.find((m) => m.user_id === team.user_id);
        const leading = session?.current_bidder === team.franchise_id && session.phase === "bidding";
        const mine = me.franchise_id === team.franchise_id;
        const isOnline = owner ? online.has(owner.user_id) || now - new Date(owner.last_seen_at).getTime() < 45_000 : false;
        const spentPct = 100 - Math.round((team.purse_remaining_lakh / team.purse_initial_lakh) * 100);
        return (
          <button
            key={team.franchise_id}
            onClick={() => onSelect(team.franchise_id)}
            style={teamStyle(team.franchise_id)}
            className={cn(
              "panel w-full p-3 text-left transition hover:border-line-strong",
              leading && "team-glow team-wash",
              passes.has(team.franchise_id) && !leading && "opacity-60",
            )}
            aria-label={`${info?.name}: purse ${formatMoney(team.purse_remaining_lakh)}, ${team.squad_count} players`}
          >
            <div className="flex items-center gap-3">
              <span className="relative">
                <FranchiseLogo id={team.franchise_id} size={42} />
                <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-panel", isOnline ? "bg-go" : "bg-dim")} title={isOnline ? "Online" : "Disconnected"} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="display text-xl leading-none">{team.franchise_id}</span>
                  {mine && <Badge tone="gold">You</Badge>}
                  {leading && <Badge tone="go">Leading</Badge>}
                  {passes.has(team.franchise_id) && !leading && <Badge>Passed</Badge>}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-mute">
                  {owner && <Avatar name={owner.display_name} src={owner.avatar_url} size={14} />}
                  <span className="truncate">{owner?.display_name ?? "Owner"}</span>
                  {owner && speaking.has(owner.user_id) && <span className="font-bold text-go">· speaking</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p data-testid={`purse-${team.franchise_id}`} className="display tabular text-xl leading-none">{formatMoney(team.purse_remaining_lakh)}</p>
                <p className="tabular mt-1 text-[11px] text-mute">
                  {settings.squad_max - team.squad_count} slots · {settings.overseas_max - team.overseas_count} OS
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${spentPct}%`, background: info?.color }} />
              </div>
              <span className="tabular w-20 text-right text-[11px] font-semibold text-mute">
                {lastBid.has(team.franchise_id) ? `bid ${formatMoney(lastBid.get(team.franchise_id))}` : "no bid"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
