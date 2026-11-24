import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { LlmProvider, LlmGenerateOptions, LlmStructuredOptions, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { ProviderError } from "@/server/providers/types";
import { parseStructured } from "@/server/providers/llm/structured";

/**
 * Anthropic adapter. Current Claude 5 models run adaptive thinking by
 * default and reject sampling parameters and forced tool choice, so this
 * adapter never sends `temperature` and uses `output_config.format`
 * (structured outputs) instead of tool forcing for JSON results.
 */
const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (default)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
];

interface Creds {
  apiKey: string;
}
interface Config {
  model?: string;
  effort?: "low" | "medium" | "high";
}

function mapError(err: unknown): ProviderError {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("anthropic", "auth", err.message, { status: err.status });
  }
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("anthropic", "rate_limited", err.message, { status: 429 });
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    return new ProviderError("anthropic", "invalid_request", err.message, { status: err.status });
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    return new ProviderError("anthropic", status >= 500 || status === 0 ? "unavailable" : "invalid_request", err.message, { status });
  }
  return new ProviderError("anthropic", "unavailable", (err as Error).message);
}

function split(messages: LlmGenerateOptions["messages"]) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest: Anthropic.MessageParam[] = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return { system: system || undefined, messages: rest };
}

function createAnthropic(creds: Creds, config: Config, usage: UsageSink): LlmProvider {
  const client = new Anthropic({ apiKey: creds.apiKey, maxRetries: 1 });
  const defaultModel = config.model || MODELS[0].id;
  const effort = config.effort ?? "medium";

  function record(options: LlmGenerateOptions, model: string, u: Anthropic.Usage) {
    usage({
      operation: options.purpose ? `llm.${options.purpose}` : "llm.generate",
      units: u.input_tokens + u.output_tokens,
      unitLabel: "tokens",
      metadata: { model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0 },
    });
  }

  function assertNotRefused(res: { stop_reason: string | null; stop_details?: { category?: string | null; explanation?: string | null } | null }) {
    if (res.stop_reason === "refusal") {
      throw new ProviderError("anthropic", "invalid_request", `The model declined this request${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}.`, {
        details: res.stop_details ?? undefined,
      });
    }
  }

  return {
    id: "anthropic",
    category: "llm",
    defaultModel,
    async listModels() {
      return MODELS;
    },
    async testConnection() {
      const started = Date.now();
      try {
        await client.messages.create({ model: defaultModel, max_tokens: 16, messages: [{ role: "user", content: "Reply with OK." }] });
        return { ok: true, message: `Connected (${defaultModel})`, latencyMs: Date.now() - started };
      } catch (err) {
        const e = mapError(err);
        return { ok: false, message: e.message, latencyMs: Date.now() - started };
      }
    },
    async generateText(options) {
      const model = options.model || defaultModel;
      const { system, messages } = split(options.messages);
      try {
        const res = await client.messages.create({
          model,
          max_tokens: options.maxTokens ?? 8192,
          system,
          messages,
          output_config: { effort },
        });
        record(options, model, res.usage);
        assertNotRefused(res);
        const text = res.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("");
        return { text, model: res.model, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }, stopReason: res.stop_reason ?? undefined };
      } catch (err) {
        throw mapError(err);
      }
    },
    async generateStructured<T>(options: LlmStructuredOptions<T>) {
      const model = options.model || defaultModel;
      const { system, messages } = split(options.messages);
      try {
        const res = await client.messages.parse({
          model,
          max_tokens: options.maxTokens ?? 8192,
          system,
          messages,
          output_config: { effort, format: zodOutputFormat(options.schema) },
        });
        record(options, model, res.usage);
        assertNotRefused(res);
        const raw = res.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("");
        // parsed_output is validated by the SDK; re-validate through our own parser for a uniform error.
        const data = res.parsed_output ?? parseStructured("anthropic", options.schema, raw);
        return { data: data as T, raw, model: res.model, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
      } catch (err) {
        throw mapError(err);
      }
    },
  };
}

export const anthropicDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "anthropic",
  category: "llm",
  displayName: "Anthropic Claude",
  description: "Claude models via the Anthropic API. Structured outputs are native.",
  docsUrl: "https://platform.claude.com/docs",
  capabilities: ["llm.generate", "llm.structured"],
  credentialFields: [{ key: "apiKey", label: "API key", type: "secret", required: true, placeholder: "sk-ant-…" }],
  configFields: [
    { key: "model", label: "Default model", type: "text", default: MODELS[0].id, help: `Known: ${MODELS.map((m) => m.id).join(", ")}. Any current model id works.` },
    {
      key: "effort",
      label: "Effort",
      type: "select",
      default: "medium",
      options: [
        { value: "low", label: "Low (fast, cheap)" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High (thorough)" },
      ],
    },
  ],
  systemEnvKeys: ["ANTHROPIC_API_KEY"],
  credentialsFromEnv: (env) => (env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY } : null),
  create: ({ credentials, config, usage }) => createAnthropic(credentials, config, usage),
};
