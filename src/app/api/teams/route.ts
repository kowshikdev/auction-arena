import { NextResponse } from "next/server";
import { fail, failFromRpc } from "@/lib/api/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { RoomSnapshot } from "@/types";

// Purse and squad for every franchise in a room (optionally just one franchise).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (!code) return fail("INVALID_REQUEST", "Room code is required.");

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("get_room_state", { p_code: code });
  if (error) return failFromRpc(error);
  const snapshot = data as RoomSnapshot;

  const only = params.get("franchise");
  const teams = snapshot.teams
    .filter((team) => !only || team.franchise_id === only)
    .map((team) => ({
      ...team,
      squad: snapshot.squads.filter((entry) => entry.franchise_id === team.franchise_id),
    }));
  return NextResponse.json({ ok: true, teams });
}
