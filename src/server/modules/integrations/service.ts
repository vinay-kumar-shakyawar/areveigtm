import "server-only";
import { z } from "zod";
import { Prisma, type IntegrationCategory } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit } from "@/server/modules/audit/service";
import { fingerprintOf, sealJson, sealedToDb } from "@/server/vault";
import { getDescriptor, listDescriptors, resolveProviders } from "@/server/providers/registry";
import type { ProviderCategory } from "@/server/providers/types";

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  llm: "AI models",
  people_data: "Lead data and enrichment",
  company_data: "Company research and web",
  signals: "Buying signals",
  email: "Email sending",
  mailbox: "Mailboxes",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
};

export function catalog() {
  return listDescriptors().map((d) => ({
    id: d.id,
    category: d.category,
    displayName: d.displayName,
    description: d.description,
    docsUrl: d.docsUrl,
    capabilities: d.capabilities,
    credentialFields: d.credentialFields,
    configFields: d.configFields,
    systemEnvKeys: d.systemEnvKeys ?? [],
  }));
}

/** Public, secret-free view of a workspace integration. */
function publicView(i: Prisma.IntegrationGetPayload<{ include: { credential: true } }>) {
  return {
    id: i.id,
    category: i.category,
    provider: i.provider,
    label: i.label,
    enabled: i.enabled,
    isDefault: i.isDefault,
    priority: i.priority,
    config: i.config,
    healthStatus: i.healthStatus,
    lastHealthCheckAt: i.lastHealthCheckAt,
    lastError: i.lastError,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    credential: i.credential
      ? { kind: i.credential.kind, fingerprint: i.credential.fingerprint, rotatedAt: i.credential.rotatedAt, revokedAt: i.credential.revokedAt, expiresAt: i.credential.expiresAt }
      : null,
  };
}

export type IntegrationView = ReturnType<typeof publicView>;

export async function listIntegrations(ctx: Ctx) {
  requirePermission(ctx, "integrations.read");
  const rows = await prisma.integration.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { credential: true },
    orderBy: [{ category: "asc" }, { isDefault: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(publicView);
}

export const upsertIntegrationInput = z.object({
  category: z.enum(["llm", "people_data", "company_data", "signals", "email", "mailbox", "linkedin", "x"]),
  provider: z.string().min(1).max(40),
  label: z.string().trim().max(60).optional().nullable(),
  credentials: z.record(z.string(), z.string()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
});

export async function createIntegration(ctx: Ctx, input: z.infer<typeof upsertIntegrationInput>) {
  requirePermission(ctx, "integrations.manage");
  const descriptor = getDescriptor(input.category, input.provider);
  const missing = descriptor.credentialFields.filter((f) => f.required !== false && !input.credentials?.[f.key]?.trim());
  if (missing.length) throw ApiError.invalid(`Missing ${missing.map((m) => m.label).join(", ")}`, { fields: missing.map((m) => m.key) });
  const config = validateConfig(descriptor.configFields, input.config ?? {});
  const label = input.label?.trim() || null;

  const created = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.integration.updateMany({ where: { workspaceId: ctx.workspaceId, category: input.category }, data: { isDefault: false } });
    }
    const count = await tx.integration.count({ where: { workspaceId: ctx.workspaceId, category: input.category } });
    const integration = await tx.integration.create({
      data: {
        workspaceId: ctx.workspaceId,
        category: input.category as IntegrationCategory,
        provider: input.provider,
        label,
        enabled: input.enabled ?? true,
        isDefault: input.isDefault ?? count === 0,
        priority: input.priority ?? 100,
        config: config as Prisma.InputJsonValue,
        createdByUserId: ctx.userId ?? undefined,
      },
    });
    if (descriptor.credentialFields.length > 0) {
      const creds = Object.fromEntries(descriptor.credentialFields.map((f) => [f.key, (input.credentials?.[f.key] ?? "").trim()]));
      const sealed = sealedToDb(sealJson(creds, `integration:${integration.id}`));
      const primary = descriptor.credentialFields.find((f) => f.type === "secret") ?? descriptor.credentialFields[0];
      await tx.integrationCredential.create({
        data: {
          integrationId: integration.id,
          kind: descriptor.credentialFields.some((f) => f.key === "clientSecret") ? "oauth" : descriptor.credentialFields.some((f) => f.key === "secretAccessKey") ? "aws" : "api_key",
          ...sealed,
          fingerprint: fingerprintOf(creds[primary.key] ?? ""),
        },
      });
    }
    return tx.integration.findUniqueOrThrow({ where: { id: integration.id }, include: { credential: true } });
  });
  await audit(ctx, "integration.created", { type: "integration", id: created.id }, { category: input.category, provider: input.provider });
  return publicView(created);
}

