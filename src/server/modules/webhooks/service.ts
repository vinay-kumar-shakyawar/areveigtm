import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit } from "@/server/modules/audit/service";
import { open, seal, sealedToDb } from "@/server/vault";
import { defineJob, enqueue } from "@/server/jobs";
import { logger } from "@/server/logger";

/**
 * Outbound webhooks. Each subscription has its own signing secret (shown once).
 * Deliveries are signed `X-Arevei-Signature: t=<unix>,v1=<hex hmac-sha256(t + "." + body)>`
 * and retried with backoff until they succeed or give up after MAX_ATTEMPTS.
 */
export const WEBHOOK_EVENTS = [
  "message.sent",
  "message.delivered",
  "reply.received",
  "email.bounced",
  "email.complained",
  "lead.unsubscribed",
  "lead.status_changed",
  "campaign.status_changed",
  "meeting.booked",
  "task.created",
  "webhook.test",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const MAX_ATTEMPTS = 10;
/** Delay before attempt n+1 (seconds). PumpGTM-style 1s/4s/60s then longer. */
export const RETRY_DELAYS_SECONDS = [1, 4, 60, 300, 900, 1800, 3600, 7200, 14400];
const DISABLE_AFTER_CONSECUTIVE_FAILURES = 50;

export const subscriptionInput = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), "Must be an http(s) URL")
    .refine((u) => process.env.NODE_ENV !== "production" || u.startsWith("https://"), "Production webhooks must use https"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  enabled: z.boolean().optional(),
});

function view(s: { id: string; url: string; events: string[]; enabled: boolean; disabledAt: Date | null; failureCount: number; createdAt: Date; updatedAt: Date }) {
  return { id: s.id, url: s.url, events: s.events, enabled: s.enabled, disabledAt: s.disabledAt, failureCount: s.failureCount, createdAt: s.createdAt, updatedAt: s.updatedAt };
}

export async function listSubscriptions(ctx: Ctx) {
  requirePermission(ctx, "webhooks.manage");
  const rows = await prisma.webhookSubscription.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "asc" } });
  const stats = await prisma.webhookDelivery.groupBy({ by: ["subscriptionId", "status"], where: { workspaceId: ctx.workspaceId }, _count: { _all: true } });
  return rows.map((r) => ({ ...view(r), deliveries: Object.fromEntries(stats.filter((s) => s.subscriptionId === r.id).map((s) => [s.status, s._count._all])) }));
}

export async function createSubscription(ctx: Ctx, input: z.infer<typeof subscriptionInput>) {
  requirePermission(ctx, "webhooks.manage");
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const id = crypto.randomUUID();
  const sealed = sealedToDb(seal(secret, `webhook:${id}`));
  const row = await prisma.webhookSubscription.create({
    data: { id, workspaceId: ctx.workspaceId, url: input.url, events: input.events, enabled: input.enabled ?? true, secretCiphertext: sealed.ciphertext, secretIv: sealed.iv, secretAuthTag: sealed.authTag, createdByUserId: ctx.userId ?? undefined },
  });
  await audit(ctx, "webhook.created", { type: "webhook", id: row.id }, { url: input.url, events: input.events });
  return { ...view(row), secret };
}

export const updateSubscriptionInput = subscriptionInput.partial();

export async function updateSubscription(ctx: Ctx, id: string, input: z.infer<typeof updateSubscriptionInput>) {
  requirePermission(ctx, "webhooks.manage");
  const existing = await prisma.webhookSubscription.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!existing) throw ApiError.notFound("webhook");
  const row = await prisma.webhookSubscription.update({
    where: { id },
    data: { url: input.url, events: input.events, enabled: input.enabled, ...(input.enabled ? { disabledAt: null, failureCount: 0 } : {}) },
  });
  await audit(ctx, "webhook.updated", { type: "webhook", id });
  return view(row);
}

export async function rotateSecret(ctx: Ctx, id: string) {
  requirePermission(ctx, "webhooks.manage");
  const existing = await prisma.webhookSubscription.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!existing) throw ApiError.notFound("webhook");
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const sealed = sealedToDb(seal(secret, `webhook:${id}`));
  await prisma.webhookSubscription.update({ where: { id }, data: { secretCiphertext: sealed.ciphertext, secretIv: sealed.iv, secretAuthTag: sealed.authTag } });
  await audit(ctx, "webhook.secret_rotated", { type: "webhook", id });
  return { secret };
}

export async function deleteSubscription(ctx: Ctx, id: string) {
  requirePermission(ctx, "webhooks.manage");
  const existing = await prisma.webhookSubscription.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!existing) throw ApiError.notFound("webhook");
  await prisma.webhookSubscription.delete({ where: { id } });
  await audit(ctx, "webhook.deleted", { type: "webhook", id });
}

export async function listDeliveries(ctx: Ctx, subscriptionId: string, limit = 50) {
  requirePermission(ctx, "webhooks.manage");
  const sub = await prisma.webhookSubscription.findFirst({ where: { id: subscriptionId, workspaceId: ctx.workspaceId } });
  if (!sub) throw ApiError.notFound("webhook");
  return prisma.webhookDelivery.findMany({
    where: { subscriptionId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, eventId: true, event: true, attempt: true, status: true, responseStatus: true, nextAttemptAt: true, lastError: true, createdAt: true, updatedAt: true },
  });
}

