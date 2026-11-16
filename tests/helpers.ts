import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Integration tests run against the real Supabase project named in .env.local,
// because the behaviour under test (row locks, constraints, clocks) lives in Postgres.
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const env = loadEnv();
const PASSWORD = "auctionarena-test-pw";

export type TestUser = { client: SupabaseClient; id: string; name: string };

/** Signs in (creating on first use) a fixed test account, so runs do not pile up users. */
export async function testUser(n: number): Promise<TestUser> {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `owner${n}@auctionarena.test`;
  const name = `Test Owner ${n}`;
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  let user = signIn.data.user;
  if (signIn.error) {
    const signUp = await client.auth.signUp({
      email,
      password: PASSWORD,
      options: { data: { display_name: name } },
    });
    if (signUp.error) throw new Error(`test user ${n}: ${signUp.error.message}`);
    user = signUp.data.user;
  }
  if (!user) throw new Error(`test user ${n}: no user returned`);
  return { client, id: user.id, name };
}

type RpcResult = Record<string, any>;

/** Calls an RPC and returns its JSON, throwing the server's error code on failure. */
export async function rpc(user: TestUser, fn: string, args: Record<string, unknown> = {}): Promise<RpcResult> {
  const { data, error } = await user.client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as RpcResult;
}

/** Calls an RPC expected to fail and returns the error code (or "OK" if it succeeded). */
export async function rpcCode(user: TestUser, fn: string, args: Record<string, unknown> = {}): Promise<string> {
  const { error } = await user.client.rpc(fn, args);
  return error ? error.message : "OK";
}

export const FRANCHISES = ["CSK", "MI", "RCB", "KKR", "SRH", "RR", "DC", "PBKS", "GT", "LSG"];

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const key = () => `test-${crypto.randomUUID()}`;

/** Creates a room, seats `owners` with distinct franchises, readies everyone. */
export async function seatedRoom(
  owners: TestUser[],
  options: { auctioneer?: "system" | "human"; settings?: Record<string, unknown> } = {},
) {
  const [host, ...rest] = owners;
  const created = await rpc(host, "create_room", {
    p_name: "Engine test",
    p_visibility: "private",
    p_max_participants: 10,
    p_auctioneer_type: options.auctioneer ?? "human",
    p_settings: { pool_limit: 20, ...options.settings },
  });
  const roomId = created.room_id as string;
  const code = created.code as string;
  for (const user of rest) await rpc(user, "join_room", { p_code: code });
  for (const [i, user] of owners.entries()) {
    await rpc(user, "select_franchise", { p_room_id: roomId, p_franchise_id: FRANCHISES[i] });
    await rpc(user, "set_ready", { p_room_id: roomId, p_ready: true });
  }
  return { roomId, code };
}

/** Leaves or force-ends a room so test data does not linger as an open room. */
export async function cleanup(host: TestUser, roomId: string) {
  await host.client.rpc("auctioneer_action", { p_room_id: roomId, p_action: "end_auction" });
}
