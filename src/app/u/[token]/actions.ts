"use server";

import { headers } from "next/headers";
import { verifyUnsubscribeToken } from "@/server/modules/channels/email";
import { recordUnsubscribe } from "@/server/modules/inbound/service";
import { ipHash } from "@/server/auth/tokens";

export async function confirmUnsubscribe(token: string): Promise<{ ok: boolean; email?: string }> {
  const [payload, sig] = decodeURIComponent(token).split(".");
  const data = payload && sig ? verifyUnsubscribeToken(payload, sig) : null;
  if (!data) return { ok: false };
  const h = await headers();
  await recordUnsubscribe(data.workspaceId, { email: data.email, messageId: data.messageId, method: "link", ipHash: ipHash(h.get("x-forwarded-for")?.split(",")[0]), token: decodeURIComponent(token) });
  return { ok: true, email: data.email };
}
