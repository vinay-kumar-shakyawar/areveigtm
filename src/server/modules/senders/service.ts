import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma, type InboundMode, type MailboxProvider as MailboxProviderEnum, type SenderChannel } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit, recordActivity } from "@/server/modules/audit/service";
import { getDescriptor, resolveProviders } from "@/server/providers/registry";
import { patchCredentials, readCredentials } from "@/server/providers/credential-store";
import type { EmailSendProvider, LinkedInProvider } from "@/server/providers/types";
import { checkDomainAuth } from "@/server/modules/senders/domain-auth";
import { callbackToken } from "@/server/modules/inbound/signatures";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/normalize";
import { enqueue } from "@/server/jobs";
import { syncSenderInbox } from "@/server/modules/inbound/service";

/**
 * Sender accounts: the identities campaigns send from. Email senders bind an
 * email/mailbox integration to a from-address; LinkedIn and X senders are
 * created only through authorized provider flows (hosted auth / OAuth).
 */

const sendingWindowSchema = z.object({ days: z.array(z.number().int().min(0).max(6)).min(1), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) });

export const createEmailSenderInput = z.object({
  integrationId: z.string().uuid(),
  emailAddress: z.string().email().optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  fromName: z.string().trim().max(80).optional(),
  replyTo: z.string().email().optional().nullable(),
  dailyLimit: z.number().int().min(1).max(2000).optional(),
  timezone: z.string().max(64).optional(),
});

export const updateSenderInput = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  fromName: z.string().trim().max(80).nullable().optional(),
  replyTo: z.string().email().nullable().optional().or(z.literal("").transform(() => null)),
  dailyLimit: z.number().int().min(1).max(2000).optional(),
  warmupEnabled: z.boolean().optional(),
  timezone: z.string().max(64).nullable().optional(),
  sendingWindow: sendingWindowSchema.nullable().optional(),
  status: z.enum(["connected", "disconnected"]).optional(),
  limits: z.object({ invitesPerDay: z.number().int().min(1).max(30).optional(), messagesPerDay: z.number().int().min(1).max(100).optional(), dmsPerDay: z.number().int().min(1).max(100).optional() }).optional(),
});

function mailboxEnum(provider: string): MailboxProviderEnum {
  const known: MailboxProviderEnum[] = ["google", "microsoft", "smtp_imap", "resend", "ses", "sendgrid", "mock"];
  return (known as string[]).includes(provider) ? (provider as MailboxProviderEnum) : "smtp_imap";
}

function inboundModeFor(provider: string, creds: Record<string, string> | null): InboundMode {
  if (provider === "google") return "gmail_api";
  if (provider === "microsoft") return "graph_poll";
  if (provider === "smtp_imap") return creds?.imapHost ? "imap_poll" : "none";
  if (provider === "mock") return "gmail_api"; // polled through the mock queue in dev/tests
  if (["resend", "sendgrid", "ses"].includes(provider)) return "webhook";
  return "none";
}

export async function listSenders(ctx: Ctx) {
  requirePermission(ctx, "integrations.read");
  const rows = await prisma.senderAccount.findMany({ where: { workspaceId: ctx.workspaceId }, include: { mailbox: true, integration: { select: { id: true, provider: true, label: true, category: true, healthStatus: true } } }, orderBy: [{ channel: "asc" }, { createdAt: "asc" }] });
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const sentToday = await prisma.activityEvent.groupBy({ by: ["senderAccountId"], where: { workspaceId: ctx.workspaceId, action: { in: ["message.sent", "invite.sent"] }, occurredAt: { gte: since }, senderAccountId: { not: null } }, _count: { _all: true } });
  const counts = new Map(sentToday.map((s) => [s.senderAccountId, s._count._all]));
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    provider: r.provider,
    displayName: r.displayName,
    handle: r.handle,
    externalAccountId: r.externalAccountId,
    status: r.status,
    health: r.health,
    limits: r.limits,
    timezone: r.timezone,
    sendingWindow: r.sendingWindow,
    ownerUserId: r.ownerUserId,
    integration: r.integration,
    connectedAt: r.connectedAt,
    lastSyncAt: r.lastSyncAt,
    createdAt: r.createdAt,
    sentToday: counts.get(r.id) ?? 0,
    mailbox: r.mailbox
      ? { id: r.mailbox.id, emailAddress: r.mailbox.emailAddress, provider: r.mailbox.provider, fromName: r.mailbox.fromName, replyTo: r.mailbox.replyTo, domain: r.mailbox.domain, domainAuth: r.mailbox.domainAuth, dailyLimit: r.mailbox.dailyLimit, warmupEnabled: r.mailbox.warmupEnabled, inboundMode: r.mailbox.inboundMode, lastInboundSyncAt: r.mailbox.lastInboundSyncAt, verificationState: r.mailbox.verificationState }
      : null,
  }));
}

