import "server-only";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { sha256 } from "@/server/auth/tokens";
import { audit } from "@/server/modules/audit/service";
import { ApiError } from "@/server/api/errors";

export const createApiKeyInput = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(["read", "write", "admin"])).min(1).default(["read", "write"]),
});

export async function listApiKeys(ctx: Ctx) {
  requirePermission(ctx, "api_keys.manage");
  return prisma.apiKey.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keyPrefix: true, scopes: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  });
}

/** Returns the raw key exactly once. */
export async function createApiKey(ctx: Ctx, input: z.infer<typeof createApiKeyInput>) {
  requirePermission(ctx, "api_keys.manage");
  const raw = `agk_${randomBytes(24).toString("base64url")}`;
  const key = await prisma.apiKey.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: input.name,
      scopes: input.scopes,
      keyPrefix: raw.slice(0, 10),
      keyHash: sha256(raw),
      createdByUserId: ctx.userId!,
    },
  });
  await audit(ctx, "api_key.created", { type: "api_key", id: key.id }, { name: input.name, scopes: input.scopes });
  return { id: key.id, raw };
}

export async function revokeApiKey(ctx: Ctx, id: string) {
  requirePermission(ctx, "api_keys.manage");
  const res = await prisma.apiKey.updateMany({ where: { id, workspaceId: ctx.workspaceId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw ApiError.notFound("api key");
  await audit(ctx, "api_key.revoked", { type: "api_key", id });
}
