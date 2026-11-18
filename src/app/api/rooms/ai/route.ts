import { z } from "zod";
import { callRpc, fail } from "@/lib/api/server";
import { franchiseId, uuid } from "@/lib/validations";

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    room_id: uuid,
    franchise_id: franchiseId.optional(),
    persona: z.enum(["aggressive", "value", "star", "youth", "balanced"]).optional(),
  }),
  z.object({ action: z.literal("fill"), room_id: uuid }),
  z.object({
    action: z.literal("options"),
    room_id: uuid,
    difficulty: z.enum(["easy", "normal", "hard"]).optional(),
    autofill_sec: z.number().int().min(15).max(600).nullable().optional(),
  }),
]);

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail("INVALID_REQUEST", "Request body must be JSON.");
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return fail("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.");
  const b = parsed.data;
  if (b.action === "add") {
    return callRpc("add_ai_owner", { p_room_id: b.room_id, p_franchise: b.franchise_id ?? null, p_persona: b.persona ?? null });
  }
  if (b.action === "fill") return callRpc("fill_with_ai", { p_room_id: b.room_id });
  return callRpc("set_ai_options", {
    p_room_id: b.room_id,
    p_difficulty: b.difficulty ?? null,
    p_autofill_sec: b.autofill_sec ?? null,
    p_clear_autofill: b.autofill_sec === null,
  });
}