/** Signs a payload the way deliveries are signed. Exported for tests and docs. */
export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Verifies an `X-Arevei-Signature` header (receiver side). Tolerance in seconds. */
export function verifySignature(secret: string, header: string | null, body: string, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = signPayload(secret, t, body);
  const got = parts.v1 ?? "";
  return got.length === expected.length && timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

/**
 * Fan an event out to every enabled subscription in the workspace. Never throws:
 * webhook failures must not break the business operation that emitted them.
 */
export async function emitWebhook(workspaceId: string, event: WebhookEvent, data: Record<string, unknown>, options?: { onlySubscriptionId?: string }) {
  try {
    const subs = await prisma.webhookSubscription.findMany({ where: { workspaceId, enabled: true, disabledAt: null, ...(options?.onlySubscriptionId ? { id: options.onlySubscriptionId } : {}) } });
    const targets = subs.filter((s) => options?.onlySubscriptionId || s.events.includes(event));
    if (targets.length === 0) return [];
    const eventId = `evt_${nanoid(20)}`;
    const createdAt = new Date().toISOString();
    const out: string[] = [];
    for (const sub of targets) {
      const payload = { id: eventId, event, createdAt, workspaceId, data };
      const d = await prisma.webhookDelivery.create({ data: { workspaceId, subscriptionId: sub.id, eventId, event, payload: payload as Prisma.InputJsonValue, status: "pending", nextAttemptAt: new Date() } });
      out.push(d.id);
      await enqueue("webhook.deliver", { deliveryId: d.id }, { workspaceId });
    }
    return out;
  } catch (err) {
    logger.error({ err, workspaceId, event }, "webhook emit failed");
    return [];
  }
}

export async function testSubscription(ctx: Ctx, id: string) {
  requirePermission(ctx, "webhooks.manage");
  const sub = await prisma.webhookSubscription.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!sub) throw ApiError.notFound("webhook");
  const [deliveryId] = await emitWebhook(ctx.workspaceId, "webhook.test", { message: "Hello from AREVEI GTM", sentBy: ctx.userId }, { onlySubscriptionId: id });
  const delivery = deliveryId ? await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } }) : null;
  return delivery ? { id: delivery.id, status: delivery.status, responseStatus: delivery.responseStatus, lastError: delivery.lastError } : null;
}

/** Attempt one delivery now. Returns the final row. */
export async function deliver(deliveryId: string) {
  const d = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { subscription: true } });
  if (!d || d.status === "delivered" || d.status === "gave_up") return d;
  const sub = d.subscription;
  if (!sub.enabled || sub.disabledAt) {
    return prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: "gave_up", lastError: "Subscription disabled" } });
  }
  const secret = open({ ciphertext: Buffer.from(sub.secretCiphertext), iv: Buffer.from(sub.secretIv), authTag: Buffer.from(sub.secretAuthTag), keyVersion: 1 }, `webhook:${sub.id}`);
  const body = JSON.stringify(d.payload);
  const t = Math.floor(Date.now() / 1000);
  let responseStatus: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AREVEI-GTM-Webhooks/1.0",
        "X-Arevei-Event": d.event,
        "X-Arevei-Delivery": d.id,
        "X-Arevei-Event-Id": d.eventId,
        "X-Arevei-Signature": `t=${t},v1=${signPayload(secret, t, body)}`,
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    responseStatus = res.status;
    if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
  } catch (err) {
    error = (err as Error).message;
  }
  if (!error) {
    await prisma.webhookSubscription.update({ where: { id: sub.id }, data: { failureCount: 0 } });
    return prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: "delivered", responseStatus, lastError: null, nextAttemptAt: null } });
  }
  const failures = sub.failureCount + 1;
  await prisma.webhookSubscription.update({ where: { id: sub.id }, data: { failureCount: failures, ...(failures >= DISABLE_AFTER_CONSECUTIVE_FAILURES ? { enabled: false, disabledAt: new Date() } : {}) } });
  if (d.attempt >= MAX_ATTEMPTS) {
    return prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: "gave_up", responseStatus, lastError: error, nextAttemptAt: null } });
  }
  const delay = RETRY_DELAYS_SECONDS[Math.min(d.attempt - 1, RETRY_DELAYS_SECONDS.length - 1)];
  const next = await prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: "pending", attempt: d.attempt + 1, responseStatus, lastError: error, nextAttemptAt: new Date(Date.now() + delay * 1000) } });
  if (process.env.JOBS_BACKEND === "pgboss" || process.env.NODE_ENV === "production") {
    await enqueue("webhook.deliver", { deliveryId: d.id }, { workspaceId: d.workspaceId, startAfterSeconds: delay }).catch(() => {});
  }
  return next;
}

/** Retry every delivery whose next attempt is due. Scheduled by the worker each minute. */
export async function flushDue(now = new Date()) {
  const due = await prisma.webhookDelivery.findMany({ where: { status: "pending", nextAttemptAt: { lte: now } }, select: { id: true }, take: 200 });
  for (const d of due) await deliver(d.id);
  return due.length;
}

defineJob<{ deliveryId: string }>("webhook.deliver", async ({ deliveryId }) => {
  await deliver(deliveryId);
}, { retryLimit: 0 });

defineJob("webhook.flush", async () => {
  await flushDue();
});
