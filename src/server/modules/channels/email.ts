import "server-only";
import { createHmac } from "node:crypto";
import type { Message, SenderAccount, EmailMailbox } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { Ctx } from "@/server/auth/context";
import { resolveProviders } from "@/server/providers/registry";
import type { EmailSendProvider } from "@/server/providers/types";
import { env } from "@/lib/env";

type Sender = (SenderAccount & { mailbox: EmailMailbox | null }) | null;

/**
 * Sends an outbound email through the sender's provider. Returns `{manual:true}`
 * when no connected email sender exists so the engine creates a task instead.
 */
export async function sendEmailMessage(ctx: Ctx, message: Message, sender: Sender): Promise<{ providerMessageId: string; threadKey?: string } | { manual: true }> {
  if (!sender || sender.channel !== "email" || !sender.mailbox) return { manual: true };
  const to = message.toAddress;
  if (!to) throw new Error("Recipient has no email address");
  const providers = await resolveProviders<EmailSendProvider>(ctx.workspaceId, "email.send", { preferProvider: sender.provider, usage: { leadId: message.leadId ?? undefined, campaignId: undefined } });
  const provider = providers.find((p) => p.descriptor.id === sender.provider) ?? providers[0];
  if (!provider) return { manual: true };

  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId: ctx.workspaceId } });
  const unsub = await unsubscribeLink(ctx.workspaceId, message.id, to);
  const oneClick = unsub.replace("/u/", "/api/unsubscribe/");
  const footer = settings?.unsubscribeFooterEnabled !== false ? `\n\n—\nIf you'd rather not hear from me again, say so or use this link: ${unsub}` : "";
  const text = `${message.body}${footer}`;
  const prior = await prisma.message.findFirst({ where: { leadId: message.leadId ?? undefined, channel: "email", status: { in: ["sent", "delivered"] }, providerMessageId: { not: null }, id: { not: message.id } }, orderBy: { sentAt: "desc" } });
  const headers: Record<string, string> = { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "X-Arevei-Message": message.id };
  const res = await provider.instance.send({
    from: { email: sender.mailbox.emailAddress, name: sender.mailbox.fromName ?? sender.displayName },
    to: { email: to, name: undefined },
    replyTo: sender.mailbox.replyTo ?? undefined,
    subject: message.subject ?? "(no subject)",
    text,
    headers,
    idempotencyKey: message.id,
    inReplyTo: prior?.providerMessageId ?? undefined,
    references: prior?.providerMessageId ? [prior.providerMessageId] : undefined,
  });
  await prisma.emailMailbox.update({ where: { id: sender.mailbox.id }, data: { sentToday: { increment: 1 }, sentDate: new Date() } });
  await prisma.message.update({ where: { id: message.id }, data: { fromAddress: sender.mailbox.emailAddress, mailboxId: sender.mailbox.id } });
  return { providerMessageId: res.providerMessageId, threadKey: prior?.threadKey ?? message.id };
}

export async function unsubscribeLink(workspaceId: string, messageId: string, email: string): Promise<string> {
  const token = createHmac("sha256", env().JWT_SECRET).update(`${workspaceId}|${messageId}|${email.toLowerCase()}`).digest("hex").slice(0, 40);
  return `${env().APP_BASE_URL}/u/${encodeURIComponent(Buffer.from(`${workspaceId}|${messageId}|${email.toLowerCase()}`).toString("base64url"))}.${token}`;
}

export function verifyUnsubscribeToken(payload: string, token: string): { workspaceId: string; messageId: string; email: string } | null {
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const [workspaceId, messageId, email] = decoded.split("|");
    const expected = createHmac("sha256", env().JWT_SECRET).update(`${workspaceId}|${messageId}|${email}`).digest("hex").slice(0, 40);
    if (expected !== token) return null;
    return { workspaceId, messageId, email };
  } catch {
    return null;
  }
}
