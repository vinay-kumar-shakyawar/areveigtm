import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { jobCtx, type Ctx } from "@/server/auth/context";
import { recordActivity, notify } from "@/server/modules/audit/service";
import { stopAllForLead } from "@/server/modules/campaigns/service";
import { emitWebhook } from "@/server/modules/webhooks/service";
import { resolveProviders } from "@/server/providers/registry";
import type { InboundEmail, LinkedInProvider, MailboxProvider } from "@/server/providers/types";
import { linkedinSlug, normalizeEmail } from "@/lib/normalize";
import { defineJob, enqueue } from "@/server/jobs";
import { logger } from "@/server/logger";
import { sha256 } from "@/server/auth/tokens";

/**
 * Inbound channel events: replies, deliveries, bounces, complaints and
 * unsubscribes. Everything here is idempotent (provider message ids are unique
 * per workspace) so webhooks and polling can overlap safely.
 */

export interface IngestResult {
  created: boolean;
  reason?: "duplicate" | "no_match" | "own_message";
  messageId?: string;
  conversationId?: string;
  leadId?: string;
}

async function findLeadByEmail(workspaceId: string, email: string) {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  const contact = await prisma.contact.findFirst({ where: { workspaceId, email: norm }, include: { lead: true } });
  return contact?.lead ? { lead: contact.lead, contact } : null;
}

async function openConversation(workspaceId: string, input: { leadId: string; contactId: string; accountId?: string | null; channel: "email" | "linkedin" | "x"; campaignId?: string | null; senderAccountId?: string | null; threadKey?: string | null; subject?: string | null }) {
  const existing = await prisma.conversation.findFirst({ where: { workspaceId, leadId: input.leadId, channel: input.channel, status: { not: "archived" } }, orderBy: { createdAt: "desc" } });
  const convo =
    existing ??
    (await prisma.conversation.create({
      data: { workspaceId, leadId: input.leadId, contactId: input.contactId, accountId: input.accountId ?? undefined, channel: input.channel, campaignId: input.campaignId ?? undefined, senderAccountId: input.senderAccountId ?? undefined, externalThreadId: input.threadKey ?? undefined, subject: input.subject ?? undefined },
    }));
  // Pull the campaign messages already exchanged on this channel into the thread.
  await prisma.message.updateMany({ where: { workspaceId, leadId: input.leadId, channel: input.channel, conversationId: null, status: { in: ["sent", "delivered", "received", "bounced"] } }, data: { conversationId: convo.id } });
  return convo;
}

async function afterInbound(ctx: Ctx, args: { leadId: string; contactId: string; conversationId: string; messageId: string; channel: "email" | "linkedin" | "x"; campaignId?: string | null; senderAccountId?: string | null; preview: string; fromLabel: string }) {
  await prisma.conversation.update({
    where: { id: args.conversationId },
    data: { lastMessageAt: new Date(), lastInboundAt: new Date(), unreadCount: { increment: 1 }, status: "needs_attention", replyStatus: "awaiting_decision" },
  });
  const lead = await prisma.lead.findUnique({ where: { id: args.leadId } });
  if (lead && ["new", "reviewing", "approved", "enrolled"].includes(lead.status)) {
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "replied", stage: "replied", lastActivityAt: new Date() } });
  } else if (lead) {
    await prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } });
  }
  const stopped = await stopAllForLead(ctx, args.leadId, "replied");
  await recordActivity(ctx, { action: "reply.received", leadId: args.leadId, contactId: args.contactId, conversationId: args.conversationId, campaignId: args.campaignId, senderAccountId: args.senderAccountId, channel: args.channel, metadata: { messageId: args.messageId, stoppedEnrollments: stopped } });
  await emitWebhook(ctx.workspaceId, "reply.received", { leadId: args.leadId, conversationId: args.conversationId, messageId: args.messageId, channel: args.channel, preview: args.preview.slice(0, 280) });
  const slug = (await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { slug: true } }))?.slug ?? "";
  await notify(ctx, { type: "reply", title: `New ${args.channel} reply from ${args.fromLabel}`, body: args.preview.slice(0, 140), link: `/w/${slug}/inbox?conversation=${args.conversationId}` });
  // The inbox module registers the `inbox.process` job; import lazily to avoid a module cycle.
  await import("@/server/modules/inbox/service");
  await enqueue("inbox.process", { workspaceId: ctx.workspaceId, conversationId: args.conversationId, messageId: args.messageId }, { workspaceId: ctx.workspaceId }).catch((err) => logger.warn({ err }, "inbox.process enqueue failed"));
}

