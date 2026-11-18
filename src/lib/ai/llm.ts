// Minimal client for any OpenAI-compatible chat completions API (Groq by default).
// Server-only: it reads secrets from the environment.

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type Usage = { prompt_tokens: number; completion_tokens: number };

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

export function llmConfig() {
  return {
    key: process.env.LLM_API_KEY ?? "",
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: process.env.LLM_MODEL || "openai/gpt-oss-120b",
    fastModel: process.env.LLM_MODEL_FAST || process.env.LLM_MODEL || "openai/gpt-oss-20b",
  };
}

export const llmConfigured = () => Boolean(llmConfig().key);

type ChatOptions = {
  messages: ChatMessage[];
  model?: string;
  tools?: ToolDef[];
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
};

/** One chat completion with a timeout and a single retry on rate limits or server errors. */
export async function chat(options: ChatOptions): Promise<{ message: ChatMessage; usage: Usage; model: string }> {
  const cfg = llmConfig();
  if (!cfg.key) throw new Error("LLM_API_KEY is not set");
  const model = options.model ?? cfg.model;
  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 900,
    temperature: 0.4,
  };
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = "auto";
  }
  if (options.json) body.response_format = { type: "json_object" };
  if (/gpt-oss/i.test(model)) body.reasoning_effort = "low";

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
    try {
      const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = `${response.status}`;
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      if (!response.ok) throw new Error(`LLM ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const data = (await response.json()) as {
        choices: { message: ChatMessage }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error("LLM returned no message");
      return {
        message,
        model,
        usage: { prompt_tokens: data.usage?.prompt_tokens ?? 0, completion_tokens: data.usage?.completion_tokens ?? 0 },
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 1) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`LLM request failed: ${lastError}`);
}

/** Pulls the first JSON object out of a model reply, tolerating code fences and chatter. */
export function parseJson<T>(text: string | null | undefined): T | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export type AgentTool = {
  def: ToolDef;
  run: (args: Record<string, unknown>) => Promise<string>;
};

/**
 * A bounded tool-calling loop: the model may call tools up to `maxToolCalls` times in total,
 * then must answer. Returns the final text and how many tool calls were used.
 */
export async function runAgent(options: {
  system: string;
  user: string;
  tools?: AgentTool[];
  maxToolCalls?: number;
  model?: string;
  maxTokens?: number;
}): Promise<{ text: string; toolCalls: number; usage: Usage; model: string }> {
  const messages: ChatMessage[] = [
    { role: "system", content: options.system },
    { role: "user", content: options.user },
  ];
  const limit = options.maxToolCalls ?? 0;
  let calls = 0;
  const usage: Usage = { prompt_tokens: 0, completion_tokens: 0 };
  let model = options.model ?? llmConfig().model;

  for (let round = 0; round < limit + 2; round++) {
    const canUseTools = Boolean(options.tools?.length) && calls < limit;
    const reply = await chat({
      messages,
      model: options.model,
      tools: canUseTools ? options.tools!.map((t) => t.def) : undefined,
      maxTokens: options.maxTokens,
    });
    model = reply.model;
    usage.prompt_tokens += reply.usage.prompt_tokens;
    usage.completion_tokens += reply.usage.completion_tokens;
    const wanted = reply.message.tool_calls ?? [];
    if (!wanted.length || !canUseTools) {
      return { text: reply.message.content ?? "", toolCalls: calls, usage, model };
    }
    messages.push({ role: "assistant", content: reply.message.content ?? null, tool_calls: wanted });
    for (const call of wanted) {
      let result = "Tool call limit reached.";
      if (calls < limit) {
        calls++;
        const tool = options.tools!.find((t) => t.def.function.name === call.function.name);
        try {
          result = tool ? await tool.run(JSON.parse(call.function.arguments || "{}")) : "Unknown tool.";
        } catch (error) {
          result = `Tool failed: ${error instanceof Error ? error.message : "error"}`;
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result.slice(0, 6000) });
    }
  }
  return { text: "", toolCalls: calls, usage, model };
}
