"use client";

import { useState } from "react";
import { ROLE_LABEL, franchise } from "@/lib/franchises";
import { formatMoney } from "@/lib/money";
import { ChatPanel } from "@/components/shared/ChatPanel";
import { FranchiseLogo } from "@/components/shared/identity";
import { Badge, EmptyState, cn } from "@/components/shared/ui";
import type { Lot, Player, RoomSnapshot } from "@/types";

type Tab = "bids" | "queue" | "sold" | "unsold" | "chat";
const TABS: { id: Tab; label: string }[] = [
  { id: "bids", label: "Bids" },
  { id: "queue", label: "Up next" },
  { id: "sold", label: "Sold" },
  { id: "unsold", label: "Unsold" },
  { id: "chat", label: "Chat" },
];

function LotRow({ lot, player, right }: { lot: Lot; player?: Player; right: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-black/20 px-3 py-2">
      <span className="tabular w-8 shrink-0 text-xs font-bold text-dim">{String(lot.lot_order).padStart(3, "0")}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{player?.full_name ?? "Player"}</p>
        <p className="text-[11px] text-mute">
          {player ? `${ROLE_LABEL[player.role]} · ${player.country}` : lot.auction_set}
        </p>
      </div>
      {right}
    </li>
  );
}

/** Bid history, upcoming queue, sold and unsold lists, and room chat. */
export function SidePanel({ snapshot, players }: { snapshot: RoomSnapshot; players: Map<string, Player> }) {
  const [tab, setTab] = useState<Tab>("bids");
  const { lots, bids, session, me } = snapshot;

  const queue = lots.filter((l) => l.status === "pending").slice(0, 15);
  const sold = lots.filter((l) => l.status === "sold").reverse();
  const unsold = lots.filter((l) => l.status === "unsold" || l.status === "withdrawn").reverse();
  const counts: Partial<Record<Tab, number>> = { bids: bids.length, sold: sold.length, unsold: unsold.length };

  return (
    <div className="panel flex h-full min-h-[24rem] flex-col p-3">
      <div role="tablist" className="mb-3 grid grid-cols-5 gap-1 rounded-xl bg-black/30 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-lg px-1 py-1.5 text-[11px] font-bold uppercase tracking-wide transition",
              tab === item.id ? "bg-gold text-ink" : "text-mute hover:text-chalk",
            )}
          >
            {item.label}
            {counts[item.id] ? <span className="ml-1 opacity-70">{counts[item.id]}</span> : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "bids" && (
          <ul className="space-y-1.5">
            {bids.length === 0 && <EmptyState title="No bids yet">Bids on the current player appear here.</EmptyState>}
            {[...bids].reverse().map((bid, index) => {
              const team = franchise(bid.franchise_id);
              return (
                <li
                  key={`${bid.created_at}-${bid.amount_lakh}`}
                  className={cn("flex items-center gap-3 rounded-xl border px-3 py-2", index === 0 ? "animate-rise border-gold/50 bg-gold/10" : "border-line bg-black/20")}
                >
                  <FranchiseLogo id={bid.franchise_id} size={28} />
                  <span className="flex-1 truncate text-sm font-bold" style={{ color: team?.color }}>{team?.name ?? bid.franchise_id}</span>
                  <span className="display tabular text-xl">{formatMoney(bid.amount_lakh)}</span>
                </li>
              );
            })}
          </ul>
        )}

        {tab === "queue" && (
          <ul className="space-y-1.5">
            {queue.length === 0 && <EmptyState title="Queue is empty" />}
            {queue.map((lot) => (
              <LotRow key={lot.id} lot={lot} player={players.get(lot.player_id)} right={<span className="tabular text-xs font-semibold text-mute">{formatMoney(lot.base_price_lakh)}</span>} />
            ))}
            {session && session.lots_total - session.lots_done > queue.length && (
              <li className="py-2 text-center text-xs text-dim">and more to come</li>
            )}
          </ul>
        )}

        {tab === "sold" && (
          <ul className="space-y-1.5">
            {sold.length === 0 && <EmptyState title="Nobody sold yet" />}
            {sold.map((lot) => (
              <LotRow
                key={lot.id}
                lot={lot}
                player={players.get(lot.player_id)}
                right={
                  <span className="flex items-center gap-2">
                    <FranchiseLogo id={lot.sold_to} size={24} />
                    <span className="display tabular text-lg">{formatMoney(lot.sold_price_lakh)}</span>
                  </span>
                }
              />
            ))}
          </ul>
        )}

        {tab === "unsold" && (
          <ul className="space-y-1.5">
            {unsold.length === 0 && <EmptyState title="No unsold players" />}
            {unsold.map((lot) => (
              <LotRow key={lot.id} lot={lot} player={players.get(lot.player_id)} right={<Badge>{lot.status}</Badge>} />
            ))}
          </ul>
        )}

        {tab === "chat" && <ChatPanel roomId={snapshot.room.id} messages={snapshot.chat} meId={me.user_id} className="h-full" />}
      </div>
    </div>
  );
}