export type SenderView = Awaited<ReturnType<typeof listSenders>>[number];

export async function createEmailSender(ctx: Ctx, input: z.infer<typeof createEmailSenderInput>) {
  requirePermission(ctx, "senders.manage");
  const integration = await prisma.integration.findFirst({ where: { id: input.integrationId, workspaceId: ctx.workspaceId } });
  if (!integration) throw ApiError.notFound("integration");
  if (integration.category !== "email" && integration.category !== "mailbox") throw ApiError.invalid("Choose an email or mailbox integration");
  const descriptor = getDescriptor(integration.category, integration.provider);
  if (!descriptor.capabilities.includes("email.send")) throw ApiError.invalid("This integration cannot send email");
  const creds = descriptor.credentialFields.length || integration.category === "mailbox" ? await readCredentials<Record<string, string>>(integration.id) : null;
  const emailAddress = normalizeEmail(integration.category === "mailbox" && creds?.emailAddress ? creds.emailAddress : input.emailAddress ?? null);
  if (!emailAddress) throw ApiError.invalid("A from address is required for this provider");
  const domain = emailAddress.split("@")[1];
  const existing = await prisma.emailMailbox.findFirst({ where: { workspaceId: ctx.workspaceId, emailAddress } });
  if (existing) throw ApiError.conflict(`${emailAddress} is already a sending account`);
  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId: ctx.workspaceId } });
  const defaults = (settings?.defaultDailyLimits as { email?: number } | null) ?? {};
  const sender = await prisma.$transaction(async (tx) => {
    const s = await tx.senderAccount.create({
      data: {
        workspaceId: ctx.workspaceId,
        channel: "email",
        provider: integration.provider,
        displayName: input.displayName || input.fromName || emailAddress,
        handle: emailAddress,
        status: "connected",
        integrationId: integration.id,
        ownerUserId: ctx.userId ?? undefined,
        timezone: input.timezone ?? settings?.timezone,
        connectedAt: new Date(),
      },
    });
    await tx.emailMailbox.create({
      data: {
        workspaceId: ctx.workspaceId,
        senderAccountId: s.id,
        emailAddress,
        provider: mailboxEnum(integration.provider),
        fromName: input.fromName || (creds?.fromName ?? null) || null,
        replyTo: input.replyTo ?? null,
        domain,
        dailyLimit: input.dailyLimit ?? defaults.email ?? 40,
        inboundMode: inboundModeFor(integration.provider, creds),
      },
    });
    return s;
  });
  await audit(ctx, "sender.created", { type: "sender", id: sender.id }, { channel: "email", provider: integration.provider, emailAddress });
  return sender.id;
}

