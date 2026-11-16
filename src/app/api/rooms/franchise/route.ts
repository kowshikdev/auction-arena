import { z } from "zod";
import { rpcRoute } from "@/lib/api/server";
import { franchiseId, uuid } from "@/lib/validations";

export const POST = rpcRoute(
  z.object({ room_id: uuid, franchise_id: franchiseId.nullable() }),
  "select_franchise",
  (b) => ({ p_room_id: b.room_id, p_franchise_id: b.franchise_id }),
);
