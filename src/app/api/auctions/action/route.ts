import { rpcRoute } from "@/lib/api/server";
import { auctioneerAction } from "@/lib/validations";

// Less common auctioneer controls: skip, countdown, undo last bid, end auction.
export const POST = rpcRoute(auctioneerAction, "auctioneer_action", (b) => ({
  p_room_id: b.room_id,
  p_action: b.action,
  p_arg: b.seconds ? { seconds: b.seconds } : {},
}));
