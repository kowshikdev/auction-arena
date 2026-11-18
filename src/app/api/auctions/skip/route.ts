import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { uuid } from "@/lib/validations";

export const POST = rpcRoute(
  z.object({ room_id: uuid, sell: z.boolean().optional() }),
  "host_skip_lot",
  (b) => ({ p_room_id: b.room_id, p_sell: b.sell ?? false }),
);
