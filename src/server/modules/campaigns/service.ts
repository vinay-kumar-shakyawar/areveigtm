import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit, recordActivity } from "@/server/modules/audit/service";
import { createSequence, DEFAULT_TEMPLATES } from "@/server/modules/sequences/service";
import { CHANNEL_OF_KIND, sequenceInput, type StepKind } from "@/server/modules/sequences/schemas";

export const campaignInput = z.object({
  name: z.string().trim().min(1).max(120),
  objective: z.string().trim().max(1000).nullable().optional(),
  icpProfileId: z.string().uuid().nullable().optional(),
  channels: z.array(z.enum(["email", "linkedin", "x"])).min(1).default(["email"]),
  schedule: z.object({ startAt: z.string().datetime().nullable().optional(), endAt: z.string().datetime().nullable().optional(), sendingWindow: z.object({ days: z.array(z.number().int().min(0).max(6)), start: z.string(), end: z.string() }).nullable().optional() }).optional(),
  dailyLimits: z.object({ email: z.number().int().min(1).max(5000).optional(), linkedinInvites: z.number().int().min(1).max(30).optional(), linkedinMessages: z.number().int().min(1).max(100).optional(), xDms: z.number().int().min(1).max(100).optional() }).optional(),
  exclusions: z.object({ domains: z.array(z.string()).default([]), titles: z.array(z.string()).default([]), accountIds: z.array(z.string().uuid()).default([]) }).optional(),
  approvalMode: z.enum(["review_each_message", "approve_sequence_once"]).default("review_each_message"),
  signalCriteria: z.object({ eventTypes: z.array(z.string()).default([]), minRelevance: z.number().int().min(0).max(100).default(50) }).nullable().optional(),
  geography: z.array(z.string()).optional(),
  template: z.string().optional().describe("Key of a default sequence template to create alongside the campaign"),
});
export type CampaignInput = z.input<typeof campaignInput>;

export async function listCampaigns(ctx: Ctx) {
  requirePermission(ctx, "campaigns.read");
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { icpProfile: { select: { id: true, name: true } }, sequences: { select: { id: true, name: true, status: true } }, _count: { select: { campaignLeads: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const stats = await prisma.campaignLead.groupBy({ by: ["campaignId", "status"], where: { workspaceId: ctx.workspaceId }, _count: { _all: true } });
  return campaigns.map((c) => ({
    ...c,
    stats: Object.fromEntries(stats.filter((s) => s.campaignId === c.id).map((s) => [s.status, s._count._all])) as Record<string, number>,
  }));
}

export async function getCampaign(ctx: Ctx, id: string) {
  requirePermission(ctx, "campaigns.read");
  const campaign = await prisma.campaign.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      icpProfile: { select: { id: true, name: true } },
      sequences: { include: { steps: { orderBy: { index: "asc" } }, _count: { select: { campaignLeads: true } } }, orderBy: { createdAt: "asc" } },
      audiences: true,
    },
  });
  if (!campaign) throw ApiError.notFound("campaign");
  return campaign;
}

export async function campaignStats(ctx: Ctx, id: string) {
  const [byStatus, sent, replies, meetings, awaiting] = await Promise.all([
    prisma.campaignLead.groupBy({ by: ["status"], where: { campaignId: id, workspaceId: ctx.workspaceId }, _count: { _all: true } }),
    prisma.activityEvent.count({ where: { workspaceId: ctx.workspaceId, campaignId: id, action: "message.sent", outcome: "ok" } }),
    prisma.activityEvent.count({ where: { workspaceId: ctx.workspaceId, campaignId: id, action: "reply.received" } }),
    prisma.activityEvent.count({ where: { workspaceId: ctx.workspaceId, campaignId: id, action: "meeting.booked" } }),
    prisma.message.count({ where: { workspaceId: ctx.workspaceId, campaignLead: { campaignId: id }, status: "awaiting_approval" } }),
  ]);
  return { byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>, sent, replies, meetings, awaitingApproval: awaiting };
}

