import { rpcRoute } from "@/lib/api/server";
import { roomOnly } from "@/lib/validations";

export const POST = rpcRoute(roomOnly, "heartbeat", (b) => ({ p_room_id: b.room_id }));
