import { rpcRoute } from "@/lib/api/server";
import { placeBid } from "@/lib/validations";

export const POST = rpcRoute(placeBid, "place_bid", (b) => ({
  p_room_id: b.room_id,
  p_lot_id: b.lot_id,
  p_amount_lakh: b.amount_lakh,
  p_idempotency_key: b.idempotency_key,
}));
