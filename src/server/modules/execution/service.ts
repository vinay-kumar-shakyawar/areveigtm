import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { jobCtx, requirePermission, type Ctx } from "@/server/auth/context";
import { recordActivity, notify } from "@/server/modules/audit/service";
import { defineJob, enqueue } from "@/server/jobs";
import { CHANNEL_OF_KIND, type StepKind } from "@/server/modules/sequences/schemas";
import { generateMessage } from "@/server/modules/messaging/service";
import { channelAvailable } from "@/server/modules/campaigns/service";
import { sendEmailMessage } from "@/server/modules/channels/email";
import { sendLinkedInMessage } from "@/server/modules/channels/linkedin";
import { sendXMessage } from "@/server/modules/channels/x";
import { emitWebhook } from "@/server/modules/webhooks/service";
import { logger } from "@/server/logger";

/**
 * Execution engine. `tick` claims due step runs for a workspace and advances
 * them: generate → (approve) → dispatch → schedule next. Everything is
 * idempotent on StepRun.idempotencyKey; sends are guarded by message status.
 */
export const tickJob = defineJob<{ workspaceId: string; limit?: number }>("campaign.tick", async ({ workspaceId, limit }) => {
  await tick(jobCtx(workspaceId), { limit: limit ?? 50 });
}, { retryLimit: 0, singletonKey: (p) => `tick:${p.workspaceId}` });

export async function requestTick(ctx: Ctx) {
  requirePermission(ctx, "campaigns.manage");
  return enqueue("campaign.tick", { workspaceId: ctx.workspaceId }, { workspaceId: ctx.workspaceId });
}

export interface TickResult {
  claimed: number;
  generated: number;
  awaiting: number;
  sent: number;
  manual: number;
  skipped: number;
  failed: number;
  deferred: number;
}

