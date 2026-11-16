import { callRpc } from "@/lib/api/server";

export async function GET() {
  return callRpc("my_auctions");
}
