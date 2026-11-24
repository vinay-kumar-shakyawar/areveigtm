import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit } from "@/server/modules/audit/service";
import { aiStructured, companyContext, GROUNDING_RULES } from "@/server/ai";
import { icpCriteriaV1, icpExtractionSchema, type IcpCriteriaV1, type IcpExtraction, type IcpInput, SENIORITIES, FUNCTIONS } from "@/server/modules/icp/schemas";

const PROMPT_VERSION = "icp-extract-v1";

export async function listIcps(ctx: Ctx) {
  requirePermission(ctx, "icp.manage");
  return prisma.icpProfile.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ isDefault: "desc" }, { status: "asc" }, { updatedAt: "desc" }],
    include: { _count: { select: { leads: true, searches: true, campaigns: true } } },
  });
}

export async function getIcp(ctx: Ctx, id: string) {
  requirePermission(ctx, "icp.manage");
  const icp = await prisma.icpProfile.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!icp) throw ApiError.notFound("ICP");
  return icp;
}

export async function createIcp(ctx: Ctx, input: IcpInput) {
  requirePermission(ctx, "icp.manage");
  const criteria = icpCriteriaV1.parse(input.criteria);
  const icp = await prisma.$transaction(async (tx) => {
    const count = await tx.icpProfile.count({ where: { workspaceId: ctx.workspaceId } });
    if (input.isDefault) await tx.icpProfile.updateMany({ where: { workspaceId: ctx.workspaceId }, data: { isDefault: false } });
    return tx.icpProfile.create({
      data: {
        workspaceId: ctx.workspaceId,
        name: input.name,
        description: input.description ?? null,
        criteria: criteria as Prisma.InputJsonValue,
        status: input.status ?? "draft",
        isDefault: input.isDefault ?? count === 0,
      },
    });
  });
  await audit(ctx, "icp.created", { type: "icp", id: icp.id }, { name: icp.name });
  return icp;
}

export async function updateIcp(ctx: Ctx, id: string, input: Partial<IcpInput>, expectedRevision?: number) {
  const existing = await getIcp(ctx, id);
  if (expectedRevision !== undefined && expectedRevision !== existing.revision) {
    throw new ApiError("revision_conflict", "This ICP changed since you loaded it. Reload and try again.", { details: { currentRevision: existing.revision } });
  }
  const criteria = input.criteria ? icpCriteriaV1.parse(input.criteria) : undefined;
  const icp = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.icpProfile.updateMany({ where: { workspaceId: ctx.workspaceId }, data: { isDefault: false } });
    return tx.icpProfile.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        criteria: criteria as Prisma.InputJsonValue | undefined,
        status: input.status,
        isDefault: input.isDefault,
        revision: { increment: 1 },
      },
    });
  });
  await audit(ctx, "icp.updated", { type: "icp", id }, { fields: Object.keys(input), revision: icp.revision });
  return icp;
}

export async function duplicateIcp(ctx: Ctx, id: string) {
  const existing = await getIcp(ctx, id);
  const copy = await prisma.icpProfile.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: `${existing.name} (copy)`,
      description: existing.description,
      criteria: existing.criteria as Prisma.InputJsonValue,
      status: "draft",
      isDefault: false,
      aiRationale: existing.aiRationale as Prisma.InputJsonValue | undefined,
    },
  });
  await audit(ctx, "icp.duplicated", { type: "icp", id: copy.id }, { from: id });
  return copy;
}

export async function setIcpStatus(ctx: Ctx, id: string, status: "draft" | "active" | "archived") {
  await getIcp(ctx, id);
  const icp = await prisma.icpProfile.update({ where: { id }, data: { status, ...(status === "archived" ? { isDefault: false } : {}) } });
  await audit(ctx, "icp.status_changed", { type: "icp", id }, { status });
  return icp;
}

export async function deleteIcp(ctx: Ctx, id: string) {
  await getIcp(ctx, id);
  const inUse = await prisma.campaign.count({ where: { icpProfileId: id, status: { in: ["active", "paused"] } } });
  if (inUse > 0) throw ApiError.conflict("This ICP is used by a running campaign. Archive it instead.");
  await prisma.icpProfile.delete({ where: { id } });
  await audit(ctx, "icp.deleted", { type: "icp", id });
}

/**
 * Plain language → structured criteria. Uses the approved company profile as
 * context so the model resolves "our customers" style references.
 */
export async function extractIcpFromDescription(ctx: Ctx, description: string, existing?: IcpCriteriaV1): Promise<IcpExtraction & { meta: { provider: string; model: string; promptVersion: string } }> {
  requirePermission(ctx, "icp.manage");
  const context = await companyContext(ctx.workspaceId);
  const { data, meta } = await aiStructured<IcpExtraction>(ctx.workspaceId, {
    schema: icpExtractionSchema,
    schemaName: "icp_extraction",
    purpose: "icp.extract",
    promptVersion: PROMPT_VERSION,
    maxTokens: 3000,
    messages: [
      {
        role: "system",
        content: `You convert a sales team's plain-language description of their ideal customer into structured targeting criteria.
${GROUNDING_RULES}
- seniorities must use only: ${SENIORITIES.join(", ")}.
- functions must use only: ${FUNCTIONS.join(", ")}.
- countries: ISO 3166-1 alpha-2 codes for every geography you can map (UAE → AE, UK → GB). Leave geographies as the human-readable list.
- titles: concrete job-title phrases a data provider can match (e.g. "Head of Marketing", "VP Growth"), not categories.
- Put constraints you cannot express in a field into companyCharacteristics, exclusions or buyingSignals.
- Do not add criteria that were not asked for or implied by the company profile; prefer fewer, precise constraints.`,
      },
      {
        role: "user",
        content: `Company profile:\n${context}\n\n${existing ? `Current criteria (refine these, keep what still applies):\n${JSON.stringify(existing)}\n\n` : ""}Description of the ideal customer:\n"""\n${description.trim()}\n"""`,
      },
    ],
  });
  return { ...data, criteria: icpCriteriaV1.parse(data.criteria), meta: { provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion } };
}

/** Human-readable summary used in tables and prompts. */
export function summarizeCriteria(c: IcpCriteriaV1): string {
  const parts: string[] = [];
  if (c.titles.length) parts.push(c.titles.slice(0, 4).join(" / ") + (c.titles.length > 4 ? "…" : ""));
  if (c.seniorities.length) parts.push(c.seniorities.join(", "));
  if (c.industries.length) parts.push(c.industries.slice(0, 3).join(", "));
  if (c.geographies.length) parts.push(c.geographies.slice(0, 3).join(", "));
  if (c.companySize.min || c.companySize.max) parts.push(`${c.companySize.min ?? "any"}–${c.companySize.max ?? "any"} employees`);
  return parts.join(" · ") || "No constraints yet";
}
