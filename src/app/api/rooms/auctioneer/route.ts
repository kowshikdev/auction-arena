import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { uuid } from "@/lib/validations";

export const POST = rpcRoute(
  z.object({ room_id: uuid, type: z.enum(["system", "human"]), user_id: uuid.nullable().optional() }),
  "set_auctioneer",
  (b) => ({ p_room_id: b.room_id, p_type: b.type, p_user_id: b.user_id ?? null }),
);