export async function tick(ctx: Ctx, options?: { limit?: number; now?: Date }): Promise<TickResult> {
  const now = options?.now ?? new Date();
  const result: TickResult = { claimed: 0, generated: 0, awaiting: 0, sent: 0, manual: 0, skipped: 0, failed: 0, deferred: 0 };
  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId: ctx.workspaceId } });
  const window = (settings?.sendingWindow as { days: number[]; start: string; end: string } | null) ?? { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" };
  const tz = settings?.timezone ?? "UTC";

  const due = await prisma.stepRun.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      status: { in: ["scheduled", "approved"] },
      scheduledFor: { lte: now },
      campaignLead: { status: { in: ["active", "queued", "waiting_approval"] }, campaign: { status: "active" }, sequence: { status: "active" } },
    },
    include: { campaignLead: { include: { campaign: true, sequence: { include: { steps: { orderBy: { index: "asc" } } } }, lead: { include: { contact: true, account: true } }, senderAccount: true } }, message: true },
    orderBy: [{ campaignLead: { priority: "desc" } }, { scheduledFor: "asc" }],
    take: options?.limit ?? 50,
  });
  result.claimed = due.length;

  for (const run of due) {
    const cl = run.campaignLead;
    const step = cl.sequence.steps[run.stepIndex];
    try {
      if (!step) {
        await completeEnrollment(ctx, cl.id);
        continue;
      }
      const kind = step.kind as StepKind;
      const channel = CHANNEL_OF_KIND[kind];
      const contact = cl.lead.contact;

      // Stop conditions evaluated at every step.
      if (contact.doNotContact || contact.optedOutAt || cl.lead.status === "unsubscribed" || cl.lead.status === "not_interested" || cl.lead.status === "disqualified") {
        await stopRun(ctx, run.id, cl.id, contact.optedOutAt ? "opted_out" : cl.lead.status === "not_interested" ? "not_interested" : "disqualified");
        result.skipped++;
        continue;
      }
      if (await hasInboundReply(cl.id) && stopOnReply(cl.sequence.stopRules)) {
        await stopRun(ctx, run.id, cl.id, "replied");
        result.skipped++;
        continue;
      }
      // Conditional steps.
      if (step.condition && !(await conditionMet(step.condition, cl.id, contact))) {
        await prisma.stepRun.update({ where: { id: run.id }, data: { status: "skipped", error: { message: `condition ${step.condition} not met` } } });
        await scheduleNext(ctx, cl.id, run.stepIndex, cl.sequence.steps, now);
        result.skipped++;
        continue;
      }
      if (!channelAvailable(kind, contact)) {
        await prisma.stepRun.update({ where: { id: run.id }, data: { status: "skipped", error: { message: `no ${channel} identity` } } });
        await recordActivity(ctx, { action: "step.skipped", leadId: cl.leadId, campaignId: cl.campaignId, campaignLeadId: cl.id, channel: channel === "none" ? undefined : channel, outcome: "skipped", metadata: { stepIndex: run.stepIndex, reason: "no_identity" } });
        await scheduleNext(ctx, cl.id, run.stepIndex, cl.sequence.steps, now);
        result.skipped++;
        continue;
      }
      // Sending window (workspace level; campaign override wins).
      const campaignWindow = (cl.campaign.schedule as { sendingWindow?: { days: number[]; start: string; end: string } | null } | null)?.sendingWindow ?? null;
      if (channel !== "none" && !inSendingWindow(now, tz, campaignWindow ?? window)) {
        await prisma.stepRun.update({ where: { id: run.id }, data: { scheduledFor: nextWindowStart(now, tz, campaignWindow ?? window) } });
        result.deferred++;
        continue;
      }

      // Steps that are never automated.
      if (kind === "wait" || kind === "branch") {
        await prisma.stepRun.update({ where: { id: run.id }, data: { status: "sent" } });
        await scheduleNext(ctx, cl.id, run.stepIndex, cl.sequence.steps, now);
        continue;
      }
      if (kind === "manual_task" || kind === "linkedin_engage" || kind === "x_engage") {
        await createManualTask(ctx, run.id, cl.id, cl.leadId, kind, (step.requiresInput as { instructions?: string } | null)?.instructions ?? `${kind.replace(/_/g, " ")} for ${contact.fullName}`);
        result.manual++;
        continue;
      }

      // Message steps: generate if needed, then approval gate, then dispatch.
      let message = run.message;
      if (!message) {
        await prisma.stepRun.update({ where: { id: run.id }, data: { status: "generating" } });
        message = await generateMessage(ctx, cl.id, run.stepIndex);
        await prisma.stepRun.update({ where: { id: run.id }, data: { messageId: message.id, status: message.status === "approved" ? "approved" : "awaiting_approval" } });
        result.generated++;
        if (message.status !== "approved") {
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "waiting_approval" } });
          result.awaiting++;
          continue;
        }
      }
      if (message.status === "awaiting_approval" || message.status === "draft") {
        result.awaiting++;
        continue;
      }
      if (message.status !== "approved") {
        await prisma.stepRun.update({ where: { id: run.id }, data: { status: "cancelled" } });
        result.skipped++;
        continue;
      }
      // Daily limits per sender / workspace.
      const limitHit = await dailyLimitReached(ctx.workspaceId, cl.campaign.dailyLimits as Record<string, number> | null, settings?.defaultDailyLimits as Record<string, number> | null, kind, cl.senderAccountId, now);
      if (limitHit) {
        await prisma.stepRun.update({ where: { id: run.id }, data: { scheduledFor: nextWindowStart(new Date(now.getTime() + 60_000), tz, campaignWindow ?? window, true) } });
        result.deferred++;
        continue;
      }
      await prisma.stepRun.update({ where: { id: run.id }, data: { status: "sending" } });
      const outcome = await dispatch(ctx, kind, message.id, cl.senderAccountId, run.id);
      if (outcome === "sent") {
        await prisma.stepRun.update({ where: { id: run.id }, data: { status: "sent" } });
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "active" } });
        await scheduleNext(ctx, cl.id, run.stepIndex, cl.sequence.steps, now, kind === "linkedin_connect");
        result.sent++;
      } else if (outcome === "manual") {
        result.manual++;
      } else {
        result.failed++;
      }
    } catch (err) {
      logger.error({ err, stepRunId: run.id }, "step run failed");
      result.failed++;
      await prisma.stepRun.update({ where: { id: run.id }, data: { status: "failed", error: { message: (err as Error).message } } }).catch(() => {});
      await recordActivity(ctx, { action: "step.failed", outcome: "failed", leadId: cl.leadId, campaignId: cl.campaignId, campaignLeadId: cl.id, metadata: { stepIndex: run.stepIndex, error: (err as Error).message } });
    }
  }
  return result;
}