export async function updateSender(ctx: Ctx, id: string, input: z.infer<typeof updateSenderInput>) {
  requirePermission(ctx, "senders.manage");
  const sender = await prisma.senderAccount.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { mailbox: true } });
  if (!sender) throw ApiError.notFound("sender");
  await prisma.$transaction(async (tx) => {
    await tx.senderAccount.update({
      where: { id },
      data: {
        displayName: input.displayName,
        timezone: input.timezone,
        sendingWindow: input.sendingWindow === null ? Prisma.DbNull : (input.sendingWindow as Prisma.InputJsonValue | undefined),
        status: input.status,
        limits: input.limits ? ({ ...((sender.limits as object) ?? {}), ...input.limits } as Prisma.InputJsonValue) : undefined,
        ...(input.status === "connected" ? { connectedAt: sender.connectedAt ?? new Date() } : {}),
      },
    });
    if (sender.mailbox && (input.fromName !== undefined || input.replyTo !== undefined || input.dailyLimit !== undefined || input.warmupEnabled !== undefined)) {
      await tx.emailMailbox.update({ where: { id: sender.mailbox.id }, data: { fromName: input.fromName, replyTo: input.replyTo, dailyLimit: input.dailyLimit, warmupEnabled: input.warmupEnabled } });
    }
  });
  await audit(ctx, "sender.updated", { type: "sender", id }, { fields: Object.keys(input) });
  return prisma.senderAccount.findUniqueOrThrow({ where: { id }, include: { mailbox: true } });
}

export async function deleteSender(ctx: Ctx, id: string) {
  requirePermission(ctx, "senders.manage");
  const sender = await prisma.senderAccount.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!sender) throw ApiError.notFound("sender");
  const active = await prisma.campaignLead.count({ where: { senderAccountId: id, status: { in: ["active", "queued", "waiting_approval"] } } });
  if (active > 0) throw ApiError.conflict(`${active} active enrolments use this sender. Pause the campaigns first.`);
  await prisma.senderAccount.delete({ where: { id } });
  await audit(ctx, "sender.deleted", { type: "sender", id }, { channel: sender.channel, provider: sender.provider });
}

async function providerForSender(workspaceId: string, sender: { provider: string; integrationId: string | null }) {
  const providers = await resolveProviders<EmailSendProvider>(workspaceId, "email.send", { preferProvider: sender.provider });
  return providers.find((p) => p.integrationId === sender.integrationId) ?? providers.find((p) => p.descriptor.id === sender.provider) ?? null;
}

/** Sends one real test email from this sender to the requesting user (explicit user action). */
export async function sendTestEmail(ctx: Ctx, id: string, to: string) {
  requirePermission(ctx, "senders.manage");
  const sender = await prisma.senderAccount.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { mailbox: true } });
  if (!sender?.mailbox) throw ApiError.notFound("sender");
  const recipient = normalizeEmail(to);
  if (!recipient) throw ApiError.invalid("Recipient email is invalid");
  const provider = await providerForSender(ctx.workspaceId, sender);
  if (!provider) throw new ApiError("not_configured", "The integration behind this sender is disabled or missing.");
  const started = Date.now();
  try {
    const res = await provider.instance.send({
      from: { email: sender.mailbox.emailAddress, name: sender.mailbox.fromName ?? sender.displayName },
      to: { email: recipient },
      replyTo: sender.mailbox.replyTo ?? undefined,
      subject: "AREVEI GTM test email",
      text: `This is a test email from your AREVEI GTM sending account ${sender.mailbox.emailAddress} (${sender.provider}).\n\nIf you received it, outbound delivery works. Sent at ${new Date().toISOString()}.`,
      headers: { "X-Arevei-Test": "1" },
      idempotencyKey: `test:${sender.id}:${Date.now()}`,
    });
    await prisma.senderAccount.update({ where: { id }, data: { status: "connected", health: { ok: true, lastTestAt: new Date().toISOString(), providerMessageId: res.providerMessageId } } });
    await recordActivity(ctx, { action: "sender.test_sent", senderAccountId: id, channel: "email", metadata: { to: recipient, providerMessageId: res.providerMessageId } });
    await audit(ctx, "sender.test_sent", { type: "sender", id }, { to: recipient });
    return { ok: true, providerMessageId: res.providerMessageId, latencyMs: Date.now() - started };
  } catch (err) {
    const message = (err as Error).message;
    await prisma.senderAccount.update({ where: { id }, data: { status: "error", health: { ok: false, lastTestAt: new Date().toISOString(), error: message } } });
    return { ok: false, error: message, latencyMs: Date.now() - started };
  }
}

