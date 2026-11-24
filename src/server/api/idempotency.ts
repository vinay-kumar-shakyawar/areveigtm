import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import type { Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";

export const requestIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/, "requestId must be 8–120 chars of letters, digits, . _ : -");

function bodyHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

/**
 * Replay-safe writes. Same requestId + same body returns the stored result;
 * same requestId + different body is a conflict and changes nothing.
 */
export async function withIdempotency<T extends object>(
  ctx: Ctx,
  scope: string,
  requestId: string | undefined,
  body: unknown,
  run: () => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  if (!requestId) return { result: await run(), replayed: false };
  const hash = bodyHash(body);
  const existing = await prisma.idempotencyKey.findUnique({
    where: { workspaceId_scope_requestId: { workspaceId: ctx.workspaceId, scope, requestId } },
  });
  if (existing) {
    if (existing.bodyHash !== hash) {
      throw new ApiError("idempotency_conflict", "This requestId was already used with a different body", {
        details: { requestId },
      });
    }
    return { result: existing.response as T, replayed: true };
  }
  const result = await run();
  await prisma.idempotencyKey.create({
    data: {
      workspaceId: ctx.workspaceId,
      scope,
      requestId,
      bodyHash: hash,
      responseCode: 200,
      response: JSON.parse(JSON.stringify(result)),
    },
  });
  return { result, replayed: false };
}
