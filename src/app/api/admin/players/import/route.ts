import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { playerRow } from "@/lib/validations";

export const POST = rpcRoute(
  z.object({ season_id: z.string().min(3).max(40), rows: z.array(playerRow).min(1).max(2000) }),
  "admin_import_players",
  (b) => ({ p_season_id: b.season_id, p_rows: b.rows }),
);