/** Store an inbound email if it belongs to a known lead or an outbound thread. */
export async function ingestInboundEmail(workspaceId: string, source: { senderAccountId?: string | null; mailboxAddress?: string | null }, email: InboundEmail): Promise<IngestResult> {
  const ctx = jobCtx(workspaceId);
  const fromEmail = normalizeEmail(email.from.email);
  if (!fromEmail) return { created: false, reason: "no_match" };
  if (source.mailboxAddress && normalizeEmail(source.mailboxAddress) === fromEmail) return { created: false, reason: "own_message" };
  const dup = await prisma.message.findFirst({ where: { workspaceId, providerMessageId: email.providerMessageId } });
  if (dup) return { created: false, reason: "duplicate", messageId: dup.id, conversationId: dup.conversationId ?? undefined };

  // Thread match: In-Reply-To / References against our sent message ids, then thread key.
  const refs = [email.inReplyTo, ...(email.references ?? [])].filter((r): r is string => Boolean(r));
  let prior = refs.length ? await prisma.message.findFirst({ where: { workspaceId, direction: "outbound", providerMessageId: { in: refs } }, include: { campaignLead: true } }) : null;
  if (!prior && email.threadKey) prior = await prisma.message.findFirst({ where: { workspaceId, direction: "outbound", threadKey: email.threadKey }, include: { campaignLead: true } });
  let leadId = prior?.leadId ?? null;
  let contactId: string | null = null;
  let accountId: string | null = null;
  if (!leadId) {
    const match = await findLeadByEmail(workspaceId, fromEmail);
    if (!match) return { created: false, reason: "no_match" };
    leadId = match.lead.id;
    contactId = match.contact.id;
    accountId = match.lead.accountId;
    prior = await prisma.message.findFirst({ where: { workspaceId, leadId, direction: "outbound", channel: "email" }, orderBy: { sentAt: "desc" }, include: { campaignLead: true } });
  } else {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { contact: true } });
    if (!lead) return { created: false, reason: "no_match" };
    contactId = lead.contactId;
    accountId = lead.accountId;
  }
  const senderAccountId = source.senderAccountId ?? prior?.senderAccountId ?? null;
  const conversation = await openConversation(workspaceId, { leadId, contactId: contactId!, accountId, channel: "email", campaignId: prior?.campaignLead?.campaignId ?? null, senderAccountId, threadKey: email.threadKey ?? prior?.threadKey ?? null, subject: email.subject ?? prior?.subject ?? null });
  const message = await prisma.message.create({
    data: {
      workspaceId,
      leadId,
      campaignLeadId: prior?.campaignLeadId ?? undefined,
      conversationId: conversation.id,
      channel: "email",
      direction: "inbound",
      kind: "reply",
      subject: email.subject ?? undefined,
      body: email.text,
      bodyHtml: email.html ?? undefined,
      status: "received",
      generatedBy: "user",
      receivedAt: new Date(email.receivedAt),
      providerMessageId: email.providerMessageId,
      threadKey: email.threadKey ?? prior?.threadKey ?? undefined,
      senderAccountId: senderAccountId ?? undefined,
      fromAddress: fromEmail,
      toAddress: email.to[0] ?? source.mailboxAddress ?? undefined,
    },
  });
  await afterInbound(ctx, { leadId, contactId: contactId!, conversationId: conversation.id, messageId: message.id, channel: "email", campaignId: prior?.campaignLead?.campaignId ?? null, senderAccountId, preview: email.text, fromLabel: email.from.name ?? fromEmail });
  return { created: true, messageId: message.id, conversationId: conversation.id, leadId };
}

