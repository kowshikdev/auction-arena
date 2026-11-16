import type { ApiResult } from "@/types";

/** POSTs JSON to one of our Route Handlers. Never throws: network failures become an error result. */
export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    return (await response.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "NETWORK", message: "Network problem. Check your connection." } };
  }
}
