import { callRpc, fail } from "@/lib/api/server";

// The authoritative snapshot. Clients call this on load, reconnect and sequence gaps.
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return fail("INVALID_REQUEST", "Room code is required.");
  return callRpc("get_room_state", { p_code: code });
}