/** Store an inbound LinkedIn message from a connected sender's inbox. */
export async function ingestLinkedInMessage(workspaceId: string, senderAccountId: string, msg: { providerMessageId: string; threadKey: string; fromLinkedinUrl?: string; text: string; receivedAt: string }): Promise<IngestResult> {
  const ctx = jobCtx(workspaceId);
  const dup = await prisma.message.findFirst({ where: { workspaceId, providerMessageId: msg.providerMessageId } });
  if (dup) return { created: false, reason: "duplicate", messageId: dup.id };
  let prior = await prisma.message.findFirst({ where: { workspaceId, direction: "outbound", channel: "linkedin", threadKey: msg.threadKey }, include: { campaignLead: true } });
  let leadId = prior?.leadId ?? null;
  let contactId: string | null = null;
  let accountId: string | null = null;
  if (!leadId) {
    const slug = linkedinSlug(msg.fromLinkedinUrl);
    if (!slug) return { created: false, reason: "no_match" };
    const contact = await prisma.contact.findFirst({ where: { workspaceId, linkedinSlug: slug }, include: { lead: true } });
    if (!contact?.lead) return { created: false, reason: "no_match" };
    leadId = contact.lead.id;
    contactId = contact.id;
    accountId = contact.lead.accountId;
    prior = await prisma.message.findFirst({ where: { workspaceId, leadId, direction: "outbound", channel: "linkedin" }, orderBy: { sentAt: "desc" }, include: { campaignLead: true } });
  } else {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return { created: false, reason: "no_match" };
    contactId = lead.contactId;
    accountId = lead.accountId;
  }
  const conversation = await openConversation(workspaceId, { leadId, contactId: contactId!, accountId, channel: "linkedin", campaignId: prior?.campaignLead?.campaignId ?? null, senderAccountId, threadKey: msg.threadKey });
  const message = await prisma.message.create({
    data: { workspaceId, leadId, campaignLeadId: prior?.campaignLeadId ?? undefined, conversationId: conversation.id, channel: "linkedin", direction: "inbound", kind: "reply", body: msg.text, status: "received", generatedBy: "user", receivedAt: new Date(msg.receivedAt), providerMessageId: msg.providerMessageId, threadKey: msg.threadKey, senderAccountId, fromAddress: msg.fromLinkedinUrl ?? undefined },
  });
  await afterInbound(ctx, { leadId, contactId: contactId!, conversationId: conversation.id, messageId: message.id, channel: "linkedin", campaignId: prior?.campaignLead?.campaignId ?? null, senderAccountId, preview: msg.text, fromLabel: msg.fromLinkedinUrl ?? "LinkedIn contact" });
  return { created: true, messageId: message.id, conversationId: conversation.id, leadId };
}

export async function recordDelivered(workspaceId: string, providerMessageId: string, at = new Date()) {
  const message = await prisma.message.findFirst({ where: { workspaceId, providerMessageId, direction: "outbound" }, include: { campaignLead: true } });
  if (!message || message.status === "delivered") return null;
  await prisma.message.update({ where: { id: message.id }, data: { status: "delivered", deliveredAt: at } });
  const ctx = jobCtx(workspaceId);
  await recordActivity(ctx, { action: "message.delivered", leadId: message.leadId, campaignId: message.campaignLead?.campaignId, campaignLeadId: message.campaignLeadId, senderAccountId: message.senderAccountId, channel: message.channel, metadata: { messageId: message.id }, occurredAt: at });
  await emitWebhook(workspaceId, "message.delivered", { messageId: message.id, leadId: message.leadId });
  return message;
}