type DispatchOutcome = "sent" | "manual" | "failed";

async function dispatch(ctx: Ctx, kind: StepKind, messageId: string, senderAccountId: string | null, stepRunId: string): Promise<DispatchOutcome> {
  const channel = CHANNEL_OF_KIND[kind];
  const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: { lead: { include: { contact: true } }, campaignLead: true } });
  if (message.status === "sent" || message.status === "delivered") return "sent"; // idempotent retry
  const sender = senderAccountId ? await prisma.senderAccount.findUnique({ where: { id: senderAccountId }, include: { mailbox: true } }) : await prisma.senderAccount.findFirst({ where: { workspaceId: ctx.workspaceId, channel: channel === "none" ? "email" : channel, status: "connected" }, include: { mailbox: true }, orderBy: { createdAt: "asc" } });
  try {
    let res: { providerMessageId: string; threadKey?: string } | { manual: true };
    if (channel === "email") res = await sendEmailMessage(ctx, message, sender);
    else if (channel === "linkedin") res = await sendLinkedInMessage(ctx, message, sender, kind);
    else if (channel === "x") res = await sendXMessage(ctx, message, sender);
    else res = { manual: true };
    if ("manual" in res) {
      await createManualTask(ctx, stepRunId, message.campaignLeadId!, message.leadId!, kind, `Send this ${channel} message manually to ${message.lead?.contact.fullName}:\n\n${message.subject ? `Subject: ${message.subject}\n\n` : ""}${message.body}`, messageId);
      return "manual";
    }
    await prisma.message.update({ where: { id: messageId }, data: { status: "sent", sentAt: new Date(), providerMessageId: res.providerMessageId, threadKey: res.threadKey ?? message.threadKey, senderAccountId: sender?.id ?? message.senderAccountId } });
    await recordActivity(ctx, { action: kind === "linkedin_connect" ? "invite.sent" : "message.sent", leadId: message.leadId, contactId: message.lead?.contactId, campaignId: message.campaignLead?.campaignId, campaignLeadId: message.campaignLeadId, senderAccountId: sender?.id, channel: message.channel, metadata: { messageId, provider: sender?.provider ?? null } });
    await prisma.lead.update({ where: { id: message.leadId! }, data: { stage: await bumpStage(message.leadId!, kind), lastActivityAt: new Date() } });
    await emitWebhook(ctx.workspaceId, "message.sent", { messageId, leadId: message.leadId, campaignId: message.campaignLead?.campaignId ?? null, channel: message.channel, kind, providerMessageId: res.providerMessageId });
    return "sent";
  } catch (err) {
    await prisma.message.update({ where: { id: messageId }, data: { status: "failed", error: { message: (err as Error).message } } });
    await prisma.stepRun.update({ where: { id: stepRunId }, data: { status: "failed", error: { message: (err as Error).message } } });
    await recordActivity(ctx, { action: "message.failed", outcome: "failed", leadId: message.leadId, campaignId: message.campaignLead?.campaignId, campaignLeadId: message.campaignLeadId, channel: message.channel, metadata: { messageId, error: (err as Error).message } });
    return "failed";
  }
}

async function bumpStage(leadId: string, kind: StepKind) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const order = ["discovered", "reviewed", "enrolled", "contacted", "connected", "messaged", "replied", "qualified", "meeting_booked"];
  const target = kind === "linkedin_connect" ? "contacted" : "messaged";
  return order.indexOf(lead.stage) >= order.indexOf(target) ? lead.stage : (target as typeof lead.stage);
}

