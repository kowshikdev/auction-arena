import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { uuid } from "@/lib/validations";

export const POST = rpcRoute(z.object({ room_id: uuid, ready: z.boolean() }), "set_ready", (b) => ({
  p_room_id: b.room_id,
  p_ready: b.ready,
}));
