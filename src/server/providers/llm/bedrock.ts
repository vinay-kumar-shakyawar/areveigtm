import type { LlmProvider, LlmGenerateOptions, LlmStructuredOptions, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { ProviderError } from "@/server/providers/types";
import { parseStructured, STRUCTURED_SYSTEM_SUFFIX, zodToJsonSchema } from "@/server/providers/llm/structured";

const MODELS = [
  { id: "anthropic.claude-sonnet-4-5", label: "Claude Sonnet 4.5 (Bedrock)" },
  { id: "anthropic.claude-haiku-4-5", label: "Claude Haiku 4.5 (Bedrock)" },
  { id: "amazon.nova-pro-v1:0", label: "Amazon Nova Pro" },
];

interface Creds {
  accessKeyId: string;
  secretAccessKey: string;
}
interface Config {
  model?: string;
  region?: string;
}

function createBedrock(creds: Creds, config: Config, usage: UsageSink): LlmProvider {
  const defaultModel = config.model || MODELS[0].id;
  const region = config.region || "us-east-1";

  async function converse(options: LlmGenerateOptions, tool?: { name: string; description: string; schema: Record<string, unknown> }) {
    const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = new BedrockRuntimeClient({ region, credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey } });
    const model = options.model || defaultModel;
    const system = options.messages.filter((m) => m.role === "system").map((m) => ({ text: m.content }));
    const messages = options.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: [{ text: m.content }] }));
    try {
      const res = await client.send(
        new ConverseCommand({
          modelId: model,
          system: system.length ? system : undefined,
          messages,
          inferenceConfig: { temperature: options.temperature ?? 0.3, maxTokens: options.maxTokens ?? 2048 },
          ...(tool
            ? { toolConfig: { tools: [{ toolSpec: { name: tool.name, description: tool.description, inputSchema: { json: tool.schema as never } } }], toolChoice: { tool: { name: tool.name } } } }
            : {}),
        }),
      );
      const inputTokens = res.usage?.inputTokens ?? 0;
      const outputTokens = res.usage?.outputTokens ?? 0;
      usage({ operation: options.purpose ? `llm.${options.purpose}` : "llm.generate", units: inputTokens + outputTokens, unitLabel: "tokens", metadata: { model, inputTokens, outputTokens } });
      const content = res.output?.message?.content ?? [];
      const toolUse = content.find((c) => c.toolUse)?.toolUse;
      const text = content.map((c) => c.text ?? "").join("");
      return { text, toolInput: toolUse?.input, model, usage: { inputTokens, outputTokens }, stopReason: res.stopReason };
    } catch (err) {
      const name = (err as { name?: string }).name ?? "";
      const code = /AccessDenied|UnrecognizedClient|InvalidSignature/.test(name) ? "auth" : /Throttling/.test(name) ? "rate_limited" : "unavailable";
      throw new ProviderError("bedrock", code, (err as Error).message);
    }
  }

  return {
    id: "bedrock",
    category: "llm",
    defaultModel,
    async listModels() {
      return MODELS;
    },
    async testConnection() {
      const started = Date.now();
      try {
        await converse({ messages: [{ role: "user", content: "ping" }], maxTokens: 5 });
        return { ok: true, message: `Connected (${defaultModel}, ${region})`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async generateText(options) {
      const out = await converse(options);
      return { text: out.text, model: out.model, usage: out.usage, stopReason: out.stopReason };
    },
    async generateStructured<T>(options: LlmStructuredOptions<T>) {
      const messages = options.messages.some((m) => m.role === "system")
        ? options.messages.map((m) => (m.role === "system" ? { ...m, content: m.content + STRUCTURED_SYSTEM_SUFFIX } : m))
        : [{ role: "system" as const, content: STRUCTURED_SYSTEM_SUFFIX.trim() }, ...options.messages];
      const out = await converse({ ...options, messages }, { name: options.schemaName ?? "emit_result", description: options.schemaDescription ?? "Return the structured result", schema: zodToJsonSchema(options.schema) });
      const raw = out.toolInput ? JSON.stringify(out.toolInput) : out.text;
      return { data: parseStructured("bedrock", options.schema, raw), raw, model: out.model, usage: out.usage };
    },
  };
}

export const bedrockDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "bedrock",
  category: "llm",
  displayName: "AWS Bedrock",
  description: "Claude, Nova and other models through Amazon Bedrock.",
  docsUrl: "https://docs.aws.amazon.com/bedrock/",
  capabilities: ["llm.generate", "llm.structured"],
  credentialFields: [
    { key: "accessKeyId", label: "AWS access key ID", type: "text", required: true },
    { key: "secretAccessKey", label: "AWS secret access key", type: "secret", required: true },
  ],
  configFields: [
    { key: "model", label: "Default model", type: "text", default: MODELS[0].id, help: `Known: ${MODELS.map((m) => m.id).join(", ")}. Any model id the provider accepts works.` },
    { key: "region", label: "Region", type: "text", default: "us-east-1" },
  ],
  systemEnvKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  credentialsFromEnv: (env) => (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY } : null),
  create: ({ credentials, config, usage }) => createBedrock(credentials, config, usage),
};