export async function createCampaign(ctx: Ctx, input: CampaignInput) {
  requirePermission(ctx, "campaigns.manage");
  const { template, ...rest } = campaignInput.parse(input);
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: rest.name,
      objective: rest.objective ?? null,
      icpProfileId: rest.icpProfileId ?? null,
      channels: rest.channels,
      schedule: (rest.schedule ?? undefined) as Prisma.InputJsonValue | undefined,
      dailyLimits: (rest.dailyLimits ?? undefined) as Prisma.InputJsonValue | undefined,
      exclusions: (rest.exclusions ?? undefined) as Prisma.InputJsonValue | undefined,
      approvalMode: rest.approvalMode,
      signalCriteria: (rest.signalCriteria ?? undefined) as Prisma.InputJsonValue | undefined,
      geography: rest.geography ?? [],
      createdByUserId: ctx.userId ?? ctx.workspaceId,
    },
  });
  if (template) {
    const t = DEFAULT_TEMPLATES.find((x) => x.key === template);
    if (t) {
      const steps = t.steps.filter((s) => CHANNEL_OF_KIND[s.kind as StepKind] === "none" || rest.channels.includes(CHANNEL_OF_KIND[s.kind as StepKind] as "email" | "linkedin" | "x"));
      if (steps.length) await createSequence(ctx, campaign.id, sequenceInput.parse({ name: t.name, executionModel: t.executionModel, steps }));
    }
  }
  await audit(ctx, "campaign.created", { type: "campaign", id: campaign.id }, { channels: rest.channels, template: template ?? null });
  return campaign;
}

export async function updateCampaign(ctx: Ctx, id: string, rawInput: Partial<CampaignInput>) {
  requirePermission(ctx, "campaigns.manage");
  const input = campaignInput.partial().parse(rawInput);
  const existing = await getCampaign(ctx, id);
  if (existing.status === "archived") throw ApiError.conflict("Archived campaigns are read-only.");
  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      name: input.name,
      objective: input.objective,
      icpProfileId: input.icpProfileId,
      channels: input.channels,
      schedule: (input.schedule ?? undefined) as Prisma.InputJsonValue | undefined,
      dailyLimits: (input.dailyLimits ?? undefined) as Prisma.InputJsonValue | undefined,
      exclusions: (input.exclusions ?? undefined) as Prisma.InputJsonValue | undefined,
      approvalMode: input.approvalMode,
      signalCriteria: (input.signalCriteria ?? undefined) as Prisma.InputJsonValue | undefined,
      geography: input.geography,
      revision: { increment: 1 },
    },
  });
  await audit(ctx, "campaign.updated", { type: "campaign", id }, { fields: Object.keys(input) });
  return campaign;
}

/** Activation requires an approved, active sequence. Senders are checked at dispatch time (missing → manual task). */
export async function setCampaignStatus(ctx: Ctx, id: string, status: "active" | "paused" | "completed" | "archived" | "draft") {
  requirePermission(ctx, "campaigns.activate");
  const campaign = await getCampaign(ctx, id);
  if (status === "active") {
    const ready = campaign.sequences.find((s) => s.approvedRevision === s.revision && ["approved", "active"].includes(s.status));
    if (!ready) throw ApiError.conflict("Approve a sequence for this campaign before activating it.", { code: "sequence_approval_required" });
    await prisma.campaignSequence.update({ where: { id: ready.id }, data: { status: "active" } });
    await prisma.campaignLead.updateMany({ where: { campaignId: id, status: "paused" }, data: { status: "active" } });
  }
  if (status === "paused" || status === "completed" || status === "archived") {
    await prisma.campaignLead.updateMany({ where: { campaignId: id, status: { in: ["active", "queued", "waiting_approval"] } }, data: status === "paused" ? { status: "paused" } : { status: "stopped", stopReason: "campaign_paused" } });
    await prisma.stepRun.updateMany({ where: { campaignLead: { campaignId: id }, status: { in: ["scheduled", "awaiting_approval", "approved"] } }, data: status === "paused" ? {} : { status: "cancelled" } });
  }
  const updated = await prisma.campaign.update({ where: { id }, data: { status, activatedAt: status === "active" ? (campaign.activatedAt ?? new Date()) : undefined, pausedAt: status === "paused" ? new Date() : null } });
  await audit(ctx, "campaign.status_changed", { type: "campaign", id }, { from: campaign.status, to: status });
  await recordActivity(ctx, { action: `campaign.${status}`, campaignId: id });
  return updated;
}

