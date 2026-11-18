// Live web search for the AI scouts. Talks to Tavily's remote MCP server and falls back to the
// plain Tavily REST API if MCP is unavailable. Server-only.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AgentTool } from "./llm";

const MCP_URL = "https://mcp.tavily.com/mcp/";
const REST_URL = "https://api.tavily.com/search";

export const tavilyConfigured = () => Boolean(process.env.TAVILY_API_KEY);

export type WebSearch = {
  search: (query: string) => Promise<string>;
  urls: string[];
  close: () => Promise<void>;
};

async function viaRest(query: string, key: string): Promise<{ text: string; urls: string[] }> {
  const response = await fetch(REST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 4, search_depth: "basic", topic: "news", days: 30 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}`);
  const data = (await response.json()) as { results?: { title: string; url: string; content: string }[] };
  const results = data.results ?? [];
  return {
    text: results.map((r) => `${r.title}\n${r.url}\n${r.content}`).join("\n---\n") || "No results.",
    urls: results.map((r) => r.url),
  };
}

/** Opens one search session (MCP when possible) that can be reused for many queries. */
export async function openWebSearch(): Promise<WebSearch | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const urls: string[] = [];
  let client: Client | null = null;
  try {
    client = new Client({ name: "auctionarena-scout", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }),
    );
  } catch {
    client = null;
  }

  return {
    urls,
    async search(query) {
      if (client) {
        try {
          const result = await client.callTool({
            name: "tavily_search",
            arguments: { query, max_results: 4, search_depth: "basic", topic: "news", time_range: "month" },
          });
          const content = (result.content as { type: string; text?: string }[] | undefined) ?? [];
          const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
          if (text && !result.isError) {
            for (const match of text.matchAll(/https?:\/\/[^\s)"]+/g)) urls.push(match[0]);
            return text;
          }
        } catch {
          // fall through to REST
        }
      }
      const rest = await viaRest(query, key);
      urls.push(...rest.urls);
      return rest.text;
    },
    async close() {
      try {
        await client?.close();
      } catch {
        // ignore
      }
    },
  };
}

/** The search tool the scouting agent can call. */
export function searchTool(web: WebSearch): AgentTool {
  return {
    def: {
      type: "function",
      function: {
        name: "web_search",
        description: "Search recent news about cricketers: injuries, availability, current form.",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Search query, e.g. 'Player Name injury news'" } },
          required: ["query"],
        },
      },
    },
    run: async (args) => web.search(String(args.query ?? "").slice(0, 200)),
  };
}
