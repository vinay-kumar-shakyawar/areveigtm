import type { NextRequest } from "next/server";
import { verifySendGridSignature } from "@/server/modules/inbound/signatures";
import { recordBounce, recordDelivered, recordUnsubscribe } from "@/server/modules/inbound/service";
import { integrationForWebhook, json, markProcessed, storeWebhookEvent } from "@/server/modules/inbound/webhook-util";
import { env } from "@/lib/env";

/** SendGrid Event Webhook (signed). Verification key lives in the integration config or SENDGRID_WEBHOOK_PUBLIC_KEY. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const target = await integrationForWebhook(integrationId, "email", "sendgrid");
  if (!target) return json(404, { ok: false });
  const raw = await req.text();
  const publicKey = ((target.integration.config as { webhookPublicKey?: string } | null)?.webhookPublicKey || env().SENDGRID_WEBHOOK_PUBLIC_KEY) ?? "";
  if (!publicKey) return json(503, { ok: false, error: "No verification key configured for this integration" });
  const valid = verifySendGridSignature(publicKey, req.headers.get("x-twilio-email-event-webhook-signature"), req.headers.get("x-twilio-email-event-webhook-timestamp"), raw);
  if (!valid) return json(401, { ok: false, error: "Invalid signature" });
  let events: { event?: string; sg_event_id?: string; sg_message_id?: string; email?: string; timestamp?: number; reason?: string; type?: string }[];
  try {
    events = JSON.parse(raw);
  } catch {
    return json(400, { ok: false });
  }
  const wsId = target.integration.workspaceId;
  for (const ev of Array.isArray(events) ? events : []) {
    const eventId = await storeWebhookEvent({ workspaceId: wsId, provider: "sendgrid", externalEventId: ev.sg_event_id ?? null, eventType: ev.event ?? "unknown", payload: ev, signatureValid: true });
    if (!eventId) continue;
    const providerMessageId = ev.sg_message_id?.split(".")[0] ?? null;
    const at = ev.timestamp ? new Date(ev.timestamp * 1000) : new Date();
    try {
      if (ev.event === "delivered" && providerMessageId) await recordDelivered(wsId, providerMessageId, at);
      else if (ev.event === "bounce" || ev.event === "dropped") await recordBounce(wsId, { providerMessageId, email: ev.email, kind: "bounce", detail: ev.reason, permanent: ev.type !== "blocked" });
      else if (ev.event === "spamreport") await recordBounce(wsId, { providerMessageId, email: ev.email, kind: "complaint" });
      else if (ev.event === "unsubscribe" || ev.event === "group_unsubscribe") {
        if (ev.email) await recordUnsubscribe(wsId, { email: ev.email, method: "list_unsubscribe_header" });
      }
      await markProcessed(eventId);
    } catch (err) {
      await markProcessed(eventId, (err as Error).message);
    }
  }
  return json(200, { ok: true });
}
