import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";

export const POST = rpcRoute(z.object({ id: z.number().int().positive() }), "admin_resolve_report", (b) => ({
  p_report_id: b.id,
}));
