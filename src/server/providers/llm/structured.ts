import { z } from "zod";
import { ProviderError } from "@/server/providers/types";

/**
 * Shared helpers for structured output: convert a Zod schema into a JSON
 * schema for tool calling, and parse/validate model output defensively.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Zod 4 ships a JSON schema exporter.
  const json = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

export function parseStructured<T>(provider: string, schema: z.ZodType<T>, raw: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new ProviderError(provider, "invalid_request", "The model did not return valid JSON", { details: raw.slice(0, 500) });
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ProviderError(provider, "invalid_request", "The model output did not match the expected schema", {
      details: { issues: result.error.issues.slice(0, 10), raw: raw.slice(0, 500) },
    });
  }
  return result.data;
}

export const STRUCTURED_SYSTEM_SUFFIX =
  "\n\nRespond with a single JSON object that matches the required schema exactly. Do not include commentary, markdown fences or extra keys. Never invent facts: when evidence is missing, use null or an empty list and say so in any 'notes' field.";
