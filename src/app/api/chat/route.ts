import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { uuid } from "@/lib/validations";

export const POST = rpcRoute(z.object({ room_id: uuid, body: z.string().trim().min(1).max(300) }), "send_chat", (b) => ({
  p_room_id: b.room_id,
  p_body: b.body,
}));
