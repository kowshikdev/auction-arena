import { NextResponse } from "next/server";
import type { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

// Every endpoint answers { ok: true, ... } or { ok: false, error: { code, message } }.

const STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401,
  NOT_MEMBER: 403,
  NOT_HOST: 403,
  NOT_ADMIN: 403,
  NOT_ALLOWED: 403,
  NOT_AUCTIONEER: 403,
  NOT_OWNER: 403,
  WRONG_PASSWORD: 403,
  PASSWORD_REQUIRED: 403,
  ROOM_NOT_FOUND: 404,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INVALID_REQUEST: 400,
};

export function fail(code: string, message: string, status?: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status: status ?? STATUS[code] ?? 409 });
}

type RpcError = { code?: string; message: string; details?: string | null };

/** Database functions raise P0001 with message = machine code, details = human text. */
export function failFromRpc(error: RpcError) {
  if (error.code === "P0001") {
    return fail(error.message, error.details || "The request was rejected.");
  }
  console.error("database error", error);
  return fail("SERVER_ERROR", "Something went wrong. Please try again.", 500);
}

type Supabase = Awaited<ReturnType<typeof supabaseServer>>;

/**
 * Builds a POST handler: parse JSON, validate with Zod, check the session, call one RPC.
 * `args` maps the validated body to the function's parameters.
 */
export function rpcRoute<S extends z.ZodType>(
  schema: S,
  fn: string,
  args: (body: z.infer<S>) => Record<string, unknown>,
) {
  return async function POST(request: Request) {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return fail("INVALID_REQUEST", "Request body must be JSON.");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return fail("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.");
    }
    return callRpc(fn, args(parsed.data));
  };
}

export async function callRpc(fn: string, args: Record<string, unknown> = {}, supabase?: Supabase) {
  const client = supabase ?? (await supabaseServer());
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return fail("UNAUTHENTICATED", "Sign in to continue.");

  const { data, error } = await client.rpc(fn, args);
  if (error) return failFromRpc(error);
  // Functions return either an object that already has ok:true, or a bare array/value.
  if (data && typeof data === "object" && !Array.isArray(data) && "ok" in data) {
    return NextResponse.json(data);
  }
  return NextResponse.json({ ok: true, data });
}
