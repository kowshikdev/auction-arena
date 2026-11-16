import { rpcRoute } from "@/lib/api/server";
import { joinRoom } from "@/lib/validations";

export const POST = rpcRoute(joinRoom, "join_room", (b) => ({
  p_code: b.code,
  p_password: b.password || null,
  p_invite_token: b.invite_token || null,
}));
