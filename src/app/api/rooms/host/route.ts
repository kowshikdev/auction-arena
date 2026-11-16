import { z } from "zod";
import { callRpc, fail } from "@/lib/api/server";
import { uuid } from "@/lib/validations";

const schema = z.object({ room_id: uuid, user_id: uuid.optional() });

// With user_id: the host hands over. Without: a member claims host after the host went silent.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_REQUEST", "Invalid request.");
  const { room_id, user_id } = parsed.data;
  return user_id
    ? callRpc("transfer_host", { p_room_id: room_id, p_user_id: user_id })
    : callRpc("claim_host", { p_room_id: room_id });
}
