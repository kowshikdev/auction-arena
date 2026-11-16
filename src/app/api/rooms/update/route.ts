import { rpcRoute } from "@/lib/api/server";
import { updateRoom } from "@/lib/validations";

export const POST = rpcRoute(updateRoom, "update_room", (b) => ({ p_room_id: b.room_id, p_patch: b.patch }));
