import { rpcRoute } from "@/lib/api/server";
import { roomOnly } from "@/lib/validations";

// Asks the server to check its own clock. The countdown shown in a browser carries no authority.
export const POST = rpcRoute(roomOnly, "tick", (b) => ({ p_room_id: b.room_id }));
