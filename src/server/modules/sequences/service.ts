import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit } from "@/server/modules/audit/service";
import { sequenceInput, validateSteps, type SequenceInput, type StepInput, type StepInputRaw } from "@/server/modules/sequences/schemas";

export async function listSequences(ctx: Ctx, options?: { campaignId?: string; templatesOnly?: boolean }) {
  requirePermission(ctx, "campaigns.read");
  return prisma.campaignSequence.findMany({
    where: { workspaceId: ctx.workspaceId, ...(options?.campaignId ? { campaignId: options.campaignId } : {}), ...(options?.templatesOnly ? { isTemplate: true } : {}) },
    include: { steps: { orderBy: { index: "asc" } }, _count: { select: { campaignLeads: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSequence(ctx: Ctx, id: string) {
  requirePermission(ctx, "campaigns.read");
  const seq = await prisma.campaignSequence.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { steps: { orderBy: { index: "asc" } }, _count: { select: { campaignLeads: true } } } });
  if (!seq) throw ApiError.notFound("sequence");
  return seq;
}

function stepData(s: StepInput, index: number): Prisma.SequenceStepCreateWithoutSequenceInput {
  return {
    index,
    kind: s.kind,
    delayDays: s.delayDays,
    subject: s.subject ?? null,
    bodyTemplate: s.bodyTemplate ?? null,
    variants: (s.variants ?? undefined) as Prisma.InputJsonValue | undefined,
    condition: s.condition ?? null,
    actions: (s.actions ?? undefined) as Prisma.InputJsonValue | undefined,
    aiGeneration: (s.aiGeneration ?? { enabled: true, tone: "plain", length: "short" }) as Prisma.InputJsonValue,
    requiresInput: s.manualInstructions ? ({ instructions: s.manualInstructions } as Prisma.InputJsonValue) : undefined,
  };
}

export async function createSequence(ctx: Ctx, campaignId: string | null, input: SequenceInput) {
  requirePermission(ctx, "campaigns.manage");
  const parsed = sequenceInput.parse(input);
  const errors = validateSteps(parsed.steps, parsed.executionModel);
  if (errors.length) throw ApiError.invalid(errors.join(" "), { errors });
  if (campaignId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId: ctx.workspaceId } });
    if (!campaign) throw ApiError.notFound("campaign");
  }
  const seq = await prisma.campaignSequence.create({
    data: {
      workspaceId: ctx.workspaceId,
      campaignId,
      name: parsed.name,
      executionModel: parsed.executionModel,
      isTemplate: parsed.isTemplate ?? false,
      stopRules: parsed.stopRules ?? { onReply: true, onOptOut: true, onBounce: true, onInvalidContact: true },
      emailSettings: (parsed.emailSettings ?? undefined) as Prisma.InputJsonValue | undefined,
      steps: { create: parsed.steps.map(stepData) },
    },
    include: { steps: { orderBy: { index: "asc" } }, _count: { select: { campaignLeads: true } } },
  });
  await audit(ctx, "sequence.created", { type: "sequence", id: seq.id }, { campaignId, steps: parsed.steps.length });
  return seq;
}

/**
 * Replaces the steps as a new revision. Approval is invalidated; an active
 * sequence drops back to draft unless content for steps people already
 * received is unchanged (then it keeps running).
 */
export async function updateSequence(ctx: Ctx, id: string, input: SequenceInput, expectedRevision: number) {
  requirePermission(ctx, "campaigns.manage");
  const existing = await getSequence(ctx, id);
  if (existing.status === "archived") throw ApiError.conflict("Archived sequences are read-only.");
  if (existing.revision !== expectedRevision) throw new ApiError("revision_conflict", "This sequence changed since you loaded it. Reload and try again.", { details: { currentRevision: existing.revision } });
  const parsed = sequenceInput.parse(input);
  const errors = validateSteps(parsed.steps, parsed.executionModel);
  if (errors.length) throw ApiError.invalid(errors.join(" "), { errors });

  const progressed = await prisma.campaignLead.findMany({ where: { sequenceId: id, currentStepIndex: { gt: 0 } }, select: { currentStepIndex: true } });
  const maxReached = progressed.reduce((m, cl) => Math.max(m, cl.currentStepIndex), -1);
  if (maxReached >= 0) {
    if (parsed.executionModel !== existing.executionModel) throw ApiError.conflict("People are already moving through this sequence; the execution model cannot change. Save as a new sequence instead.");
    for (let i = 0; i <= Math.min(maxReached, existing.steps.length - 1); i++) {
      const before = existing.steps[i];
      const after = parsed.steps[i];
      if (!after || after.kind !== before.kind || (after.bodyTemplate ?? null) !== (before.bodyTemplate ?? null) || (after.subject ?? null) !== (before.subject ?? null)) {
        throw ApiError.conflict(`Step ${i + 1} was already sent to some people and cannot change. Save your edits as a new sequence for untouched leads.`, { step: i + 1, suggestion: "save_as_new" });
      }
    }
  }
  const seq = await prisma.$transaction(async (tx) => {
    await tx.sequenceStep.deleteMany({ where: { sequenceId: id } });
    return tx.campaignSequence.update({
      where: { id },
      data: {
        name: parsed.name,
        executionModel: parsed.executionModel,
        stopRules: parsed.stopRules ?? (existing.stopRules as Prisma.InputJsonValue),
        emailSettings: (parsed.emailSettings ?? undefined) as Prisma.InputJsonValue | undefined,
        revision: { increment: 1 },
        approvedRevision: null,
        approvedAt: null,
        approvedByUserId: null,
        status: existing.status === "draft" ? "draft" : maxReached >= 0 ? existing.status : "draft",
        steps: { create: parsed.steps.map(stepData) },
      },
      include: { steps: { orderBy: { index: "asc" } }, _count: { select: { campaignLeads: true } } },
    });
  });
  await audit(ctx, "sequence.updated", { type: "sequence", id }, { revision: seq.revision, approvalInvalidated: true });
  return seq;
}

export async function saveAsNewSequence(ctx: Ctx, id: string, input: SequenceInput) {
  const existing = await getSequence(ctx, id);
  const created = await createSequence(ctx, existing.campaignId, { ...input, name: input.name || `${existing.name} v${existing.revision + 1}` });
  await audit(ctx, "sequence.forked", { type: "sequence", id: created.id }, { from: id });
  return created;
}

/** Approval records the exact revision a human reviewed. */
export async function approveSequence(ctx: Ctx, id: string, expectedRevision: number) {
  requirePermission(ctx, "campaigns.activate");
  const existing = await getSequence(ctx, id);
  if (existing.revision !== expectedRevision) throw new ApiError("revision_conflict", "The sequence changed since you reviewed it. Reload, review again, then approve.", { details: { currentRevision: existing.revision } });
  const errors = validateSteps(existing.steps.map(toStepInput), existing.executionModel as "linear" | "tracks");
  if (errors.length) throw ApiError.invalid(errors.join(" "), { errors });
  const seq = await prisma.campaignSequence.update({
    where: { id },
    data: { approvedRevision: existing.revision, approvedAt: new Date(), approvedByUserId: ctx.userId, status: existing.status === "draft" ? "approved" : existing.status },
  });
  await audit(ctx, "sequence.approved", { type: "sequence", id }, { revision: existing.revision });
  return seq;
}

export async function setSequenceStatus(ctx: Ctx, id: string, status: "active" | "paused" | "draft" | "archived") {
  requirePermission(ctx, "campaigns.activate");
  const existing = await getSequence(ctx, id);
  if (existing.status === "archived") throw ApiError.conflict("Archived sequences are read-only.");
  if (status === "active" && existing.approvedRevision !== existing.revision) throw ApiError.conflict("Approve the current revision before activating.", { code: "sequence_approval_required" });
  const seq = await prisma.campaignSequence.update({ where: { id }, data: { status } });
  if (status === "paused") await prisma.campaignLead.updateMany({ where: { sequenceId: id, status: "active" }, data: { status: "paused" } });
  if (status === "active") await prisma.campaignLead.updateMany({ where: { sequenceId: id, status: "paused" }, data: { status: "active" } });
  await audit(ctx, "sequence.status_changed", { type: "sequence", id }, { from: existing.status, to: status });
  return seq;
}

export function toStepInput(s: { kind: string; delayDays: number; subject: string | null; bodyTemplate: string | null; variants: unknown; condition: string | null; actions: unknown; aiGeneration: unknown; requiresInput: unknown }): StepInput {
  return {
    kind: s.kind as StepInput["kind"],
    delayDays: s.delayDays,
    subject: s.subject,
    bodyTemplate: s.bodyTemplate,
    variants: (s.variants as StepInput["variants"]) ?? undefined,
    condition: (s.condition as StepInput["condition"]) ?? null,
    actions: (s.actions as StepInput["actions"]) ?? undefined,
    aiGeneration: (s.aiGeneration as StepInput["aiGeneration"]) ?? undefined,
    manualInstructions: (s.requiresInput as { instructions?: string } | null)?.instructions,
  };
}

export const DEFAULT_TEMPLATES: { key: string; name: string; description: string; executionModel: "linear" | "tracks"; steps: StepInputRaw[] }[] = [
  {
    key: "email_3",
    name: "Email: intro + two follow-ups",
    description: "Day 0 email, day 3 follow-up in thread, day 7 short last note.",
    executionModel: "linear",
    steps: [
      { kind: "email", delayDays: 0, aiGeneration: { enabled: true, tone: "plain", length: "short" } },
      { kind: "email", delayDays: 3, aiGeneration: { enabled: true, tone: "plain", length: "short", instructions: "Follow up in the same thread with one new piece of proof or a question." } },
      { kind: "email", delayDays: 4, aiGeneration: { enabled: true, tone: "plain", length: "short", instructions: "Short last note; make it easy to say no." } },
    ],
  },
  {
    key: "linkedin_email",
    name: "LinkedIn connect → message → email",
    description: "Day 0 connection request (no note), day 1 LinkedIn message after accept, day 4 email, day 7 follow-up email.",
    executionModel: "linear",
    steps: [
      { kind: "linkedin_connect", delayDays: 0, aiGeneration: { enabled: false } },
      { kind: "linkedin_message", delayDays: 1, aiGeneration: { enabled: true, tone: "friendly", length: "short" } },
      { kind: "email", delayDays: 3, aiGeneration: { enabled: true, tone: "plain", length: "short" } },
      { kind: "email", delayDays: 3, aiGeneration: { enabled: true, tone: "plain", length: "short", instructions: "Follow up in thread." } },
    ],
  },
  {
    key: "multichannel",
    name: "Multichannel: LinkedIn, email, X",
    description: "Day 0 connect, day 2 LinkedIn follow-up, day 4 email, day 7 follow-up email, day 10 X DM if eligible.",
    executionModel: "linear",
    steps: [
      { kind: "linkedin_connect", delayDays: 0, aiGeneration: { enabled: false } },
      { kind: "linkedin_message", delayDays: 2, aiGeneration: { enabled: true, tone: "friendly", length: "short" } },
      { kind: "email", delayDays: 2, aiGeneration: { enabled: true, tone: "plain", length: "short" } },
      { kind: "email", delayDays: 3, aiGeneration: { enabled: true, tone: "plain", length: "short", instructions: "Follow up in thread." } },
      { kind: "x_dm", delayDays: 3, condition: "has_x", aiGeneration: { enabled: true, tone: "friendly", length: "short" } },
    ],
  },
];
