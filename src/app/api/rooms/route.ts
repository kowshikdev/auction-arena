import { callRpc, rpcRoute } from "@/lib/api/server";
import { createRoom } from "@/lib/validations";

// GET /api/rooms: public rooms for the browser. POST: create a room.
export async function GET() {
  return callRpc("list_public_rooms");
}

export const POST = rpcRoute(createRoom, "create_room", (b) => ({
  p_name: b.name,
  p_visibility: b.visibility,
  p_max_participants: b.max_participants,
  p_auctioneer_type: b.auctioneer_type,
  p_password: b.password || null,
  p_description: b.description || null,
  p_settings: b.settings ?? {},
}));
