import type { NextRequest } from "next/server";
import { callbackToken, safeEqual } from "@/server/modules/inbound/signatures";
import { registerLinkedInSender } from "@/server/modules/senders/service";
import { integrationForWebhook, json, storeWebhookEvent } from "@/server/modules/inbound/webhook-util";
import { env } from "@/lib/env";

/**
 * Unipile hosted-auth notify URL. Called by Unipile once the member finished
 * linking their LinkedIn. The `token` query binds the URL to one integration.
 * Payload (per Unipile docs, live verification pending): { status, account_id, name }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const target = await integrationForWebhook(integrationId, "linkedin", "unipile");
  if (!target) return json(404, { ok: false });
  const expected = callbackToken(env().JWT_SECRET, "unipile-account", integrationId, target.integration.workspaceId);
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!safeEqual(token, expected)) return json(401, { ok: false });
  const body = (await req.json().catch(() => ({}))) as { status?: string; account_id?: string; name?: string };
  await storeWebhookEvent({ workspaceId: target.integration.workspaceId, provider: "unipile", externalEventId: body.account_id ? `account:${body.account_id}:${body.status}` : null, eventType: `account.${body.status ?? "unknown"}`, payload: body, signatureValid: true });
  if (!body.account_id) return json(400, { ok: false });
  const [workspaceId, userId] = (body.name ?? "").split(":");
  if (workspaceId && workspaceId !== target.integration.workspaceId) return json(403, { ok: false });
  const ok = !body.status || /SUCCESS|OK|CREATION_SUCCESS|RECONNECTED/i.test(body.status);
  await registerLinkedInSender(target.integration.workspaceId, integrationId, { externalAccountId: body.account_id, displayName: "LinkedIn account (syncing name…)", status: ok ? "connected" : "disconnected" }, userId || null);
  return json(200, { ok: true });
}
