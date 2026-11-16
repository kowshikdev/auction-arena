import { callRpc } from "@/lib/api/server";

export async function POST() {
  return callRpc("claim_admin");
}
