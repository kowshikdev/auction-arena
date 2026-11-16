import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";

export const POST = rpcRoute(
  z.object({ display_name: z.string().trim().min(2).max(32), avatar_url: z.string().trim().max(400).optional() }),
  "update_profile",
  (b) => ({ p_display_name: b.display_name, p_avatar_url: b.avatar_url || null }),
);
