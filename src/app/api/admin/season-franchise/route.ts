import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { franchiseId } from "@/lib/validations";

// A franchise's purse and open slots ahead of the season's auction. Admin only.
export const POST = rpcRoute(
  z.object({
    season_id: z.string().min(3).max(40),
    franchise_id: franchiseId,
    purse_lakh: z.number().int().min(0).max(50000),
    slots: z.number().int().min(0).max(30),
    overseas_slots: z.number().int().min(0).max(30),
  }),
  "admin_save_season_franchise",
  (b) => ({
    p_season_id: b.season_id,
    p_franchise_id: b.franchise_id,
    p_purse_lakh: b.purse_lakh,
    p_slots: b.slots,
    p_overseas_slots: b.overseas_slots,
  }),
);