export async function recordBounce(workspaceId: string, input: { providerMessageId?: string | null; email?: string | null; kind: "bounce" | "complaint"; detail?: string; permanent?: boolean }) {
  const ctx = jobCtx(workspaceId);
  const message = input.providerMessageId ? await prisma.message.findFirst({ where: { workspaceId, providerMessageId: input.providerMessageId, direction: "outbound" }, include: { campaignLead: true } }) : null;
  const email = normalizeEmail(input.email ?? message?.toAddress ?? null);
  if (!message && !email) return { handled: false };
  if (message && message.status !== "bounced") await prisma.message.update({ where: { id: message.id }, data: { status: "bounced", error: { kind: input.kind, detail: input.detail ?? null } } });
  let leadId = message?.leadId ?? null;
  let contactId: string | null = null;
  if (email) {
    const contact = await prisma.contact.findFirst({ where: { workspaceId, email }, include: { lead: true } });
    contactId = contact?.id ?? null;
    leadId = leadId ?? contact?.lead?.id ?? null;
    if (input.kind === "complaint" || input.permanent !== false) {
      await prisma.suppressionEntry.upsert({ where: { workspaceId_kind_value: { workspaceId, kind: "email", value: email } }, create: { workspaceId, kind: "email", value: email, reason: input.kind, source: "provider_webhook" }, update: {} });
      if (contact && input.kind === "bounce") await prisma.contact.update({ where: { id: contact.id }, data: { emailStatus: "invalid" } });
    }
  }
  if (leadId) await stopAllForLead(ctx, leadId, "bounced");
  await recordActivity(ctx, { action: input.kind === "bounce" ? "email.bounced" : "email.complained", outcome: "failed", leadId, contactId, campaignId: message?.campaignLead?.campaignId, campaignLeadId: message?.campaignLeadId, senderAccountId: message?.senderAccountId, channel: "email", metadata: { messageId: message?.id ?? null, email, detail: input.detail ?? null } });
  await emitWebhook(workspaceId, input.kind === "bounce" ? "email.bounced" : "email.complained", { messageId: message?.id ?? null, leadId, email });
  return { handled: true, messageId: message?.id ?? null, leadId };
}

export async function recordUnsubscribe(workspaceId: string, input: { email: string; messageId?: string | null; method: "link" | "list_unsubscribe_header" | "reply" | "manual"; ipHash?: string | null; token?: string | null }) {
  const ctx = jobCtx(workspaceId);
  const email = normalizeEmail(input.email);
  if (!email) return { handled: false as const };
  const tokenHash = input.token ? sha256(input.token) : null;
  if (tokenHash) {
    const dup = await prisma.unsubscribe.findUnique({ where: { tokenHash } });
    if (dup) return { handled: true as const, duplicate: true, leadId: dup.contactId };
  }
  const contact = await prisma.contact.findFirst({ where: { workspaceId, email }, include: { lead: true } });
  const message = input.messageId ? await prisma.message.findFirst({ where: { id: input.messageId, workspaceId }, include: { campaignLead: true } }) : null;
  await prisma.unsubscribe.create({ data: { workspaceId, contactId: contact?.id, email, channel: "email", campaignId: message?.campaignLead?.campaignId, messageId: message?.id, tokenHash: tokenHash ?? undefined, method: input.method, ipHash: input.ipHash ?? undefined } });
  await prisma.suppressionEntry.upsert({ where: { workspaceId_kind_value: { workspaceId, kind: "email", value: email } }, create: { workspaceId, kind: "email", value: email, reason: "unsubscribe", source: input.method }, update: { reason: "unsubscribe" } });
  if (contact?.lead) {
    await prisma.lead.update({ where: { id: contact.lead.id }, data: { status: "unsubscribed", lastActivityAt: new Date() } });
    await stopAllForLead(ctx, contact.lead.id, "opted_out");
  }
  await recordActivity(ctx, { action: "unsubscribe", leadId: contact?.lead?.id, contactId: contact?.id, campaignId: message?.campaignLead?.campaignId, channel: "email", metadata: { email, method: input.method } });
  await emitWebhook(workspaceId, "lead.unsubscribed", { leadId: contact?.lead?.id ?? null, email, method: input.method });
  return { handled: true as const, duplicate: false, leadId: contact?.lead?.id ?? null };
}

