import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit, recordActivity } from "@/server/modules/audit/service";
import { aiStructured, companyContext, GROUNDING_RULES } from "@/server/ai";
import { CHANNEL_OF_KIND, renderTemplate, type StepKind } from "@/server/modules/sequences/schemas";
import type { LeadResearchOutput } from "@/server/modules/intelligence/service";

const PROMPT_VERSION = "message-generate-v1";

export const generatedMessageSchema = z.object({
  subject: z.string().max(150).nullable().describe("Email subject; null for non-email channels"),
  body: z.string().min(1).max(4000),
  reasoning: z.string().max(600).describe("Why this angle, which evidence was used"),
  personalizationUsed: z.array(z.string()).describe("Each verifiable fact referenced in the message"),
  risks: z.array(z.string()).describe("Anything that might be inaccurate or sound presumptuous"),
});
export type GeneratedMessage = z.infer<typeof generatedMessageSchema>;

const CHANNEL_LIMITS: Record<"email" | "linkedin" | "x" | "none", { maxChars: number; note: string }> = {
  email: { maxChars: 1200, note: "Plain text email. Two to four short sentences for the first touch; follow-ups shorter. No HTML, no bullet lists, no signature block (it is appended automatically)." },
  linkedin: { maxChars: 600, note: "LinkedIn message: one or two sentences, conversational, no subject line. Connection notes must be under 300 characters." },
  x: { maxChars: 500, note: "X DM: casual, one or two sentences, lowercase is fine, no links in the first message." },
  none: { maxChars: 1000, note: "" },
};

/**
 * Assembles grounded context and asks the LLM for one message for one lead
 * and one step. Returns a Message row in `awaiting_approval` (or `approved`
 * when the campaign approved the sequence once and the step is not the
 * first touch of a channel that requires review).
 */
