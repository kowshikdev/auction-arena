import { NextResponse } from "next/server";
import { fail } from "@/lib/api/server";
import { scoutPlayer, type ScoutResult } from "@/lib/ai/agents";
import { llmConfigured } from "@/lib/ai/llm";
import { openWebSearch, tavilyConfigured } from "@/lib/ai/tavily";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 300;

/** Admin only: refresh live scouting news for the strongest players in the pool. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("UNAUTHENTICATED", "Sign in to continue.");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (!me?.is_admin) return fail("NOT_ADMIN", "Admin access required.");
  if (!llmConfigured()) return fail("AI_NOT_CONFIGURED", "LLM_API_KEY is not set.", 503);

  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.max(1, Math.min(60, Math.round(body.limit ?? 30)));

  const season = await supabase.from("seasons").select("id").eq("is_active", true).maybeSingle();
  if (!season.data) return fail("NO_SEASON", "No active season.", 404);
  const [pool, ratings] = await Promise.all([
    supabase
      .from("player_seasons")
      .select("player_id, players!inner(full_name, role, country, is_active)")
      .eq("season_id", season.data.id)
      .eq("is_available", true)
      .eq("is_retained", false)
      .limit(1000),
    supabase.from("player_ratings").select("player_id, overall").limit(2000),
  ]);
  const overall = new Map((ratings.data ?? []).map((r) => [r.player_id as string, r.overall as number]));
  const players = (pool.data ?? [])
    .map((row) => {
      const p = row.players as unknown as { full_name: string; role: string; country: string; is_active: boolean };
      return { id: row.player_id as string, name: p.full_name, role: p.role, country: p.country, active: p.is_active };
    })
    .filter((p) => p.active)
    .sort((a, b) => (overall.get(b.id) ?? 0) - (overall.get(a.id) ?? 0))
    .slice(0, limit);

  const web = tavilyConfigured() ? await openWebSearch() : null;
  const results: ScoutResult[] = [];
  let searches = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let failures = 0;
  let model = "";
  try {
    let next = 0;
    const worker = async () => {
      while (next < players.length) {
        const player = players[next++];
        try {
          const out = await scoutPlayer(web, player);
          searches += out.toolCalls;
          promptTokens += out.promptTokens;
          completionTokens += out.completionTokens;
          model = out.model;
          if (out.result) results.push(out.result);
          else failures++;
        } catch {
          failures++;
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  } finally {
    await web?.close();
  }

  if (results.length) {
    const saved = await supabase.rpc("admin_save_player_news", { p_rows: results });
    if (saved.error) return fail("SERVER_ERROR", "Could not save scouting news.", 500);
  }
  await supabase.rpc("log_ai_usage", {
    p_kind: "scout",
    p_model: model,
    p_prompt: promptTokens,
    p_completion: completionTokens,
    p_searches: searches,
    p_ok: failures === 0,
  });
  return NextResponse.json({ ok: true, scouted: results.length, failed: failures, searches, search_mode: web ? "tavily" : "none" });
}
