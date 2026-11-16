import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { uuid } from "@/lib/validations";

export const POST = rpcRoute(z.object({ room_id: uuid, lot_id: uuid }), "pass_lot", (b) => ({
  p_room_id: b.room_id,
  p_lot_id: b.lot_id,
}));
