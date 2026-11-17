"use client";

import { useEffect, useState } from "react";
import { ROLE_LABEL, franchise } from "@/lib/franchises";
import { formatMoney } from "@/lib/money";
import type { Featured } from "@/lib/featured";
import { FranchiseLogo, PlayerPortrait, teamStyle } from "@/components/shared/identity";
import { Badge, LiveDot, cn } from "@/components/shared/ui";

/** Landing-page card: real players from the season catalogue, cycling every few seconds. */
export function HeroCard({ featured }: { featured: Featured }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const { players, teams } = featured;

  useEffect(() => {
    if (paused || players.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % players.length), 4500);
    return () => clearInterval(timer);
  }, [paused, players.length]);

  const player = players[index];
  if (!player) return null;
  const team = franchise(player.team);
  const stats = Object.entries(player.stats).filter(([k]) => k !== "Age").slice(0, 3);

  return (
    <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gold/10 blur-3xl" />
      <div className="panel overflow-hidden" style={teamStyle(player.team)}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="eyebrow flex items-center gap-2 text-[#ff8f9b]"><LiveDot /> {featured.season}</span>
          <span className="eyebrow">Up for auction</span>
        </div>

        <div key={player.id} className="grid gap-5 p-5 sm:grid-cols-[auto_1fr]">
          <PlayerPortrait name={player.name} teamId={player.team} size={132} className="animate-pop" />
          <div className="min-w-0 animate-rise">
            <p data-testid="hero-player" className="display truncate text-4xl">{player.name}</p>
            <p className="mt-1 text-sm text-mute">{ROLE_LABEL[player.role]} · {player.country}</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Base price</p>
                <p className="display tabular gold-text text-5xl">{formatMoney(player.base_lakh)}</p>
              </div>
              {team && (
                <div className="text-right">
                  <p className="eyebrow mb-1">Last team</p>
                  <FranchiseLogo id={team.id} size={44} />
                </div>
              )}
            </div>
            {stats.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {stats.map(([label, value]) => (
                  <Badge key={label}>{label} {value}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center gap-1.5 pb-3" aria-hidden>
          {players.map((p, i) => (
            <span key={p.id} className={cn("h-1 rounded-full transition-all", i === index ? "w-6 bg-gold" : "w-2 bg-white/20")} />
          ))}
        </div>

        {teams.length > 0 && (
          <div className="grid grid-cols-4 gap-px border-t border-line bg-line">
            {teams.map((t) => (
              <div key={t.franchise_id} className="flex flex-col items-center gap-1.5 bg-panel px-2 py-3">
                <FranchiseLogo id={t.franchise_id} size={34} />
                <span className="tabular text-xs font-semibold text-chalk">{formatMoney(t.purse_lakh)}</span>
                <span className="text-[10px] text-mute">{t.slots} slots left</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
