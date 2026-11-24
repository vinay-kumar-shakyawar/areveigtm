import "server-only";
import type { z } from "zod";
import { withFallback, type UsageContext } from "@/server/providers/registry";
import type { LlmMessage, LlmProvider } from "@/server/providers/types";
import { prisma } from "@/server/db/client";

/**
 * Thin AI facade used by modules. Every call goes through the workspace's
 * configured LLM providers with fallback, records usage, and returns which
 * provider/model answered so results can be stored with provenance.
 */
export interface AiMeta {
  provider: string;
  model: string;
  promptVersion: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function aiStructured<T>(
  workspaceId: string,
  input: { schema: z.ZodType<T>; messages: LlmMessage[]; purpose: string; promptVersion: string; schemaName?: string; maxTokens?: number; usage?: UsageContext },
): Promise<{ data: T; meta: AiMeta }> {
  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId }, select: { aiDefaultProvider: true, aiDefaultModel: true } });
  const { result, provider } = await withFallback<LlmProvider, { data: T; model: string; usage: { inputTokens: number; outputTokens: number } }>(
    workspaceId,
    "llm.structured",
    async (p) => {
      const r = await p.instance.generateStructured<T>({
        schema: input.schema,
        schemaName: input.schemaName,
        messages: input.messages,
        purpose: input.purpose,
        maxTokens: input.maxTokens,
        model: settings?.aiDefaultProvider === p.descriptor.id ? (settings.aiDefaultModel ?? undefined) : undefined,
      });
      return { data: r.data, model: r.model, usage: r.usage };
    },
    { preferProvider: settings?.aiDefaultProvider ?? undefined, usage: input.usage },
  );
  return { data: result.data, meta: { provider: provider.descriptor.id, model: result.model, promptVersion: input.promptVersion, usage: result.usage } };
}

export async function aiText(
  workspaceId: string,
  input: { messages: LlmMessage[]; purpose: string; promptVersion: string; maxTokens?: number; usage?: UsageContext },
): Promise<{ text: string; meta: AiMeta }> {
  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId }, select: { aiDefaultProvider: true, aiDefaultModel: true } });
  const { result, provider } = await withFallback<LlmProvider, { text: string; model: string; usage: { inputTokens: number; outputTokens: number } }>(
    workspaceId,
    "llm.generate",
    async (p) => {
      const r = await p.instance.generateText({
        messages: input.messages,
        purpose: input.purpose,
        maxTokens: input.maxTokens,
        model: settings?.aiDefaultProvider === p.descriptor.id ? (settings.aiDefaultModel ?? undefined) : undefined,
      });
      return { text: r.text, model: r.model, usage: r.usage };
    },
    { preferProvider: settings?.aiDefaultProvider ?? undefined, usage: input.usage },
  );
  return { text: result.text, meta: { provider: provider.descriptor.id, model: result.model, promptVersion: input.promptVersion, usage: result.usage } };
}

/** Grounding rules shared by every prompt. */
export const GROUNDING_RULES = `Rules:
- Use only the evidence provided. Never invent facts, numbers, names, events or quotes.
- When something is unknown, say so explicitly (null, empty list, or "unknown") instead of guessing.
- Keep claims traceable: cite the source URL or the evidence item you relied on where a field asks for it.
- Write in plain, specific language. No marketing clichés.`;

/** Renders the workspace's approved company knowledge base as prompt context. */
export async function companyContext(workspaceId: string): Promise<string> {
  const p = await prisma.companyProfile.findUnique({ where: { workspaceId } });
  if (!p) return "Company profile: not set.";
  const lines = [
    `Company: ${p.companyName ?? "unknown"}${p.website ? ` (${p.website})` : ""}`,
    p.description && `What it does: ${p.description}`,
    p.productOrService && `Product / service: ${p.productOrService}`,
    p.industry && `Industry: ${p.industry}`,
    p.businessModel && `Business model: ${p.businessModel}`,
    p.targetGeography.length && `Target geography: ${p.targetGeography.join(", ")}`,
    p.targetCustomerType && `Target customer type: ${p.targetCustomerType}`,
    p.valueProposition && `Value proposition: ${p.valueProposition}`,
    Array.isArray(p.competitors) && (p.competitors as { name: string }[]).length ? `Competitors: ${(p.competitors as { name: string }[]).map((c) => c.name).join(", ")}` : null,
    Array.isArray(p.existingCustomers) && (p.existingCustomers as { name: string }[]).length ? `Existing customers: ${(p.existingCustomers as { name: string }[]).map((c) => c.name).join(", ")}` : null,
    p.preferredChannels.length && `Preferred channels: ${p.preferredChannels.join(", ")}`,
    p.salesObjective && `Sales objective: ${p.salesObjective}`,
    `Profile status: ${p.approvedAt ? "approved by the team" : "draft, not yet approved"}`,
  ].filter(Boolean);
  return lines.join("\n");
}
