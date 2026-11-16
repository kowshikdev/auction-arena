import { callRpc } from "@/lib/api/server";

export async function GET() {
  return callRpc("admin_overview");
}
