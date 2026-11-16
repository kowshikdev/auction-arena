import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { settingsPatch } from "@/lib/validations";

// Create or update a season and its default auction rules. Admin only.
export const POST = rpcRoute(
  z.object({
    id: z.string().regex(/^[a-z0-9-]{3,40}$/),
    name: z.string().trim().min(2).max(60),
    year: z.number().int().min(2008).max(2100),
    default_rules: settingsPatch,
    activate: z.boolean().default(false),
  }),
  "admin_save_season",
  (b) => ({
    p_id: b.id,
    p_name: b.name,
    p_year: b.year,
    p_default_rules: b.default_rules,
    p_activate: b.activate,
  }),
);