export async function generateMessage(ctx: Ctx, campaignLeadId: string, stepIndex: number, options?: { regenerate?: boolean; instructions?: string }) {
  const cl = await prisma.campaignLead.findFirst({
    where: { id: campaignLeadId, workspaceId: ctx.workspaceId },
    include: {
      campaign: { include: { icpProfile: true } },
      sequence: { include: { steps: { orderBy: { index: "asc" } } } },
      lead: { include: { contact: { include: { signals: { orderBy: { occurredAt: "desc" }, take: 5 } } }, account: { include: { signals: { orderBy: { occurredAt: "desc" }, take: 5 } } }, research: { orderBy: { computedAt: "desc" }, take: 1 } } },
      senderAccount: true,
      messages: { where: { status: { in: ["sent", "delivered", "received"] } }, orderBy: { createdAt: "asc" }, take: 10 },
    },
  });
  if (!cl) throw ApiError.notFound("enrollment");
  const step = cl.sequence.steps[stepIndex];
  if (!step) throw ApiError.invalid(`Step ${stepIndex + 1} does not exist`);
  const kind = step.kind as StepKind;
  const channel = CHANNEL_OF_KIND[kind];
  const ai = (step.aiGeneration as { enabled?: boolean; tone?: string; length?: string; instructions?: string } | null) ?? { enabled: true };
  const c = cl.lead.contact;
  const sender = cl.senderAccount;
  const vars = { firstName: c.firstName ?? c.fullName.split(" ")[0], lastName: c.lastName ?? "", fullName: c.fullName, company: cl.lead.account?.name ?? c.companyNameRaw ?? "", title: c.title ?? "", senderFirstName: sender?.displayName?.split(" ")[0] ?? "" };

  let subject: string | null = step.subject ? renderTemplate(step.subject, vars) : null;
  let body: string;
  let generatedBy: "ai" | "template" = "template";
  let aiMeta: Record<string, unknown> | undefined;

  if (kind === "linkedin_connect" && !(ai.enabled && step.bodyTemplate)) {
    // Connection requests go without a note by default (higher acceptance, no fabricated familiarity).
    body = step.bodyTemplate ? renderTemplate(step.bodyTemplate, vars) : "";
  } else if (!ai.enabled || !["email", "linkedin_message", "linkedin_inmail", "x_dm"].includes(kind)) {
    body = renderTemplate(pickVariant(step.bodyTemplate, step.variants as { key: string; weight: number; bodyTemplate: string }[] | null, cl.id), vars);
  } else {
    generatedBy = "ai";
    const research = cl.lead.research[0]?.summary as LeadResearchOutput | undefined;
    const signals = [...(cl.lead.account?.signals ?? []), ...c.signals].filter((s) => !s.isInferred).map((s) => `- ${s.eventType}: ${s.title} (${s.occurredAt.toISOString().slice(0, 10)})`);
    const history = cl.messages.map((m) => `[${m.direction} via ${m.channel} ${m.sentAt?.toISOString().slice(0, 10) ?? ""}] ${m.subject ? `Subject: ${m.subject}\n` : ""}${m.body.slice(0, 800)}`);
    const limits = CHANNEL_LIMITS[channel];
    const isFollowUp = cl.messages.some((m) => m.direction === "outbound" && m.channel === channel);
    const { data, meta } = await aiStructured<GeneratedMessage>(ctx.workspaceId, {
      schema: generatedMessageSchema,
      schemaName: "outreach_message",
      purpose: "message.generate",
      promptVersion: PROMPT_VERSION,
      maxTokens: 1500,
      usage: { leadId: cl.leadId, campaignId: cl.campaignId },
      messages: [
        {
          role: "system",
          content: `You write one ${channel === "email" ? "cold email" : channel === "linkedin" ? "LinkedIn message" : "X direct message"} on behalf of a salesperson.
${GROUNDING_RULES}
Writing rules:
- ${limits.note} Hard limit ${limits.maxChars} characters.
- Never claim familiarity you do not have ("loved your post", "we met at") and never invent events, numbers, or quotes. Use only the facts provided; if few facts exist, write a plain, honest question about their role.
- One clear, low-friction ask (a question or a yes/no), not a 30-minute meeting request in the first message.
- No flattery, no buzzwords (streamline, leverage, unlock, seamless, empower), no "I hope this finds you well".
- Tone: ${ai.tone ?? "plain"}. Length: ${ai.length ?? "short"}.
- Use the recipient's first name once at most. Do not add a signature; the sender's name is appended automatically.
- You may use the placeholders {{firstName}} and {{company}}; they are substituted with verified values.
${isFollowUp ? "- This is a FOLLOW-UP in an existing thread: reference the previous message briefly, add one new piece of value or a different question, keep it shorter than the first message." : ""}
${ai.instructions ? `- Step guidance: ${ai.instructions}` : ""}
${options?.instructions ? `- Reviewer guidance for this regeneration: ${options.instructions}` : ""}`,
        },
        {
          role: "user",
          content: `OUR COMPANY\n${await companyContext(ctx.workspaceId)}\n\nCAMPAIGN\nName: ${cl.campaign.name}\nObjective: ${cl.campaign.objective ?? "book qualified conversations"}\nICP: ${cl.campaign.icpProfile?.name ?? "n/a"}\n\nRECIPIENT\nName: ${c.fullName}\nTitle: ${c.title ?? "unknown"}\nCompany: ${vars.company || "unknown"}${cl.lead.account?.industry ? ` (${cl.lead.account.industry})` : ""}${cl.lead.account?.headcount ? `, ~${cl.lead.account.headcount} employees` : ""}\nLocation: ${c.location ?? "unknown"}\n\nOBSERVED SIGNALS\n${signals.join("\n") || "none"}\n\nRESEARCH\n${research ? `Why they might need us: ${research.whyTheyMightNeedUs}\nBest angle: ${research.bestAngle}\nSuggested opener: ${research.suggestedOpener}\nSuggested value prop: ${research.suggestedValueProp}\nEvidence: ${research.evidence.map((e) => `${e.claim} (${e.source})`).join("; ")}` : "none (write a plain, honest message)"}\n\nPREVIOUS MESSAGES IN THIS THREAD\n${history.join("\n\n") || "none"}\n\nSENDER\n${sender?.displayName ?? "the salesperson"}`,
        },
      ],
    });
    body = renderTemplate(data.body, vars).slice(0, limits.maxChars);
    subject = channel === "email" ? (isFollowUp && cl.messages.find((m) => m.channel === "email" && m.subject)?.subject ? `Re: ${cl.messages.find((m) => m.channel === "email" && m.subject)!.subject}` : data.subject ? renderTemplate(data.subject, vars) : subject) : null;
    aiMeta = { provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion, usage: meta.usage, reasoning: data.reasoning, personalizationUsed: data.personalizationUsed, risks: data.risks, tone: ai.tone, length: ai.length, regenerate: Boolean(options?.regenerate), instructions: options?.instructions };
  }
  if (sender?.displayName && channel !== "none" && body && kind !== "linkedin_connect") {
    body = `${body.trimEnd()}\n\n${sender.displayName}`;
  }

  const status = decideInitialStatus(cl.campaign.approvalMode, cl.sequence.approvedRevision === cl.sequence.revision, generatedBy);
  const previous = await prisma.message.findFirst({ where: { campaignLeadId, kind: messageKind(kind), status: { in: ["draft", "awaiting_approval", "approved"] }, stepRuns: { some: { stepIndex } } }, orderBy: { createdAt: "desc" } });
  if (previous && options?.regenerate) await prisma.message.update({ where: { id: previous.id }, data: { status: "rejected" } });
  const message = await prisma.message.create({
    data: {
      workspaceId: ctx.workspaceId,
      leadId: cl.leadId,
      campaignLeadId,
      channel: channel === "none" ? "manual" : channel,
      direction: "outbound",
      kind: messageKind(kind),
      subject,
      body,
      status,
      generatedBy,
      aiMeta: aiMeta as Prisma.InputJsonValue | undefined,
      supersedesMessageId: previous?.id,
      senderAccountId: sender?.id,
      toAddress: channel === "email" ? c.email : channel === "linkedin" ? c.linkedinUrl : channel === "x" ? c.xHandle : null,
    },
  });
  await recordActivity(ctx, { action: "message.generated", leadId: cl.leadId, contactId: c.id, campaignId: cl.campaignId, campaignLeadId, channel: message.channel, metadata: { messageId: message.id, stepIndex, generatedBy, status } });
  return message;
}

