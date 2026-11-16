import { z } from "zod";
import { callRpc, fail, rpcRoute } from "@/lib/api/server";
import { uuid } from "@/lib/validations";

const patch = z
  .object({
    full_name: z.string().trim().min(2).max(80),
    country: z.string().trim().min(2).max(40),
    role: z.enum(["BAT", "BWL", "AR", "WK"]),
    is_capped: z.boolean(),
    batting_style: z.string().max(40).nullable(),
    bowling_style: z.string().max(40).nullable(),
    photo_url: z.string().max(400).nullable(),
    stats: z.record(z.string(), z.union([z.string(), z.number()])),
    is_active: z.boolean(),
    base_price_lakh: z.number().int().min(1).max(5000),
    is_marquee: z.boolean(),
    franchise_id: z.string().max(5).nullable(),
    is_retained: z.boolean(),
    retention_price_lakh: z.number().int().min(0).max(5000).nullable(),
    is_available: z.boolean(),
  })
  .partial();

// Edit one player (team, retention, price, role, availability). Admin only, checked in the database.
export const POST = rpcRoute(
  z.object({ season_id: z.string().min(3).max(40), player_id: uuid, patch }),
  "admin_update_player",
  (b) => ({ p_season_id: b.season_id, p_player_id: b.player_id, p_patch: b.patch }),
);

export async function DELETE(request: Request) {
  const id = uuid.safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return fail("INVALID_REQUEST", "Player id is required.");
  return callRpc("admin_delete_player", { p_player_id: id.data });
}
