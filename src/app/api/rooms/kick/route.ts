import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { uuid } from "@/lib/validations";

export const POST = rpcRoute(z.object({ room_id: uuid, user_id: uuid }), "kick_member", (b) => ({
  p_room_id: b.room_id,
  p_user_id: b.user_id,
}));
