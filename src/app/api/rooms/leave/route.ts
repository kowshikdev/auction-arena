import { rpcRoute } from "@/lib/api/server";
import { roomOnly } from "@/lib/validations";

export const POST = rpcRoute(roomOnly, "leave_room", (b) => ({ p_room_id: b.room_id }));