export const updateIntegrationInput = z.object({
  label: z.string().trim().max(60).optional().nullable(),
  credentials: z.record(z.string(), z.string()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
});

export async function updateIntegration(ctx: Ctx, id: string, input: z.infer<typeof updateIntegrationInput>) {
  requirePermission(ctx, "integrations.manage");
  const existing = await prisma.integration.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { credential: true } });
  if (!existing) throw ApiError.notFound("integration");
  const descriptor = getDescriptor(existing.category as ProviderCategory, existing.provider);
  const config = input.config ? validateConfig(descriptor.configFields, { ...(existing.config as object), ...input.config }) : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.integration.updateMany({ where: { workspaceId: ctx.workspaceId, category: existing.category }, data: { isDefault: false } });
    }
    if (input.credentials && descriptor.credentialFields.length > 0) {
      const missing = descriptor.credentialFields.filter((f) => f.required !== false && !input.credentials?.[f.key]?.trim());
      if (missing.length) throw ApiError.invalid(`Missing ${missing.map((m) => m.label).join(", ")}`);
      const creds = Object.fromEntries(descriptor.credentialFields.map((f) => [f.key, (input.credentials?.[f.key] ?? "").trim()]));
      const sealed = sealedToDb(sealJson(creds, `integration:${existing.id}`));
      const primary = descriptor.credentialFields.find((f) => f.type === "secret") ?? descriptor.credentialFields[0];
      await tx.integrationCredential.upsert({
        where: { integrationId: existing.id },
        update: { ...sealed, fingerprint: fingerprintOf(creds[primary.key] ?? ""), rotatedAt: new Date(), revokedAt: null },
        create: { integrationId: existing.id, kind: "api_key", ...sealed, fingerprint: fingerprintOf(creds[primary.key] ?? "") },
      });
    }
    return tx.integration.update({
      where: { id: existing.id },
      data: {
        label: input.label === undefined ? undefined : input.label?.trim() || null,
        enabled: input.enabled,
        isDefault: input.isDefault,
        priority: input.priority,
        config: config as Prisma.InputJsonValue | undefined,
        ...(input.credentials ? { healthStatus: "unknown", lastError: Prisma.DbNull } : {}),
      },
      include: { credential: true },
    });
  });
  await audit(ctx, "integration.updated", { type: "integration", id }, { fields: Object.keys(input).filter((k) => k !== "credentials"), credentialsRotated: Boolean(input.credentials) });
  return publicView(updated);
}

export async function deleteIntegration(ctx: Ctx, id: string) {
  requirePermission(ctx, "integrations.manage");
  const res = await prisma.integration.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
  if (res.count === 0) throw ApiError.notFound("integration");
  await audit(ctx, "integration.deleted", { type: "integration", id });
}

/** Runs the adapter's connection test and stores the health result. Never returns secrets. */
export async function testIntegration(ctx: Ctx, id: string) {
  requirePermission(ctx, "integrations.manage");
  const integration = await prisma.integration.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!integration) throw ApiError.notFound("integration");
  const descriptor = getDescriptor(integration.category as ProviderCategory, integration.provider);
  const capability = descriptor.capabilities[0];
  const providers = await resolveProviders(ctx.workspaceId, capability);
  const match = providers.find((p) => p.integrationId === id);
  if (!match) {
    const result = { ok: false, message: integration.enabled ? "Credentials are missing or revoked" : "Integration is disabled; enable it to test" };
    await prisma.integration.update({ where: { id }, data: { healthStatus: "failed", lastHealthCheckAt: new Date(), lastError: { message: result.message } } });
    return result;
  }
  const result = await match.instance.testConnection();
  await prisma.integration.update({
    where: { id },
    data: { healthStatus: result.ok ? "healthy" : "failed", lastHealthCheckAt: new Date(), lastError: result.ok ? Prisma.DbNull : { message: result.message } },
  });
  await audit(ctx, "integration.tested", { type: "integration", id }, { ok: result.ok });
  return result;
}

export async function usageSummary(ctx: Ctx, days = 30) {
  requirePermission(ctx, "integrations.read");
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await prisma.providerUsage.groupBy({
    by: ["provider", "operation", "status"],
    where: { workspaceId: ctx.workspaceId, occurredAt: { gte: since } },
    _sum: { units: true, estimatedCostCents: true },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ provider: r.provider, operation: r.operation, status: r.status, calls: r._count._all, units: r._sum.units ?? 0, estimatedCostCents: r._sum.estimatedCostCents ?? 0 }))
    .sort((a, b) => b.calls - a.calls);
}

function validateConfig(fields: { key: string; type: string; options?: { value: string }[]; default?: unknown }[], config: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = config[f.key];
    if (raw === undefined || raw === null || raw === "") {
      if (f.default !== undefined) out[f.key] = f.default;
      continue;
    }
    if (f.type === "number") {
      const n = Number(raw);
      if (Number.isNaN(n)) throw ApiError.invalid(`${f.key} must be a number`);
      out[f.key] = n;
    } else if (f.type === "boolean") {
      out[f.key] = raw === true || raw === "true" || raw === "on";
    } else if (f.type === "select") {
      if (f.options && !f.options.some((o) => o.value === raw)) throw ApiError.invalid(`${f.key} must be one of ${f.options.map((o) => o.value).join(", ")}`);
      out[f.key] = String(raw);
    } else {
      out[f.key] = String(raw).trim().slice(0, 500);
    }
  }
  return out;
}
