import { prisma } from "@/server/db/client";
import { openJson, sealJson, sealedToDb, fingerprintOf } from "@/server/vault";
import { logger } from "@/server/logger";

/**
 * Server-only helpers for integration credentials. Used by OAuth providers to
 * persist refreshed tokens and by connect flows to store tokens after consent.
 * Secrets never leave this module unsealed except to the provider adapter.
 */
export async function readCredentials<T extends Record<string, string>>(integrationId: string): Promise<T | null> {
  const cred = await prisma.integrationCredential.findUnique({ where: { integrationId } });
  if (!cred || cred.revokedAt) return null;
  return openJson<T>({ ciphertext: Buffer.from(cred.ciphertext), iv: Buffer.from(cred.iv), authTag: Buffer.from(cred.authTag), keyVersion: cred.keyVersion }, `integration:${integrationId}`);
}

export async function writeCredentials(integrationId: string, creds: Record<string, string>, options?: { kind?: "api_key" | "oauth" | "basic" | "aws"; scopes?: string[]; expiresAt?: Date | null; fingerprintField?: string }) {
  const sealed = sealedToDb(sealJson(creds, `integration:${integrationId}`));
  const fp = fingerprintOf(creds[options?.fingerprintField ?? "accessToken"] ?? creds.apiKey ?? Object.values(creds)[0] ?? "");
  await prisma.integrationCredential.upsert({
    where: { integrationId },
    create: { integrationId, kind: options?.kind ?? "oauth", ...sealed, fingerprint: fp, scopes: options?.scopes ?? [], expiresAt: options?.expiresAt ?? undefined },
    update: { ...sealed, fingerprint: fp, rotatedAt: new Date(), revokedAt: null, ...(options?.scopes ? { scopes: options.scopes } : {}), ...(options?.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}) },
  });
}

/** Merge a partial update (e.g. refreshed tokens) into the stored credentials. */
export async function patchCredentials(integrationId: string, patch: Record<string, string | undefined>) {
  const current = await readCredentials<Record<string, string>>(integrationId);
  if (!current) return;
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) next[k] = v;
  await writeCredentials(integrationId, next, { expiresAt: next.expiresAt ? new Date(next.expiresAt) : undefined });
  logger.debug({ integrationId }, "credentials rotated");
}