async function createManualTask(ctx: Ctx, stepRunId: string, campaignLeadId: string, leadId: string, kind: StepKind, instructions: string, messageId?: string) {
  const channel = CHANNEL_OF_KIND[kind];
  const cl = await prisma.campaignLead.findUniqueOrThrow({ where: { id: campaignLeadId }, include: { lead: { include: { contact: true } } } });
  await prisma.stepRun.update({ where: { id: stepRunId }, data: { status: "manual_pending", messageId: messageId ?? undefined } });
  await prisma.campaignLead.update({ where: { id: campaignLeadId }, data: { status: "waiting_input" } });
  const task = await prisma.task.create({
    data: {
      workspaceId: ctx.workspaceId,
      leadId,
      campaignLeadId,
      stepRunId,
      kind: channel === "linkedin" ? "manual_linkedin_action" : channel === "x" ? "manual_x_action" : "custom",
      title: `${kind.replace(/_/g, " ")}: ${cl.lead.contact.fullName}`,
      instructions,
      dueAt: new Date(),
      assignedUserId: cl.lead.ownerUserId ?? cl.enrolledByUserId ?? undefined,
    },
  });
  await notify(ctx, { userId: task.assignedUserId, type: "task", title: `Manual step: ${task.title}`, body: "No authorized integration can perform this step automatically.", link: `/w/${ctx.workspaceSlug}/leads/${leadId}` });
  await recordActivity(ctx, { action: "task.created", leadId, campaignLeadId, channel: channel === "none" ? undefined : channel, metadata: { taskId: task.id, kind } });
  return task;
}

/** Marking a manual task done advances the sequence as if the step was sent. */
export async function completeTask(ctx: Ctx, taskId: string) {
  requirePermission(ctx, "campaigns.manage");
  const task = await prisma.task.findFirst({ where: { id: taskId, workspaceId: ctx.workspaceId }, include: { stepRun: { include: { campaignLead: { include: { sequence: { include: { steps: { orderBy: { index: "asc" } } } } } }, message: true } } } });
  if (!task) throw new Error("task not found");
  await prisma.task.update({ where: { id: taskId }, data: { status: "done", completedAt: new Date() } });
  if (task.stepRun) {
    await prisma.stepRun.update({ where: { id: task.stepRun.id }, data: { status: "manual_done" } });
    if (task.stepRun.message) await prisma.message.update({ where: { id: task.stepRun.message.id }, data: { status: "sent", sentAt: new Date() } });
    const cl = task.stepRun.campaignLead;
    await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "active" } });
    await recordActivity(ctx, { action: task.stepRun.kind === "linkedin_connect" ? "invite.sent" : "message.sent", leadId: task.leadId, campaignLeadId: cl.id, campaignId: cl.campaignId, channel: CHANNEL_OF_KIND[task.stepRun.kind as StepKind] === "none" ? undefined : (CHANNEL_OF_KIND[task.stepRun.kind as StepKind] as "email" | "linkedin" | "x"), metadata: { manual: true, taskId } });
    await scheduleNext(ctx, cl.id, task.stepRun.stepIndex, cl.sequence.steps, new Date(), task.stepRun.kind === "linkedin_connect");
  }
}

async function scheduleNext(ctx: Ctx, campaignLeadId: string, currentIndex: number, steps: { index: number; delayDays: number; kind: string }[], now: Date, waitForAcceptance = false) {
  const next = steps[currentIndex + 1];
  if (!next) {
    await completeEnrollment(ctx, campaignLeadId);
    return;
  }
  const scheduledFor = new Date(now.getTime() + next.delayDays * 86400_000);
  await prisma.campaignLead.update({ where: { id: campaignLeadId }, data: { currentStepIndex: next.index, nextActionAt: scheduledFor, status: "active" } });
  await prisma.stepRun.upsert({
    where: { idempotencyKey: `${campaignLeadId}:${next.index}:1` },
    update: {},
    create: {
      workspaceId: ctx.workspaceId,
      campaignLeadId,
      stepIndex: next.index,
      kind: next.kind as StepKind,
      status: "scheduled",
      scheduledFor,
      idempotencyKey: `${campaignLeadId}:${next.index}:1`,
      ...(waitForAcceptance && next.kind === "linkedin_message" ? { error: { note: "waits for connection acceptance" } as Prisma.InputJsonValue } : {}),
    },
  });
}

async function completeEnrollment(ctx: Ctx, campaignLeadId: string) {
  const cl = await prisma.campaignLead.update({ where: { id: campaignLeadId }, data: { status: "completed", completedAt: new Date(), nextActionAt: null } });
  await recordActivity(ctx, { action: "sequence.completed", leadId: cl.leadId, campaignId: cl.campaignId, campaignLeadId });
}

