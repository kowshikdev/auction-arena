import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import { fail, failFromRpc } from "@/lib/api/server";
import { supabaseServer } from "@/lib/supabase/server";
import { roomCode } from "@/lib/validations";
import type { RoomSnapshot } from "@/types";

// Issues a voice token only to members of the room. Voice runs on LiveKit, entirely
// separate from the bidding channel: no audio ever touches the database or auction events.
export async function POST(request: Request) {
  const parsed = z.object({ code: roomCode }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_REQUEST", "Room code is required.");

  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return fail("VOICE_DISABLED", "Voice chat is not configured on this server.", 503);
  }

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("UNAUTHENTICATED", "Sign in to continue.");
  const userId = auth.user.id;

  // get_room_state raises NOT_MEMBER for outsiders, so it doubles as the authorisation check.
  const { data, error } = await supabase.rpc("get_room_state", { p_code: parsed.data.code });
  if (error) return failFromRpc(error);
  const snapshot = data as RoomSnapshot;
  const me = snapshot.members.find((member) => member.user_id === userId);

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
    name: me?.display_name ?? "Participant",
    metadata: JSON.stringify({
      franchise_id: snapshot.me.franchise_id,
      is_auctioneer: snapshot.me.is_auctioneer,
    }),
    ttl: "4h",
  });
  token.addGrant({
    room: "auction-" + snapshot.room.id,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });
  return NextResponse.json({ ok: true, url: LIVEKIT_URL, token: await token.toJwt() });
}
