import { rpcRoute } from "@/lib/api/server";
import { roomOnly } from "@/lib/validations";

export const POST = rpcRoute(roomOnly, "start_auction", (b) => ({ p_room_id: b.room_id }));