export const enrollInput = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(500),
  sequenceId: z.string().uuid().optional(),
  senderAccountId: z.string().uuid().nullable().optional(),
});

/**
 * Adds leads to a campaign. One enrolment per campaign per lead; a lead in another
 * active campaign is skipped unless the workspace allows concurrency. Suppressed
 * or opted-out contacts are never enrolled.
 */
export async function enrollLeads(ctx: Ctx, campaignId: string, input: z.infer<typeof enrollInput>) {
  requirePermission(ctx, "campaigns.manage");
  const campaign = await getCampaign(ctx, campaignId);
  if (campaign.status === "archived" || campaign.status === "completed") throw ApiError.conflict("This campaign is no longer accepting people.");
  const sequence = input.sequenceId ? campaign.sequences.find((s) => s.id === input.sequenceId) : campaign.sequences.find((s) => s.status !== "archived");
  if (!sequence) throw ApiError.invalid("Create a sequence for this campaign first.");
  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId: ctx.workspaceId } });
  const exclusions = (campaign.exclusions as { domains?: string[]; titles?: string[]; accountIds?: string[] } | null) ?? {};
  const leads = await prisma.lead.findMany({ where: { id: { in: input.leadIds }, workspaceId: ctx.workspaceId }, include: { contact: true, account: true, campaignLeads: { select: { campaignId: true, status: true } } } });
  const suppressions = await prisma.suppressionEntry.findMany({ where: { workspaceId: ctx.workspaceId }, select: { kind: true, value: true } });
  const suppressed = new Set(suppressions.map((s) => `${s.kind}:${s.value}`));
  const added: string[] = [];
  const skipped: { leadId: string; reason: string }[] = [];
  for (const lead of leads) {
    const c = lead.contact;
    if (lead.campaignLeads.some((cl) => cl.campaignId === campaignId)) {
      skipped.push({ leadId: lead.id, reason: "already in this campaign" });
      continue;
    }
    if (c.doNotContact || c.optedOutAt || lead.status === "unsubscribed") {
      skipped.push({ leadId: lead.id, reason: "opted out / do not contact" });
      continue;
    }
    if ((c.email && suppressed.has(`email:${c.email}`)) || (lead.account?.domain && suppressed.has(`domain:${lead.account.domain}`)) || (c.linkedinUrl && suppressed.has(`linkedin_url:${c.linkedinUrl}`))) {
      skipped.push({ leadId: lead.id, reason: "on suppression list" });
      continue;
    }
    if (lead.account?.domain && exclusions.domains?.includes(lead.account.domain)) {
      skipped.push({ leadId: lead.id, reason: "excluded domain" });
      continue;
    }
    if (exclusions.accountIds?.length && lead.accountId && exclusions.accountIds.includes(lead.accountId)) {
      skipped.push({ leadId: lead.id, reason: "excluded account" });
      continue;
    }
    if (exclusions.titles?.length && c.title && exclusions.titles.some((t) => c.title!.toLowerCase().includes(t.toLowerCase()))) {
      skipped.push({ leadId: lead.id, reason: "excluded title" });
      continue;
    }
    if (!settings?.allowConcurrentCampaigns && lead.campaignLeads.some((cl) => ["queued", "active", "waiting_approval", "waiting_input", "paused"].includes(cl.status))) {
      skipped.push({ leadId: lead.id, reason: "already active in another campaign" });
      continue;
    }
    const firstStep = sequence.steps[0];
    if (!firstStep) {
      skipped.push({ leadId: lead.id, reason: "sequence has no steps" });
      continue;
    }
    const hasChannel = channelAvailable(firstStep.kind as StepKind, c);
    await prisma.$transaction(async (tx) => {
      const cl = await tx.campaignLead.create({
        data: {
          workspaceId: ctx.workspaceId,
          campaignId,
          leadId: lead.id,
          sequenceId: sequence.id,
          sequenceRevision: sequence.revision,
          senderAccountId: input.senderAccountId ?? null,
          status: campaign.status === "active" ? "active" : "queued",
          currentStepIndex: 0,
          nextActionAt: new Date(),
          enrolledByUserId: ctx.userId,
        },
      });
      await tx.stepRun.create({
        data: {
          workspaceId: ctx.workspaceId,
          campaignLeadId: cl.id,
          stepIndex: 0,
          kind: firstStep.kind,
          status: hasChannel ? "scheduled" : "skipped",
          scheduledFor: new Date(),
          idempotencyKey: `${cl.id}:0:1`,
          error: hasChannel ? undefined : { message: "No identity for this channel" },
        },
      });
      await tx.lead.update({ where: { id: lead.id }, data: { status: "enrolled", stage: lead.stage === "discovered" || lead.stage === "reviewed" ? "enrolled" : undefined, lastActivityAt: new Date() } });
    });
    added.push(lead.id);
    await recordActivity(ctx, { action: "sequence.started", leadId: lead.id, contactId: c.id, campaignId, metadata: { sequenceId: sequence.id, revision: sequence.revision } });
  }
  await audit(ctx, "campaign.enrolled", { type: "campaign", id: campaignId }, { added: added.length, skipped: skipped.length });
  return { added, skipped };
}

