import { rpcRoute } from "@/lib/api/server";
import { roomOnly } from "@/lib/validations";

export const POST = rpcRoute(roomOnly, "auctioneer_action", (b) => ({
  p_room_id: b.room_id,
  p_action: "present_next",
}));