/** Poll one sender's inbox (mailbox via IMAP/Gmail/Graph, or LinkedIn via the provider). */
export async function syncSenderInbox(workspaceId: string, senderAccountId: string): Promise<{ fetched: number; created: number }> {
  const sender = await prisma.senderAccount.findFirst({ where: { id: senderAccountId, workspaceId }, include: { mailbox: true } });
  if (!sender) return { fetched: 0, created: 0 };
  let fetched = 0;
  let created = 0;
  if (sender.channel === "email" && sender.mailbox && ["imap_poll", "gmail_api", "graph_poll"].includes(sender.mailbox.inboundMode)) {
    const providers = await resolveProviders<MailboxProvider>(workspaceId, "email.inbound", { preferProvider: sender.provider });
    const provider = providers.find((p) => p.integrationId === sender.integrationId) ?? providers.find((p) => p.descriptor.id === sender.provider);
    if (!provider || !("fetchInbound" in provider.instance)) return { fetched: 0, created: 0 };
    const res = await provider.instance.fetchInbound(sender.mailbox.inboundCursor ?? undefined);
    fetched = res.messages.length;
    for (const m of res.messages) {
      const r = await ingestInboundEmail(workspaceId, { senderAccountId: sender.id, mailboxAddress: sender.mailbox.emailAddress }, m);
      if (r.created) created++;
    }
    await prisma.emailMailbox.update({ where: { id: sender.mailbox.id }, data: { inboundCursor: (res.nextCursor ?? sender.mailbox.inboundCursor ?? undefined) as Prisma.InputJsonValue | undefined, lastInboundSyncAt: new Date() } });
  } else if (sender.channel === "linkedin" && sender.externalAccountId) {
    const providers = await resolveProviders<LinkedInProvider>(workspaceId, "linkedin.inbox", { preferProvider: sender.provider });
    const provider = providers.find((p) => p.descriptor.id === sender.provider);
    if (!provider) return { fetched: 0, created: 0 };
    const res = await provider.instance.fetchInbox({ accountId: sender.externalAccountId, cursor: sender.inboundCursor ?? undefined });
    fetched = res.messages.length;
    for (const m of res.messages) {
      if (m.direction !== "inbound") continue;
      const r = await ingestLinkedInMessage(workspaceId, sender.id, m);
      if (r.created) created++;
    }
    await prisma.senderAccount.update({ where: { id: sender.id }, data: { inboundCursor: (res.nextCursor ?? sender.inboundCursor ?? undefined) as Prisma.InputJsonValue | undefined, lastSyncAt: new Date() } });
  }
  return { fetched, created };
}

defineJob<{ workspaceId: string; senderAccountId: string }>("inbox.sync", async ({ workspaceId, senderAccountId }) => {
  try {
    const r = await syncSenderInbox(workspaceId, senderAccountId);
    logger.debug({ workspaceId, senderAccountId, ...r }, "inbox sync");
  } catch (err) {
    logger.warn({ err, workspaceId, senderAccountId }, "inbox sync failed");
    await prisma.senderAccount.update({ where: { id: senderAccountId }, data: { health: { lastError: (err as Error).message, at: new Date().toISOString() } } }).catch(() => {});
  }
}, { retryLimit: 1, singletonKey: (p) => `inbox.sync:${p.senderAccountId}` });

defineJob("inbox.sync-all", async () => {
  const senders = await prisma.senderAccount.findMany({
    where: { status: "connected", OR: [{ channel: "linkedin" }, { channel: "email", mailbox: { inboundMode: { in: ["imap_poll", "gmail_api", "graph_poll"] } } }] },
    select: { id: true, workspaceId: true },
  });
  for (const s of senders) await enqueue("inbox.sync", { workspaceId: s.workspaceId, senderAccountId: s.id }, { workspaceId: s.workspaceId });
});