export function channelAvailable(kind: StepKind, c: { email: string | null; linkedinUrl: string | null; xHandle: string | null }): boolean {
  const ch = CHANNEL_OF_KIND[kind];
  if (ch === "email") return Boolean(c.email);
  if (ch === "linkedin") return Boolean(c.linkedinUrl);
  if (ch === "x") return Boolean(c.xHandle);
  return true;
}

export async function stopEnrollment(ctx: Ctx, campaignLeadId: string, reason: "manual" | "replied" | "opted_out" | "not_interested" | "disqualified" | "invalid_contact" | "bounced" | "limit_reached" | "campaign_paused" = "manual") {
  requirePermission(ctx, "campaigns.manage");
  const cl = await prisma.campaignLead.findFirst({ where: { id: campaignLeadId, workspaceId: ctx.workspaceId } });
  if (!cl) throw ApiError.notFound("enrollment");
  if (["completed", "stopped"].includes(cl.status)) return cl;
  await prisma.$transaction([
    prisma.campaignLead.update({ where: { id: campaignLeadId }, data: { status: "stopped", stopReason: reason, completedAt: new Date() } }),
    prisma.stepRun.updateMany({ where: { campaignLeadId, status: { in: ["scheduled", "awaiting_approval", "approved", "generating", "manual_pending"] } }, data: { status: "cancelled" } }),
    prisma.message.updateMany({ where: { campaignLeadId, status: { in: ["draft", "awaiting_approval", "approved", "scheduled"] } }, data: { status: "rejected" } }),
    prisma.task.updateMany({ where: { campaignLeadId, status: "open" }, data: { status: "cancelled" } }),
  ]);
  await recordActivity(ctx, { action: "sequence.stopped", leadId: cl.leadId, campaignId: cl.campaignId, campaignLeadId, metadata: { reason } });
  return prisma.campaignLead.findUniqueOrThrow({ where: { id: campaignLeadId } });
}

/** Stops every active enrolment for a lead across campaigns (reply, unsubscribe, bounce). */
export async function stopAllForLead(ctx: Ctx, leadId: string, reason: Parameters<typeof stopEnrollment>[2]) {
  const active = await prisma.campaignLead.findMany({ where: { leadId, workspaceId: ctx.workspaceId, status: { in: ["queued", "active", "waiting_approval", "waiting_input", "paused"] } } });
  for (const cl of active) await stopEnrollment(ctx, cl.id, reason);
  return active.length;
}

export async function listEnrollments(ctx: Ctx, campaignId: string, options?: { status?: string; limit?: number }) {
  requirePermission(ctx, "campaigns.read");
  await getCampaign(ctx, campaignId);
  return prisma.campaignLead.findMany({
    where: { campaignId, ...(options?.status ? { status: options.status as never } : {}) },
    include: { lead: { include: { contact: { select: { fullName: true, title: true, email: true, linkedinUrl: true, xHandle: true, companyNameRaw: true } }, account: { select: { name: true } } } }, stepRuns: { orderBy: [{ stepIndex: "asc" }, { attempt: "desc" }] } },
    orderBy: { enrolledAt: "desc" },
    take: options?.limit ?? 200,
  });
}