function decideInitialStatus(approvalMode: string, sequenceApproved: boolean, generatedBy: "ai" | "template"): "awaiting_approval" | "approved" {
  if (approvalMode === "approve_sequence_once" && sequenceApproved) return "approved";
  if (generatedBy === "template" && sequenceApproved) return "approved";
  return "awaiting_approval";
}

function pickVariant(bodyTemplate: string | null, variants: { key: string; weight: number; bodyTemplate: string }[] | null, seed: string): string {
  if (!variants?.length) return bodyTemplate ?? "";
  const total = variants.reduce((n, v) => n + v.weight, 0);
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  let r = h % total;
  for (const v of variants) {
    if (r < v.weight) return v.bodyTemplate;
    r -= v.weight;
  }
  return variants[0].bodyTemplate;
}

export function messageKind(kind: StepKind): "connection_note" | "linkedin_message" | "inmail" | "email" | "email_followup" | "x_dm" | "manual" {
  switch (kind) {
    case "linkedin_connect":
      return "connection_note";
    case "linkedin_message":
      return "linkedin_message";
    case "linkedin_inmail":
      return "inmail";
    case "email":
      return "email";
    case "x_dm":
      return "x_dm";
    default:
      return "manual";
  }
}

// ───────────────────────────── Review queue ─────────────────────────────

