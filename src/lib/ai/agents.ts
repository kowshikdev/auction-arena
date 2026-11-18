// The two LLM jobs: scouting news per player, and a strategy per AI franchise.
// Both are advisory. Bids themselves are always decided by rules inside Postgres.
import { llmConfig, parseJson, runAgent } from "./llm";
import { openWebSearch, searchTool } from "./tavily";

export type ScoutResult = {
  player_id: string;
  summary: string;
  form_adjust: number;
  available: boolean;
  sources: string[];
};

const SCOUT_SYSTEM = `You are an IPL scout. Use web_search at most twice to find the latest news (last month) about the player: injury, availability for the IPL, current form.
Then answer with ONLY a JSON object: {"summary": string (max 200 chars, factual), "form_adjust": integer from -10 to 10 (positive for good recent form, negative for poor form or fitness doubts), "available": boolean (false only if clearly ruled out of the tournament)}.
If you find nothing relevant, use form_adjust 0 and available true.`;

export async function scoutPlayer(
  web: Awaited<ReturnType<typeof openWebSearch>>,
  player: { id: string; name: string; role: string; country: string },
): Promise<{ result: ScoutResult | null; toolCalls: number; promptTokens: number; completionTokens: number; model: string }> {
  const before = web?.urls.length ?? 0;
  const run = await runAgent({
    system: SCOUT_SYSTEM,
    user: `Player: ${player.name} (${player.role}, ${player.country}). Date: ${new Date().toISOString().slice(0, 10)}.`,
    tools: web ? [searchTool(web)] : [],
    maxToolCalls: 2,
    model: llmConfig().fastModel,
    maxTokens: 500,
  });
  const parsed = parseJson<{ summary?: string; form_adjust?: number; available?: boolean }>(run.text);
  const base = { toolCalls: run.toolCalls, promptTokens: run.usage.prompt_tokens, completionTokens: run.usage.completion_tokens, model: run.model };
  if (!parsed) return { result: null, ...base };
  return {
    result: {
      player_id: player.id,
      summary: String(parsed.summary ?? "").slice(0, 300),
      form_adjust: Math.max(-10, Math.min(10, Math.round(Number(parsed.form_adjust) || 0))),
      available: parsed.available !== false,
      sources: (web?.urls.slice(before, before + 3) ?? []).slice(0, 3),
    },
    ...base,
  };
}

export type StrategyInput = {
  franchise_id: string;
  persona: string;
  purse_lakh: number;
  squad_count: number;
  overseas_count: number;
  slots_left: number;
  roles: Record<string, number>;
  candidates: { id: string; name: string; role: string; rating: number; base_lakh: number; note?: string }[];
};

export type StrategyOutput = { franchise_id: string; strategy: string; targets: string[]; line: string };

export async function planStrategy(input: StrategyInput): Promise<{ output: StrategyOutput | null; promptTokens: number; completionTokens: number; model: string }> {
  const run = await runAgent({
    system: `You advise an AI IPL franchise owner before a mock auction. Pick the 3 to 6 players worth chasing from the candidate list only.
Answer with ONLY JSON: {"strategy": string (2 short sentences on what the team needs and how to spend), "targets": [candidate ids], "line": string (one confident first-person sentence the owner says to the room, max 140 chars)}.`,
    user: JSON.stringify(input),
    model: llmConfig().fastModel,
    maxTokens: 500,
  });
  const base = { promptTokens: run.usage.prompt_tokens, completionTokens: run.usage.completion_tokens, model: run.model };
  const parsed = parseJson<{ strategy?: string; targets?: string[]; line?: string }>(run.text);
  if (!parsed?.strategy) return { output: null, ...base };
  const allowed = new Set(input.candidates.map((c) => c.id));
  return {
    output: {
      franchise_id: input.franchise_id,
      strategy: String(parsed.strategy).slice(0, 480),
      targets: (parsed.targets ?? []).filter((id) => allowed.has(id)).slice(0, 6),
      line: String(parsed.line ?? "").slice(0, 200),
    },
    ...base,
  };
}
