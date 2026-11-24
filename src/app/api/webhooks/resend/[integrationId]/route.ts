import type { NextRequest } from "next/server";
import { verifySvixSignature } from "@/server/modules/inbound/signatures";
import { recordBounce, recordDelivered } from "@/server/modules/inbound/service";
import { integrationForWebhook, json, markProcessed, storeWebhookEvent } from "@/server/modules/inbound/webhook-util";
import { env } from "@/lib/env";

/**
 * Resend event webhook (Svix signed). Register
 *   POST {APP_BASE_URL}/api/webhooks/resend/{integrationId}
 * in Resend and paste the signing secret into the integration.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const target = await integrationForWebhook(integrationId, "email", "resend");
  if (!target) return json(404, { ok: false });
  const raw = await req.text();
  const secret = target.creds?.webhookSigningSecret || env().RESEND_WEBHOOK_SECRET;
  if (!secret) return json(503, { ok: false, error: "No webhook signing secret configured for this integration" });
  const valid = verifySvixSignature(secret, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, raw);
  if (!valid) return json(401, { ok: false, error: "Invalid signature" });
  let body: { type?: string; created_at?: string; data?: { email_id?: string; to?: string[]; bounce?: { message?: string; type?: string }; created_at?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false });
  }
  const eventId = await storeWebhookEvent({ workspaceId: target.integration.workspaceId, provider: "resend", externalEventId: req.headers.get("svix-id"), eventType: body.type ?? "unknown", payload: body, signatureValid: true });
  if (!eventId) return json(200, { ok: true, duplicate: true });
  const wsId = target.integration.workspaceId;
  const emailId = body.data?.email_id ?? null;
  try {
    switch (body.type) {
      case "email.delivered":
        if (emailId) await recordDelivered(wsId, emailId, body.created_at ? new Date(body.created_at) : new Date());
        break;
      case "email.bounced":
        await recordBounce(wsId, { providerMessageId: emailId, email: body.data?.to?.[0], kind: "bounce", detail: body.data?.bounce?.message, permanent: body.data?.bounce?.type !== "Transient" });
        break;
      case "email.complained":
        await recordBounce(wsId, { providerMessageId: emailId, email: body.data?.to?.[0], kind: "complaint" });
        break;
      default:
        break; // sent / opened / clicked: stored for audit only
    }
    await markProcessed(eventId);
  } catch (err) {
    await markProcessed(eventId, (err as Error).message);
  }
  return json(200, { ok: true });
}