export async function checkSenderDomain(ctx: Ctx, id: string) {
  requirePermission(ctx, "senders.manage");
  const sender = await prisma.senderAccount.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { mailbox: true } });
  if (!sender?.mailbox?.domain) throw ApiError.notFound("sender");
  const provider = await providerForSender(ctx.workspaceId, sender);
  const report = await checkDomainAuth(sender.mailbox.domain, provider?.instance.getDomainStatus ? { getDomainStatus: (d) => provider.instance.getDomainStatus!(d) } : undefined);
  const verified = report.providerVerified === true || (report.spf.status === "pass" && report.dkim.status === "pass");
  await prisma.emailMailbox.update({ where: { id: sender.mailbox.id }, data: { domainAuth: report as unknown as Prisma.InputJsonValue, verificationState: verified ? "verified" : report.spf.status === "error" ? "stale" : "unverified" } });
  await audit(ctx, "sender.domain_checked", { type: "sender", id }, { domain: report.domain, spf: report.spf.status, dkim: report.dkim.status, dmarc: report.dmarc.status });
  return report;
}

export async function syncInboxNow(ctx: Ctx, id: string) {
  requirePermission(ctx, "senders.manage");
  const sender = await prisma.senderAccount.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!sender) throw ApiError.notFound("sender");
  return syncSenderInbox(ctx.workspaceId, id);
}

// ───────────────────────────── LinkedIn (authorized provider) ─────────────────────────────

async function linkedinProvider(ctx: Ctx, integrationId?: string) {
  const providers = await resolveProviders<LinkedInProvider & { createHostedAuthLink?(input: { successUrl: string; failureUrl: string; notifyUrl: string; name: string }): Promise<{ url: string }> }>(ctx.workspaceId, "linkedin.message");
  const p = integrationId ? providers.find((x) => x.integrationId === integrationId) : providers[0];
  if (!p) throw new ApiError("not_configured", "Add a LinkedIn provider (Unipile) under Integrations first.");
  return p;
}

/** Returns a hosted-auth URL where the member links their own LinkedIn. We never handle LinkedIn credentials. */
export async function createLinkedInConnectLink(ctx: Ctx, input?: { integrationId?: string }) {
  requirePermission(ctx, "senders.manage");
  const p = await linkedinProvider(ctx, input?.integrationId);
  const base = env().APP_BASE_URL;
  const slug = ctx.workspaceSlug || (await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } })).slug;
  if (p.descriptor.id === "mock") {
    const sender = await registerLinkedInSender(ctx.workspaceId, p.integrationId, { externalAccountId: `mock-li-${ctx.userId ?? "dev"}`, displayName: "Mock LinkedIn (dev)" }, ctx.userId);
    return { url: null, senderId: sender.id };
  }
  if (!p.instance.createHostedAuthLink || !p.integrationId) throw ApiError.invalid("This LinkedIn provider does not support hosted connection");
  const token = callbackToken(env().JWT_SECRET, "unipile-account", p.integrationId, ctx.workspaceId);
  const { url } = await p.instance.createHostedAuthLink({
    successUrl: `${base}/w/${slug}/integrations/senders?linkedin=connected`,
    failureUrl: `${base}/w/${slug}/integrations/senders?linkedin=failed`,
    notifyUrl: `${base}/api/webhooks/unipile/${p.integrationId}/account?token=${token}`,
    name: `${ctx.workspaceId}:${ctx.userId ?? ""}`,
  });
  await audit(ctx, "sender.linkedin_connect_started", { type: "integration", id: p.integrationId });
  return { url, senderId: null };
}

export async function registerLinkedInSender(workspaceId: string, integrationId: string | null, account: { externalAccountId: string; displayName: string; status?: "connected" | "disconnected" | "limited" }, ownerUserId?: string | null) {
  const existing = await prisma.senderAccount.findFirst({ where: { workspaceId, channel: "linkedin", externalAccountId: account.externalAccountId } });
  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });
  const limits = (settings?.defaultDailyLimits as { linkedinInvites?: number; linkedinMessages?: number } | null) ?? {};
  const integration = integrationId ? await prisma.integration.findUnique({ where: { id: integrationId } }) : null;
  const data = { displayName: account.displayName, status: account.status ?? "connected", integrationId: integrationId ?? undefined, provider: integration?.provider ?? "unipile", connectedAt: new Date() } as const;
  if (existing) return prisma.senderAccount.update({ where: { id: existing.id }, data });
  return prisma.senderAccount.create({
    data: { workspaceId, channel: "linkedin", ...data, externalAccountId: account.externalAccountId, ownerUserId: ownerUserId ?? undefined, timezone: settings?.timezone, limits: { invitesPerDay: Math.min(limits.linkedinInvites ?? 20, 30), messagesPerDay: limits.linkedinMessages ?? 50, warmup: [5, 7, 10, 15, 16, 20] } },
  });
}

