import type { NextRequest } from "next/server";
import { verifySnsSignature, type SnsMessage } from "@/server/modules/inbound/signatures";
import { recordBounce, recordDelivered } from "@/server/modules/inbound/service";
import { integrationForWebhook, json, markProcessed, storeWebhookEvent } from "@/server/modules/inbound/webhook-util";
import { logger } from "@/server/logger";

/**
 * Amazon SES notifications delivered through SNS (HTTPS subscription).
 * Subscribe the topic to POST {APP_BASE_URL}/api/webhooks/ses/{integrationId}.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const target = await integrationForWebhook(integrationId, "email", "ses");
  if (!target) return json(404, { ok: false });
  let msg: SnsMessage;
  try {
    msg = JSON.parse(await req.text());
  } catch {
    return json(400, { ok: false });
  }
  if (!(await verifySnsSignature(msg))) return json(401, { ok: false, error: "Invalid SNS signature" });
  const wsId = target.integration.workspaceId;
  if (msg.Type === "SubscriptionConfirmation" && msg.SubscribeURL) {
    const u = new URL(msg.SubscribeURL);
    if (u.protocol === "https:" && /\.amazonaws\.com$/.test(u.hostname)) {
      await fetch(msg.SubscribeURL).catch((err) => logger.warn({ err }, "SNS subscription confirmation failed"));
    }
    await storeWebhookEvent({ workspaceId: wsId, provider: "ses", externalEventId: msg.MessageId, eventType: "SubscriptionConfirmation", payload: { topic: msg.TopicArn }, signatureValid: true });
    return json(200, { ok: true });
  }
  if (msg.Type !== "Notification") return json(200, { ok: true });
  let n: { notificationType?: string; eventType?: string; mail?: { messageId?: string; destination?: string[] }; bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress: string; diagnosticCode?: string }[] }; complaint?: { complainedRecipients?: { emailAddress: string }[] }; delivery?: { timestamp?: string } };
  try {
    n = JSON.parse(msg.Message);
  } catch {
    return json(200, { ok: true });
  }
  const type = n.notificationType ?? n.eventType ?? "unknown";
  const eventId = await storeWebhookEvent({ workspaceId: wsId, provider: "ses", externalEventId: msg.MessageId, eventType: type, payload: n, signatureValid: true });
  if (!eventId) return json(200, { ok: true, duplicate: true });
  const providerMessageId = n.mail?.messageId ?? null;
  try {
    if (type === "Delivery" && providerMessageId) await recordDelivered(wsId, providerMessageId, n.delivery?.timestamp ? new Date(n.delivery.timestamp) : new Date());
    else if (type === "Bounce") {
      for (const r of n.bounce?.bouncedRecipients ?? [{ emailAddress: n.mail?.destination?.[0] ?? "" }]) {
        await recordBounce(wsId, { providerMessageId, email: r.emailAddress, kind: "bounce", detail: r.diagnosticCode, permanent: n.bounce?.bounceType === "Permanent" });
      }
    } else if (type === "Complaint") {
      for (const r of n.complaint?.complainedRecipients ?? []) await recordBounce(wsId, { providerMessageId, email: r.emailAddress, kind: "complaint" });
    }
    await markProcessed(eventId);
  } catch (err) {
    await markProcessed(eventId, (err as Error).message);
  }
  return json(200, { ok: true });
}
