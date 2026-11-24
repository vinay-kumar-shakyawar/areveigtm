import type { NextRequest } from "next/server";
import { prisma } from "@/server/db/client";
import { safeEqual } from "@/server/modules/inbound/signatures";
import { ingestLinkedInMessage } from "@/server/modules/inbound/service";
import { integrationForWebhook, json, markProcessed, storeWebhookEvent } from "@/server/modules/inbound/webhook-util";

/**
 * Unipile messaging / account-status webhook. Registered by AREVEI with a
 * custom `x-arevei-secret` header stored in the integration credentials.
 * Payload shape follows Unipile's "new_message" event (live verification pending);
 * polling through `inbox.sync` remains the source of truth.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const target = await integrationForWebhook(integrationId, "linkedin", "unipile");
  if (!target) return json(404, { ok: false });
  const secret = target.creds?.webhookSecret;
  if (!secret || !safeEqual(req.headers.get("x-arevei-secret") ?? "", secret)) return json(401, { ok: false });
  const body = (await req.json().catch(() => null)) as null | { event?: string; account_id?: string; message_id?: string; chat_id?: string; message?: string; timestamp?: string; sender?: { attendee_public_identifier?: string; attendee_provider_id?: string }; is_sender?: boolean | number; AccountStatus?: { account_id?: string; message?: string } };
  if (!body) return json(400, { ok: false });
  const wsId = target.integration.workspaceId;
  const eventType = body.event ?? (body.AccountStatus ? "account_status" : "unknown");
  const eventId = await storeWebhookEvent({ workspaceId: wsId, provider: "unipile", externalEventId: body.message_id ? `msg:${body.message_id}` : null, eventType, payload: body, signatureValid: true });
  if (!eventId) return json(200, { ok: true, duplicate: true });
  try {
    if (body.AccountStatus?.account_id) {
      const status = /OK|CONNECTED/i.test(body.AccountStatus.message ?? "") ? "connected" : /CREDENTIALS|DISCONNECTED/i.test(body.AccountStatus.message ?? "") ? "disconnected" : "limited";
      await prisma.senderAccount.updateMany({ where: { workspaceId: wsId, channel: "linkedin", externalAccountId: body.AccountStatus.account_id }, data: { status, health: { provider: body.AccountStatus.message, at: new Date().toISOString() } } });
    } else if (body.message_id && body.chat_id && body.account_id && !body.is_sender) {
      const sender = await prisma.senderAccount.findFirst({ where: { workspaceId: wsId, channel: "linkedin", externalAccountId: body.account_id } });
      if (sender) {
        await ingestLinkedInMessage(wsId, sender.id, { providerMessageId: body.message_id, threadKey: body.chat_id, fromLinkedinUrl: body.sender?.attendee_public_identifier ? `https://www.linkedin.com/in/${body.sender.attendee_public_identifier}` : undefined, text: body.message ?? "", receivedAt: body.timestamp ?? new Date().toISOString() });
      }
    }
    await markProcessed(eventId);
  } catch (err) {
    await markProcessed(eventId, (err as Error).message);
  }
  return json(200, { ok: true });
}
