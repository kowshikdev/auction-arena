import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api/server";
import { planStrategy, type StrategyInput, type StrategyOutput } from "@/lib/ai/agents";
import { llmConfigured } from "@/lib/ai/llm";
import { supabaseServer } from "@/lib/supabase/server";
import { roomCode } from "@/lib/validations";

export const maxDuration = 60;

type TeamRow = { franchise_id: string; user_id: string; purse_remaining_lakh: number; squad_count: number; overseas_count: number; ai_strategy: string | null };
type MemberRow = { user_id: string; is_bot?: boolean; bot_persona?: string | null };
type LotRow = { player_id: string; status: string; base_price_lakh: number };
type SquadRow = { player_id: string; franchise_id: string };

/** Writes a short strategy for each AI franchise once an auction is live. Advisory only. */
export async function POST(request: Request) {
  const parsed = z.object({ code: roomCode }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_REQUEST", "Room code required.");
  if (!llmConfigured()) return NextResponse.json({ ok: true, planned: 0, reason: "not_configured" });

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("UNAUTHENTICATED", "Sign in to continue.");
  const state = await supabase.rpc("get_room_state", { p_code: parsed.data.code });
  if (state.error || !state.data?.ok) return fail("NOT_MEMBER", "You are not in this room.");
  const s = state.data as {
    room: { id: string };
    settings: { squad_max: number };
    members: MemberRow[];
    teams: TeamRow[];
    lots: LotRow[];
    squads: SquadRow[];
  };
  const bots = s.teams.filter((t) => !t.ai_strategy && s.members.find((m) => m.user_id === t.user_id)?.is_bot);
  if (!bots.length) return NextResponse.json({ ok: true, planned: 0 });

  const pending = s.lots.filter((l) => l.status === "pending");
  const ids = pending.map((l) => l.player_id).slice(0, 400);
  const [players, ratings, news] = await Promise.all([
    supabase.from("players").select("id, full_name, role").in("id", ids),
    supabase.from("player_ratings").select("player_id, overall").in("player_id", ids),
    supabase.from("player_news").select("player_id, summary, available").in("player_id", ids),
  ]);
  const name = new Map((players.data ?? []).map((p) => [p.id as string, p as { id: string; full_name: string; role: string }]));
  const rating = new Map((ratings.data ?? []).map((r) => [r.player_id as string, r.overall as number]));
  const note = new Map(
    (news.data ?? []).filter((n) => n.summary).map((n) => [n.player_id as string, n as { summary: string; available: boolean }]),
  );
  const base = new Map(pending.map((l) => [l.player_id, l.base_price_lakh]));
  const candidates = ids
    .filter((id) => name.has(id) && note.get(id)?.available !== false)
    .sort((a, b) => (rating.get(b) ?? 0) - (rating.get(a) ?? 0))
    .slice(0, 24)
    .map((id) => ({
      id,
      name: name.get(id)!.full_name,
      role: name.get(id)!.role,
      rating: rating.get(id) ?? 45,
      base_lakh: base.get(id) ?? 0,
      note: note.get(id)?.summary.slice(0, 100),
    }));

  const squadIds = s.squads.map((q) => q.player_id).slice(0, 500);
  const squadRoles = await supabase.from("players").select("id, role").in("id", squadIds);
  const roleOf = new Map((squadRoles.data ?? []).map((p) => [p.id as string, p.role as string]));

  const outputs: StrategyOutput[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let model = "";
  await Promise.all(
    bots.map(async (team) => {
      const roles: Record<string, number> = {};
      for (const q of s.squads.filter((x) => x.franchise_id === team.franchise_id)) {
        const r = roleOf.get(q.player_id) ?? "?";
        roles[r] = (roles[r] ?? 0) + 1;
      }
      const input: StrategyInput = {
        franchise_id: team.franchise_id,
        persona: s.members.find((m) => m.user_id === team.user_id)?.bot_persona ?? "balanced",
        purse_lakh: team.purse_remaining_lakh,
        squad_count: team.squad_count,
        overseas_count: team.overseas_count,
        slots_left: Math.max(0, s.settings.squad_max - team.squad_count),
        roles,
        candidates,
      };
      try {
        const out = await planStrategy(input);
        promptTokens += out.promptTokens;
        completionTokens += out.completionTokens;
        model = out.model;
        if (out.output) outputs.push(out.output);
      } catch {
        // The auction runs on rules alone if the model is unavailable.
      }
    }),
  );

  if (outputs.length) await supabase.rpc("save_ai_strategy", { p_room_id: s.room.id, p_items: outputs });
  await supabase.rpc("log_ai_usage", {
    p_kind: "strategy",
    p_model: model,
    p_prompt: promptTokens,
    p_completion: completionTokens,
    p_searches: 0,
    p_ok: outputs.length === bots.length,
  });
  return NextResponse.json({ ok: true, planned: outputs.length });
}
