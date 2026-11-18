import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planStrategy } from "@/lib/ai/agents";
import { chat, parseJson, runAgent, type AgentTool } from "@/lib/ai/llm";

// A tiny OpenAI-compatible server so the client, the tool loop and the agents are tested offline.
let server: Server;
let requests: { body: any }[] = [];
let script: (body: any, attempt: number) => { status?: number; message?: any } = () => ({ message: { role: "assistant", content: "{}" } });
let attempts = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      requests.push({ body });
      const out = script(body, attempts++);
      res.statusCode = out.status ?? 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(out.status && out.status >= 400 ? { error: "x" } : { choices: [{ message: out.message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.LLM_MODEL = "openai/gpt-oss-120b";
  process.env.LLM_MODEL_FAST = "openai/gpt-oss-20b";
});
afterAll(() => server.close());

const reset = (fn: typeof script) => {
  requests = [];
  attempts = 0;
  script = fn;
};

describe("parseJson", () => {
  it("extracts JSON from fenced or chatty replies and rejects junk", () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('Sure! {"a": {"b": 2}} done')).toEqual({ a: { b: 2 } });
    expect(parseJson("no json here")).toBeNull();
    expect(parseJson('{"a":')).toBeNull();
  });
});

describe("chat", () => {
  it("sends the key, model and reasoning hint, and retries once on a rate limit", async () => {
    reset((_, attempt) => (attempt === 0 ? { status: 429 } : { message: { role: "assistant", content: "hi" } }));
    const reply = await chat({ messages: [{ role: "user", content: "hello" }] });
    expect(reply.message.content).toBe("hi");
    expect(requests).toHaveLength(2);
    expect(requests[0].body.model).toBe("openai/gpt-oss-120b");
    expect(requests[0].body.reasoning_effort).toBe("low");
  });

  it("fails clearly after repeated server errors", async () => {
    reset(() => ({ status: 500 }));
    await expect(chat({ messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/LLM request failed/);
  });
});

describe("runAgent", () => {
  it("runs a tool call, feeds the result back and returns the final answer", async () => {
    const searched: string[] = [];
    const tool: AgentTool = {
      def: { type: "function", function: { name: "web_search", description: "d", parameters: { type: "object", properties: {} } } },
      run: async (args) => {
        searched.push(String(args.query));
        return "Player is fit.";
      },
    };
    reset((body) =>
      body.messages.some((m: any) => m.role === "tool")
        ? { message: { role: "assistant", content: '{"summary":"fit"}' } }
        : { message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "web_search", arguments: '{"query":"x injury"}' } }] } },
    );
    const out = await runAgent({ system: "s", user: "u", tools: [tool], maxToolCalls: 2 });
    expect(searched).toEqual(["x injury"]);
    expect(out.toolCalls).toBe(1);
    expect(parseJson(out.text)).toEqual({ summary: "fit" });
    expect(out.usage.prompt_tokens).toBe(20);
  });

  it("never exceeds the tool-call budget even if the model keeps asking", async () => {
    let runs = 0;
    const tool: AgentTool = {
      def: { type: "function", function: { name: "web_search", description: "d", parameters: { type: "object", properties: {} } } },
      run: async () => {
        runs++;
        return "ok";
      },
    };
    reset((body) =>
      body.tools
        ? { message: { role: "assistant", content: null, tool_calls: [{ id: `c${attempts}`, type: "function", function: { name: "web_search", arguments: "{}" } }] } }
        : { message: { role: "assistant", content: "done" } },
    );
    const out = await runAgent({ system: "s", user: "u", tools: [tool], maxToolCalls: 2 });
    expect(runs).toBe(2);
    expect(out.text).toBe("done");
  });
});

describe("planStrategy", () => {
  const input = {
    franchise_id: "MI", persona: "star", purse_lakh: 5000, squad_count: 18, overseas_count: 6, slots_left: 7,
    roles: { BAT: 5 },
    candidates: [{ id: "p1", name: "A", role: "BAT", rating: 80, base_lakh: 200 }, { id: "p2", name: "B", role: "BWL", rating: 70, base_lakh: 100 }],
  };

  it("keeps only targets from the candidate list and trims long text", async () => {
    reset(() => ({ message: { role: "assistant", content: JSON.stringify({ strategy: "Buy pace. ".repeat(100), targets: ["p2", "ghost"], line: "We are ready." }) } }));
    const { output } = await planStrategy(input);
    expect(output?.targets).toEqual(["p2"]);
    expect(output!.strategy.length).toBeLessThanOrEqual(480);
    expect(output?.line).toBe("We are ready.");
    expect(requests[0].body.model).toBe("openai/gpt-oss-20b");
  });

  it("returns null output when the model answers with junk, so the rules still run the team", async () => {
    reset(() => ({ message: { role: "assistant", content: "I cannot help" } }));
    const { output } = await planStrategy(input);
    expect(output).toBeNull();
  });
});

// Real Groq + Tavily, one player. Run with: LIVE_AI=1 pnpm test tests/llm.test.ts
describe.skipIf(!process.env.LIVE_AI)("live smoke", () => {
  it("scouts one player through Groq and Tavily", async () => {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^(LLM_API_KEY|TAVILY_API_KEY)=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
    delete process.env.LLM_BASE_URL;
    const { openWebSearch } = await import("@/lib/ai/tavily");
    const { scoutPlayer } = await import("@/lib/ai/agents");
    const web = await openWebSearch();
    try {
      const out = await scoutPlayer(web, { id: "x", name: "Jasprit Bumrah", role: "BWL", country: "India" });
      expect(out.result).not.toBeNull();
      expect(out.result!.form_adjust).toBeGreaterThanOrEqual(-10);
      expect(out.result!.form_adjust).toBeLessThanOrEqual(10);
      console.log("live scout:", out.result, "tool calls", out.toolCalls);
    } finally {
      await web?.close();
    }
  }, 90_000);
});
