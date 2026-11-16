import { NextResponse } from "next/server";
import { fail } from "@/lib/api/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { Player } from "@/types";

// The active season's catalogue. Optional filters: q, role, team, overseas, set.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const supabase = await supabaseServer();

  const seasonId = params.get("season");
  const season = seasonId
    ? await supabase.from("seasons").select("id, name, year, default_rules").eq("id", seasonId).maybeSingle()
    : await supabase.from("seasons").select("id, name, year, default_rules").eq("is_active", true).maybeSingle();
  if (season.error || !season.data) return fail("NO_SEASON", "No active season has been configured yet.", 404);

  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, players!inner(*)")
    .eq("season_id", season.data.id)
    .order("set_order")
    .limit(2000);
  if (error) return fail("SERVER_ERROR", "Could not load players.", 500);

  let players: Player[] = (data ?? []).map((row) => {
    const { players: player, player_id, ...seasonFields } = row as Record<string, unknown> & {
      players: Record<string, unknown>;
      player_id: string;
    };
    return { ...player, ...seasonFields, id: player_id } as unknown as Player;
  });

  const q = params.get("q")?.trim().toLowerCase();
  const role = params.get("role");
  const team = params.get("team");
  const overseas = params.get("overseas");
  const set = params.get("set");
  if (q) players = players.filter((p) => p.full_name.toLowerCase().includes(q));
  if (role) players = players.filter((p) => p.role === role);
  if (team) players = players.filter((p) => p.franchise_id === team);
  if (overseas) players = players.filter((p) => p.is_overseas === (overseas === "true"));
  if (set) players = players.filter((p) => p.auction_set === set);
  if (params.get("all") !== "true") players = players.filter((p) => p.is_active);

  return NextResponse.json({ ok: true, season: season.data, players });
}