/** Registers the provider's inbound webhooks (messages, account status) against this deployment. */
export async function registerLinkedInWebhooks(ctx: Ctx, input?: { integrationId?: string }) {
  requirePermission(ctx, "senders.manage");
  const p = await linkedinProvider(ctx, input?.integrationId);
  if (p.descriptor.id === "mock" || !p.integrationId) return { registered: false, reason: "Mock provider does not use webhooks" };
  const inst = p.instance as LinkedInProvider & { registerWebhooks?(input: { url: string; secret: string }): Promise<{ ids: string[] }> };
  if (!inst.registerWebhooks) return { registered: false, reason: "Provider does not support webhook registration" };
  const existing = await readCredentials<Record<string, string>>(p.integrationId);
  const secret = existing?.webhookSecret || `uwh_${randomBytes(24).toString("base64url")}`;
  const res = await inst.registerWebhooks({ url: `${env().APP_BASE_URL}/api/webhooks/unipile/${p.integrationId}`, secret });
  if (!existing?.webhookSecret) await patchCredentials(p.integrationId, { webhookSecret: secret });
  await audit(ctx, "sender.linkedin_webhooks_registered", { type: "integration", id: p.integrationId }, { ids: res.ids });
  return { registered: true, ids: res.ids };
}

/** Pull the provider's account list and reconcile sender rows. */
export async function syncLinkedInAccounts(ctx: Ctx) {
  requirePermission(ctx, "senders.manage");
  const providers = await resolveProviders<LinkedInProvider>(ctx.workspaceId, "linkedin.message");
  let synced = 0;
  for (const p of providers) {
    if (p.descriptor.id === "mock") continue;
    const accounts = await p.instance.listAccounts();
    for (const a of accounts) {
      await registerLinkedInSender(ctx.workspaceId, p.integrationId, { externalAccountId: a.externalAccountId, displayName: a.displayName, status: a.status }, null);
      synced++;
    }
  }
  await audit(ctx, "sender.linkedin_synced", { type: "workspace", id: ctx.workspaceId }, { synced });
  return { synced };
}

// ───────────────────────────── X ─────────────────────────────

export async function registerXSender(workspaceId: string, integrationId: string, account: { userId: string; handle: string }, ownerUserId?: string | null) {
  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });
  const limits = (settings?.defaultDailyLimits as { xDms?: number } | null) ?? {};
  const existing = await prisma.senderAccount.findFirst({ where: { workspaceId, channel: "x", externalAccountId: account.userId } });
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  const data = { displayName: `@${account.handle}`, handle: account.handle, status: "connected" as const, integrationId, provider: integration?.provider ?? "x_api", connectedAt: new Date() };
  if (existing) return prisma.senderAccount.update({ where: { id: existing.id }, data });
  return prisma.senderAccount.create({ data: { workspaceId, channel: "x" as SenderChannel, ...data, externalAccountId: account.userId, ownerUserId: ownerUserId ?? undefined, timezone: settings?.timezone, limits: { dmsPerDay: limits.xDms ?? 30 } } });
}

/** Queue inbox polls for every pollable sender in the workspace (manual trigger). */
export async function syncAllInboxes(ctx: Ctx) {
  requirePermission(ctx, "senders.manage");
  const senders = await prisma.senderAccount.findMany({ where: { workspaceId: ctx.workspaceId, status: "connected" }, select: { id: true } });
  for (const s of senders) await enqueue("inbox.sync", { workspaceId: ctx.workspaceId, senderAccountId: s.id }, { workspaceId: ctx.workspaceId });
  return { queued: senders.length };
}
