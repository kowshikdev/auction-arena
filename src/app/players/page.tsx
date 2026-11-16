"use client";

import { useMemo, useState } from "react";
import { ROLE_LABEL, FRANCHISES, setLabel } from "@/lib/franchises";
import { formatMoney } from "@/lib/money";
import { usePlayers } from "@/hooks/usePlayers";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { FranchiseLogo, PlayerPortrait } from "@/components/shared/identity";
import { Badge, EmptyState, Input, Modal, Select, Spinner } from "@/components/shared/ui";
import type { Player } from "@/types";

const SET_GROUPS = [
  ["M", "Marquee"], ["BA", "Capped batters"], ["AL", "Capped all-rounders"], ["WK", "Capped wicketkeepers"],
  ["FA", "Capped fast bowlers"], ["SP", "Capped spinners"], ["UBA", "Uncapped batters"], ["UAL", "Uncapped all-rounders"],
  ["UWK", "Uncapped wicketkeepers"], ["UFA", "Uncapped fast bowlers"], ["USP", "Uncapped spinners"],
] as const;

export default function PlayersPage() {
  const { players, season, loading } = usePlayers();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [nationality, setNationality] = useState("");
  const [team, setTeam] = useState("");
  const [base, setBase] = useState("");
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState("set");
  const [open, setOpen] = useState<Player | null>(null);

  const countries = useMemo(() => [...new Set(players.map((p) => p.country))].sort(), [players]);
  const bases = useMemo(() => [...new Set(players.map((p) => p.base_price_lakh))].sort((a, b) => b - a), [players]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = players.filter((p) => {
      if (!p.is_active) return false;
      if (q && !p.full_name.toLowerCase().includes(q)) return false;
      if (role && p.role !== role) return false;
      if (nationality === "indian" && p.is_overseas) return false;
      if (nationality === "overseas" && !p.is_overseas) return false;
      if (nationality && !["indian", "overseas"].includes(nationality) && p.country !== nationality) return false;
      if (team && p.franchise_id !== team) return false;
      if (base && p.base_price_lakh !== Number(base)) return false;
      if (group && p.auction_set.replace(/\d+$/, "") !== group) return false;
      return true;
    });
    if (sort === "name") list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    else if (sort === "price-desc") list.sort((a, b) => b.base_price_lakh - a.base_price_lakh || a.full_name.localeCompare(b.full_name));
    else if (sort === "price-asc") list.sort((a, b) => a.base_price_lakh - b.base_price_lakh || a.full_name.localeCompare(b.full_name));
    else list.sort((a, b) => a.set_order - b.set_order || b.base_price_lakh - a.base_price_lakh);
    return list;
  }, [players, query, role, nationality, team, base, group, sort]);

  return (
    <div className="stadium min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <p className="eyebrow">{season?.name ?? "Player catalogue"}</p>
        <h1 className="display mt-1 text-5xl">Players</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">
          Every player available to auction this season, grouped into sets the way a real auction list is. Teams shown are
          current squads and change when retention lists are updated.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" aria-label="Search players" className="col-span-2 lg:col-span-1" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            <option value="">All roles</option>
            {Object.entries(ROLE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </Select>
          <Select value={nationality} onChange={(e) => setNationality(e.target.value)} aria-label="Nationality">
            <option value="">All nationalities</option>
            <option value="indian">Indian</option>
            <option value="overseas">Overseas</option>
            {countries.filter((c) => c !== "India").map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
            <option value="">All teams</option>
            {FRANCHISES.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
          <Select value={base} onChange={(e) => setBase(e.target.value)} aria-label="Base price">
            <option value="">Any base price</option>
            {bases.map((b) => <option key={b} value={b}>{formatMoney(b)}</option>)}
          </Select>
          <Select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Auction category">
            <option value="">All categories</option>
            {SET_GROUPS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="set">Sort: auction order</option>
            <option value="name">Sort: name</option>
            <option value="price-desc">Sort: price high to low</option>
            <option value="price-asc">Sort: price low to high</option>
          </Select>
        </div>

        <p className="mt-4 text-xs text-dim">{loading ? "Loading players" : `${visible.length} of ${players.filter((p) => p.is_active).length} players`}</p>

        {loading ? (
          <div className="grid place-items-center py-20"><Spinner className="size-8 text-gold" /></div>
        ) : visible.length === 0 ? (
          <div className="mt-4"><EmptyState title="No players match those filters" /></div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((player) => (
              <button key={player.id} onClick={() => setOpen(player)} className="panel flex items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:border-line-strong">
                <PlayerPortrait name={player.full_name} photoUrl={player.photo_url} teamId={player.franchise_id} size={56} className="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{player.full_name}</p>
                  <p className="truncate text-xs text-mute">{ROLE_LABEL[player.role]} · {player.country}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="display tabular text-lg leading-none text-gold">{formatMoney(player.base_price_lakh)}</span>
                    {player.is_marquee && <Badge tone="gold">Marquee</Badge>}
                    {player.is_retained && <Badge tone="go">Retained</Badge>}
                  </div>
                </div>
                <FranchiseLogo id={player.franchise_id} size={30} />
              </button>
            ))}
          </div>
        )}
      </main>

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title="Player profile">
        {open && (
          <div>
            <div className="flex items-center gap-4">
              <PlayerPortrait name={open.full_name} photoUrl={open.photo_url} teamId={open.franchise_id} size={96} />
              <div className="min-w-0">
                <p className="display text-3xl">{open.full_name}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="gold">{ROLE_LABEL[open.role]}</Badge>
                  <Badge>{open.country}</Badge>
                  <Badge tone={open.is_overseas ? "warn" : "neutral"}>{open.is_overseas ? "Overseas" : "Indian"}</Badge>
                  <Badge>{open.is_capped ? "Capped" : "Uncapped"}</Badge>
                </div>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
              {([
                ["Base price", formatMoney(open.base_price_lakh)],
                ["Auction set", setLabel(open.auction_set)],
                ["Current team", open.franchise_id ?? "None"],
                ["Status", open.is_retained ? "Retained" : open.is_available ? "Available" : "Not in auction"],
                ["Batting", open.batting_style ?? "Not recorded"],
                ["Bowling", open.bowling_style ?? "Not recorded"],
                ...Object.entries(open.stats ?? {}).map(([k, v]) => [k, String(v)] as [string, string]),
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-black/25 px-3 py-2">
                  <dt className="eyebrow text-[10px]">{label}</dt>
                  <dd className="mt-0.5 font-semibold capitalize">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}
