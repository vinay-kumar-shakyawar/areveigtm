import "server-only";
import { prisma } from "@/server/db/client";
import type { Ctx } from "@/server/auth/context";
import type { Channel, Outcome, Prisma } from "@prisma/client";

/** Audit log: who did what to which object. Never store secrets in metadata. */
export async function audit(
  ctx: Ctx,
  action: string,
  target?: { type: string; id?: string | null },
  metadata?: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      actorType: ctx.actorType,
      action,
      targetType: target?.type,
      targetId: target?.id ?? undefined,
      metadata,
    },
  });
}

export interface ActivityInput {
  action: string;
  outcome?: Outcome;
  leadId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  campaignLeadId?: string | null;
  conversationId?: string | null;
  senderAccountId?: string | null;
  channel?: Channel | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
}

/** Append-only activity ledger. All analytics derive from this table. */
export async function recordActivity(ctx: Ctx, input: ActivityInput) {
  return prisma.activityEvent.create({
    data: {
      workspaceId: ctx.workspaceId,
      action: input.action,
      outcome: input.outcome ?? "ok",
      actorType: ctx.actorType,
      actorUserId: ctx.userId,
      leadId: input.leadId ?? undefined,
      contactId: input.contactId ?? undefined,
      campaignId: input.campaignId ?? undefined,
      campaignLeadId: input.campaignLeadId ?? undefined,
      conversationId: input.conversationId ?? undefined,
      senderAccountId: input.senderAccountId ?? undefined,
      channel: input.channel ?? undefined,
      metadata: input.metadata,
      occurredAt: input.occurredAt,
    },
  });
}

export async function notify(
  ctx: Ctx,
  input: { userId?: string | null; type: string; title: string; body?: string; link?: string },
) {
  return prisma.notification.create({
    data: {
      workspaceId: ctx.workspaceId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    },
  });
}
