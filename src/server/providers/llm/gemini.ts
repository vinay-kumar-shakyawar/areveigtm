import type { LlmProvider, LlmGenerateOptions, LlmStructuredOptions, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";
import { parseStructured, STRUCTURED_SYSTEM_SUFFIX, zodToJsonSchema } from "@/server/providers/llm/structured";

const MODELS = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

interface Creds {
  apiKey: string;
}
interface Config {
  model?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function createGemini(creds: Creds, config: Config, usage: UsageSink): LlmProvider {
  const defaultModel = config.model || MODELS[0].id;

  async function call(options: LlmGenerateOptions, responseSchema?: Record<string, unknown>) {
    const model = options.model || defaultModel;
    const system = options.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const { data } = await providerFetch<GeminiResponse>("gemini", `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": creds.apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 2048,
          ...(responseSchema ? { responseMimeType: "application/json", responseSchema } : {}),
        },
      }),
    });
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    usage({ operation: options.purpose ? `llm.${options.purpose}` : "llm.generate", units: inputTokens + outputTokens, unitLabel: "tokens", metadata: { model, inputTokens, outputTokens } });
    return { text, model, usage: { inputTokens, outputTokens }, stopReason: data.candidates?.[0]?.finishReason };
  }

  return {
    id: "gemini",
    category: "llm",
    defaultModel,
    async listModels() {
      return MODELS;
    },
    async testConnection() {
      const started = Date.now();
      try {
        await call({ messages: [{ role: "user", content: "ping" }], maxTokens: 5 });
        return { ok: true, message: `Connected (${defaultModel})`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    generateText: (options) => call(options),
    async generateStructured<T>(options: LlmStructuredOptions<T>) {
      const messages = options.messages.some((m) => m.role === "system")
        ? options.messages.map((m) => (m.role === "system" ? { ...m, content: m.content + STRUCTURED_SYSTEM_SUFFIX } : m))
        : [{ role: "system" as const, content: STRUCTURED_SYSTEM_SUFFIX.trim() }, ...options.messages];
      const schema = stripUnsupported(zodToJsonSchema(options.schema));
      const out = await call({ ...options, messages }, schema);
      return { data: parseStructured("gemini", options.schema, out.text), raw: out.text, model: out.model, usage: out.usage };
    },
  };
}

/** Gemini's responseSchema is an OpenAPI subset: drop keys it rejects. */
function stripUnsupported(schema: Record<string, unknown>): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (["additionalProperties", "$schema", "default", "examples", "title", "const", "pattern"].includes(k)) continue;
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(schema) as Record<string, unknown>;
}

export const geminiDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "gemini",
  category: "llm",
  displayName: "Google Gemini",
  description: "Gemini models via the Generative Language API.",
  docsUrl: "https://ai.google.dev/gemini-api/docs",
  capabilities: ["llm.generate", "llm.structured"],
  credentialFields: [{ key: "apiKey", label: "API key", type: "secret", required: true }],
  configFields: [{ key: "model", label: "Default model", type: "text", default: MODELS[0].id, help: `Known: ${MODELS.map((m) => m.id).join(", ")}. Any model id the provider accepts works.` }],
  systemEnvKeys: ["GEMINI_API_KEY"],
  credentialsFromEnv: (env) => (env.GEMINI_API_KEY ? { apiKey: env.GEMINI_API_KEY } : null),
  create: ({ credentials, config, usage }) => createGemini(credentials, config, usage),
};
