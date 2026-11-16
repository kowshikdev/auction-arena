import { callRpc, fail } from "@/lib/api/server";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return fail("INVALID_REQUEST", "Room code is required.");
  return callRpc("room_preview", { p_code: code });
}