export async function listPendingMessages(ctx: Ctx, options?: { campaignId?: string; limit?: number }) {
  requirePermission(ctx, "messages.approve");
  return prisma.message.findMany({
    where: { workspaceId: ctx.workspaceId, direction: "outbound", status: "awaiting_approval", ...(options?.campaignId ? { campaignLead: { campaignId: options.campaignId } } : {}) },
    include: { lead: { include: { contact: { select: { fullName: true, title: true, companyNameRaw: true } }, account: { select: { name: true } } } }, campaignLead: { include: { campaign: { select: { id: true, name: true } } } }, stepRuns: { select: { stepIndex: true } } },
    orderBy: { createdAt: "asc" },
    take: options?.limit ?? 100,
  });
}

export const reviewInput = z.object({
  decision: z.enum(["approve", "reject", "edit", "regenerate"]),
  subject: z.string().max(150).nullable().optional(),
  body: z.string().max(4000).optional(),
  instructions: z.string().max(500).optional(),
});

export async function reviewMessage(ctx: Ctx, messageId: string, input: z.infer<typeof reviewInput>) {
  requirePermission(ctx, "messages.approve");
  const message = await prisma.message.findFirst({ where: { id: messageId, workspaceId: ctx.workspaceId }, include: { stepRuns: true } });
  if (!message) throw ApiError.notFound("message");
  if (!["awaiting_approval", "draft", "approved"].includes(message.status)) throw ApiError.conflict(`This message is ${message.status} and cannot be changed.`);
  if (input.decision === "regenerate") {
    if (!message.campaignLeadId) throw ApiError.invalid("Only campaign messages can be regenerated");
    const stepIndex = message.stepRuns[0]?.stepIndex ?? 0;
    const fresh = await generateMessage(ctx, message.campaignLeadId, stepIndex, { regenerate: true, instructions: input.instructions });
    await prisma.stepRun.updateMany({ where: { messageId: message.id }, data: { messageId: fresh.id, status: fresh.status === "approved" ? "approved" : "awaiting_approval" } });
    await audit(ctx, "message.regenerated", { type: "message", id: fresh.id }, { from: message.id });
    return fresh;
  }
  if (input.decision === "reject") {
    const updated = await prisma.message.update({ where: { id: messageId }, data: { status: "rejected", editedByUserId: ctx.userId } });
    await prisma.stepRun.updateMany({ where: { messageId }, data: { status: "cancelled" } });
    await recordActivity(ctx, { action: "message.rejected", leadId: message.leadId, campaignLeadId: message.campaignLeadId, channel: message.channel, metadata: { messageId } });
    return updated;
  }
  const edited = input.decision === "edit" || input.body !== undefined || input.subject !== undefined;
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { status: "approved", approvedByUserId: ctx.userId, approvedAt: new Date(), body: input.body ?? undefined, subject: input.subject === undefined ? undefined : input.subject, editedByUserId: edited ? ctx.userId : undefined },
  });
  await prisma.stepRun.updateMany({ where: { messageId, status: "awaiting_approval" }, data: { status: "approved" } });
  await recordActivity(ctx, { action: "message.approved", leadId: message.leadId, campaignLeadId: message.campaignLeadId, channel: message.channel, metadata: { messageId, edited } });
  await audit(ctx, "message.approved", { type: "message", id: messageId }, { edited });
  return updated;
}

/** Preview generation for a step against one lead without creating a StepRun (used by the sequence editor). */
export async function previewMessage(ctx: Ctx, campaignLeadId: string, stepIndex: number) {
  requirePermission(ctx, "campaigns.read");
  const m = await generateMessage(ctx, campaignLeadId, stepIndex, { regenerate: false });
  await prisma.message.update({ where: { id: m.id }, data: { status: "draft" } });
  return m;
}