async function stopRun(ctx: Ctx, stepRunId: string, campaignLeadId: string, reason: "replied" | "opted_out" | "not_interested" | "disqualified") {
  await prisma.stepRun.update({ where: { id: stepRunId }, data: { status: "cancelled" } });
  const cl = await prisma.campaignLead.update({ where: { id: campaignLeadId }, data: { status: "stopped", stopReason: reason, completedAt: new Date() } });
  await recordActivity(ctx, { action: "sequence.stopped", leadId: cl.leadId, campaignId: cl.campaignId, campaignLeadId, metadata: { reason } });
}

async function hasInboundReply(campaignLeadId: string) {
  const cl = await prisma.campaignLead.findUniqueOrThrow({ where: { id: campaignLeadId } });
  const count = await prisma.message.count({ where: { leadId: cl.leadId, direction: "inbound", receivedAt: { gte: cl.enrolledAt } } });
  return count > 0;
}

function stopOnReply(rules: unknown) {
  return (rules as { onReply?: boolean } | null)?.onReply !== false;
}

async function conditionMet(condition: string, campaignLeadId: string, contact: { email: string | null; linkedinUrl: string | null; xHandle: string | null }) {
  switch (condition) {
    case "has_email":
      return Boolean(contact.email);
    case "has_linkedin":
      return Boolean(contact.linkedinUrl);
    case "has_x":
      return Boolean(contact.xHandle);
    case "linkedin_accepted": {
      const cl = await prisma.campaignLead.findUniqueOrThrow({ where: { id: campaignLeadId } });
      return (await prisma.activityEvent.count({ where: { leadId: cl.leadId, action: "invite.accepted" } })) > 0;
    }
    case "x_followed_back": {
      const cl = await prisma.campaignLead.findUniqueOrThrow({ where: { id: campaignLeadId } });
      return (await prisma.activityEvent.count({ where: { leadId: cl.leadId, action: "x.followed_back" } })) > 0;
    }
    default:
      return true;
  }
}

async function dailyLimitReached(workspaceId: string, campaignLimits: Record<string, number> | null, defaults: Record<string, number> | null, kind: StepKind, senderAccountId: string | null, now: Date) {
  const key = kind === "email" ? "email" : kind === "linkedin_connect" ? "linkedinInvites" : CHANNEL_OF_KIND[kind] === "linkedin" ? "linkedinMessages" : CHANNEL_OF_KIND[kind] === "x" ? "xDms" : null;
  if (!key) return false;
  const limit = campaignLimits?.[key] ?? defaults?.[key] ?? (key === "linkedinInvites" ? 20 : key === "email" ? 40 : 50);
  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  const action = kind === "linkedin_connect" ? "invite.sent" : "message.sent";
  const channel = CHANNEL_OF_KIND[kind] as "email" | "linkedin" | "x";
  const count = await prisma.activityEvent.count({ where: { workspaceId, action, channel, occurredAt: { gte: since }, ...(senderAccountId ? { senderAccountId } : {}) } });
  return count >= limit;
}

export function inSendingWindow(now: Date, timeZone: string, window: { days: number[]; start: string; end: string }): boolean {
  const local = localParts(now, timeZone);
  if (!window.days.includes(local.day)) return false;
  const minutes = local.hour * 60 + local.minute;
  return minutes >= toMinutes(window.start) && minutes < toMinutes(window.end);
}

export function nextWindowStart(now: Date, timeZone: string, window: { days: number[]; start: string; end: string }, afterNow = false): Date {
  // Walk forward in 30-minute steps until inside the window (max 8 days).
  const step = 30 * 60_000;
  let t = new Date(Math.ceil((now.getTime() + (afterNow ? step : 0)) / step) * step);
  for (let i = 0; i < (8 * 24 * 60) / 30; i++) {
    if (inSendingWindow(t, timeZone, window)) return t;
    t = new Date(t.getTime() + step);
  }
  return t;
}

function localParts(d: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { day: days.indexOf(parts.weekday), hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
