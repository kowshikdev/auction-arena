import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { franchiseId } from "@/lib/validations";

export const POST = rpcRoute(
  z.object({
    franchise_id: franchiseId.nullable().optional(),
    ai_count: z.number().int().min(3).max(9),
    difficulty: z.enum(["easy", "normal", "hard"]),
    timer_sec: z.number().int().min(5).max(60),
    pool_limit: z.number().int().min(20).max(1000).nullable().optional(),
  }),
  "create_solo_room",
  (b) => ({
    p_franchise: b.franchise_id ?? null,
    p_ai_count: b.ai_count,
    p_difficulty: b.difficulty,
    p_timer_sec: b.timer_sec,
    p_pool_limit: b.pool_limit ?? null,
  }),
);
