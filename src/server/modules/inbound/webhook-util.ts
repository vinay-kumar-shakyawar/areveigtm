import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { readCredentials } from "@/server/providers/credential-store";
import { logger } from "@/server/logger";

/** Loads the workspace integration an inbound provider webhook is addressed to. */
export async function integrationForWebhook(integrationId: string, category: "email" | "mailbox" | "linkedin", provider: string) {
  if (!/^[0-9a-f-]{36}$/i.test(integrationId)) return null;
  const integration = await prisma.integration.findFirst({ where: { id: integrationId, category, provider } });
  if (!integration) return null;
  const creds = await readCredentials<Record<string, string>>(integration.id).catch(() => null);
  return { integration, creds };
}

/** Idempotent event store. Returns false when this provider event was already recorded. */
export async function storeWebhookEvent(input: { workspaceId: string | null; provider: string; externalEventId: string | null; eventType: string; payload: unknown; signatureValid: boolean }) {
  try {
    const row = await prisma.webhookEvent.create({ data: { workspaceId: input.workspaceId ?? undefined, provider: input.provider, externalEventId: input.externalEventId ?? undefined, eventType: input.eventType, payload: input.payload as Prisma.InputJsonValue, signatureValid: input.signatureValid } });
    return row.id;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return null; // duplicate externalEventId
    logger.warn({ err }, "failed to store webhook event");
    return null;
  }
}

export async function markProcessed(id: string | null, error?: string) {
  if (!id) return;
  await prisma.webhookEvent.update({ where: { id }, data: { processedAt: new Date(), error } }).catch(() => {});
}

export function json(status: number, body: object) {
  return Response.json(body, { status });
}
