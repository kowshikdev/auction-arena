import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { uuid } from "@/lib/validations";

export const POST = rpcRoute(
  z.object({ message: z.string().trim().min(3).max(1000), room_id: uuid.optional() }),
  "submit_report",
  (b) => ({ p_message: b.message, p_room_id: b.room_id ?? null }),
);
