import { createClient } from "@supabase/supabase-js";
import type { FranchiseId, PlayerRole } from "@/types";

export type FeaturedPlayer = {
  id: string;
  name: string;
  role: PlayerRole;
  country: string;
  base_lakh: number;
  team: FranchiseId | null;
  retained: boolean;
  stats: Record<string, number | string>;
};

export type FeaturedTeam = { franchise_id: FranchiseId; purse_lakh: number; slots: number };

export type Featured = { season: string; players: FeaturedPlayer[]; teams: FeaturedTeam[] };

const WINDOW_MS = 10 * 60 * 1000;

/** Stable pseudo-random order, so every visitor in the same window sees the same lineup. */
function hash(text: string): number {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Picks `count` items for the current 10-minute window, rotating through the whole list over time. */
export function pickForWindow<T extends { id: string }>(items: T[], count: number, now = Date.now()): T[] {
  if (items.length <= count) return items;
  const ordered = [...items].sort((a, b) => hash(a.id) - hash(b.id));
  const start = (Math.floor(now / WINDOW_MS) * count) % ordered.length;
  return Array.from({ length: count }, (_, i) => ordered[(start + i) % ordered.length]);
}

/**
 * Headline auction players and real purses for the landing page hero, read with the public key.
 * Returns null when the database is unreachable so the page can still render.
 */
export async function loadFeatured(): Promise<Featured | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: season } = await supabase.from("seasons").select("id, name").eq("is_active", true).maybeSingle();
    if (!season) return null;

    const [players, teams] = await Promise.all([
      supabase
        .from("player_seasons")
        .select("player_id, base_price_lakh, franchise_id, is_retained, players!inner(full_name, role, country, stats, is_active)")
        .eq("season_id", season.id)
        .eq("is_available", true)
        // Headline names going under the hammer: marquee or top-base-price players, never retained ones.
        .eq("is_retained", false)
        .or("is_marquee.eq.true,base_price_lakh.gte.200")
        .limit(400),
      supabase.from("season_franchises").select("franchise_id, purse_lakh, slots").eq("season_id", season.id),
    ]);

    const pool: FeaturedPlayer[] = (players.data ?? [])
      .map((row) => {
        const p = row.players as unknown as { full_name: string; role: PlayerRole; country: string; stats: Record<string, number | string>; is_active: boolean };
        return {
          id: row.player_id as string,
          name: p.full_name,
          role: p.role,
          country: p.country,
          base_lakh: row.base_price_lakh as number,
          team: (row.franchise_id as FranchiseId | null) ?? null,
          retained: Boolean(row.is_retained),
          stats: p.stats ?? {},
          active: p.is_active,
        };
      })
      .filter((p) => p.active)
      .map(({ id, name, role, country, base_lakh, team, retained, stats }) => ({ id, name, role, country, base_lakh, team, retained, stats }));

    return {
      season: season.name as string,
      players: pickForWindow(pool, 6),
      // All ten, biggest purse first; the card cycles through them four at a time.
      teams: ((teams.data ?? []) as FeaturedTeam[]).sort((a, b) => b.purse_lakh - a.purse_lakh),
    };
  } catch {
    return null;
  }
}
