import OpenAI from "openai";
import type { LlmProvider, LlmGenerateOptions, LlmStructuredOptions, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { ProviderError } from "@/server/providers/types";
import { parseStructured, STRUCTURED_SYSTEM_SUFFIX, zodToJsonSchema } from "@/server/providers/llm/structured";

/**
 * One adapter for every OpenAI-compatible chat completions API: OpenAI,
 * DeepSeek and OpenRouter differ only in base URL, models and headers.
 */
interface Creds {
  apiKey: string;
}
interface Config {
  model?: string;
  baseUrl?: string;
}

interface Preset {
  id: string;
  displayName: string;
  description: string;
  baseUrl: string;
  docsUrl: string;
  envKey: string;
  models: { id: string; label: string }[];
  supportsJsonSchema: boolean;
  extraHeaders?: Record<string, string>;
}

const PRESETS: Preset[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    description: "GPT models via the OpenAI API.",
    baseUrl: "https://api.openai.com/v1",
    docsUrl: "https://platform.openai.com/docs",
    envKey: "OPENAI_API_KEY",
    models: [
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5-mini", label: "GPT-5 mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    ],
    supportsJsonSchema: true,
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    description: "DeepSeek chat and reasoning models.",
    baseUrl: "https://api.deepseek.com",
    docsUrl: "https://api-docs.deepseek.com",
    envKey: "DEEPSEEK_API_KEY",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
    supportsJsonSchema: false,
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    description: "Route to hundreds of models through one key.",
    baseUrl: "https://openrouter.ai/api/v1",
    docsUrl: "https://openrouter.ai/docs",
    envKey: "OPENROUTER_API_KEY",
    models: [
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (via OpenRouter)" },
      { id: "openai/gpt-4.1", label: "GPT-4.1 (via OpenRouter)" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (via OpenRouter)" },
      { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3 (via OpenRouter)" },
    ],
    supportsJsonSchema: false,
    extraHeaders: { "HTTP-Referer": "https://arevei.com", "X-Title": "AREVEI GTM" },
  },
];

function mapError(id: string, err: unknown): ProviderError {
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    const code = status === 401 || status === 403 ? "auth" : status === 429 ? "rate_limited" : status === 402 ? "quota" : status >= 500 ? "unavailable" : "invalid_request";
    return new ProviderError(id, code, err.message, { status });
  }
  return new ProviderError(id, "unavailable", (err as Error).message);
}

function createCompatible(preset: Preset, creds: Creds, config: Config, usage: UsageSink): LlmProvider {
  const client = new OpenAI({ apiKey: creds.apiKey, baseURL: config.baseUrl || preset.baseUrl, maxRetries: 1, defaultHeaders: preset.extraHeaders });
  const defaultModel = config.model || preset.models[0].id;

  async function complete(options: LlmGenerateOptions, responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"]) {
    const model = options.model || defaultModel;
    try {
      const res = await client.chat.completions.create({
        model,
        messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.3,
        max_completion_tokens: options.maxTokens ?? 2048,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      });
      const inputTokens = res.usage?.prompt_tokens ?? 0;
      const outputTokens = res.usage?.completion_tokens ?? 0;
      usage({ operation: options.purpose ? `llm.${options.purpose}` : "llm.generate", units: inputTokens + outputTokens, unitLabel: "tokens", metadata: { model, inputTokens, outputTokens } });
      const choice = res.choices[0];
      return { text: choice?.message?.content ?? "", model: res.model ?? model, usage: { inputTokens, outputTokens }, stopReason: choice?.finish_reason ?? undefined };
    } catch (err) {
      throw mapError(preset.id, err);
    }
  }

  return {
    id: preset.id,
    category: "llm",
    defaultModel,
    async listModels() {
      return preset.models;
    },
    async testConnection() {
      const started = Date.now();
      try {
        await client.chat.completions.create({ model: defaultModel, messages: [{ role: "user", content: "ping" }], max_completion_tokens: 5 });
        return { ok: true, message: `Connected (${defaultModel})`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: mapError(preset.id, err).message, latencyMs: Date.now() - started };
      }
    },
    generateText: (options) => complete(options),
    async generateStructured<T>(options: LlmStructuredOptions<T>) {
      const messages = withSuffix(options.messages);
      const format = preset.supportsJsonSchema
        ? ({ type: "json_schema", json_schema: { name: options.schemaName ?? "result", schema: zodToJsonSchema(options.schema), strict: false } } as const)
        : ({ type: "json_object" } as const);
      const out = await complete({ ...options, messages }, format);
      const data = parseStructured(preset.id, options.schema, out.text);
      return { data, raw: out.text, model: out.model, usage: out.usage };
    },
  };
}

function withSuffix(messages: LlmGenerateOptions["messages"]) {
  const hasSystem = messages.some((m) => m.role === "system");
  return hasSystem
    ? messages.map((m) => (m.role === "system" ? { ...m, content: m.content + STRUCTURED_SYSTEM_SUFFIX } : m))
    : [{ role: "system" as const, content: STRUCTURED_SYSTEM_SUFFIX.trim() }, ...messages];
}

export const openAiCompatibleDescriptors: ProviderDescriptor<Creds, Config>[] = PRESETS.map((preset) => ({
  id: preset.id,
  category: "llm",
  displayName: preset.displayName,
  description: preset.description,
  docsUrl: preset.docsUrl,
  capabilities: ["llm.generate", "llm.structured"],
  credentialFields: [{ key: "apiKey", label: "API key", type: "secret", required: true }],
  configFields: [
    { key: "model", label: "Default model", type: "text", default: preset.models[0].id, help: `Known: ${preset.models.map((m) => m.id).join(", ")}. Any model id the provider accepts works.` },
    { key: "baseUrl", label: "Base URL (advanced)", type: "text", default: preset.baseUrl, help: "Override for proxies or self-hosted compatible endpoints." },
  ],
  systemEnvKeys: [preset.envKey],
  credentialsFromEnv: (env) => (env[preset.envKey] ? { apiKey: env[preset.envKey] as string } : null),
  create: ({ credentials, config, usage }) => createCompatible(preset, credentials, config, usage),
}));
