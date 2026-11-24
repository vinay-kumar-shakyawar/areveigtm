import "server-only";
import { z } from "zod";
import type { Prisma, ReplyClassification } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { jobCtx, requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit, notify, recordActivity } from "@/server/modules/audit/service";
import { aiStructured, companyContext, GROUNDING_RULES } from "@/server/ai";
import { emitWebhook } from "@/server/modules/webhooks/service";
import { recordBounce, recordUnsubscribe } from "@/server/modules/inbound/service";
import { enrollLeads, stopAllForLead } from "@/server/modules/campaigns/service";
import { sendEmailMessage } from "@/server/modules/channels/email";
import { sendLinkedInMessage } from "@/server/modules/channels/linkedin";
import { sendXMessage } from "@/server/modules/channels/x";
import { defineJob } from "@/server/jobs";
import { logger } from "@/server/logger";
import type { LeadResearchOutput } from "@/server/modules/intelligence/service";

/**
 * Unified inbox: every inbound reply becomes a conversation with an AI
 * classification, a suggested action and (when sensible) a grounded draft.
 * Nothing is sent without a human decision unless the workspace explicitly
 * enabled auto-send and the draft clears the confidence threshold.
 */
const PROMPT_VERSION = "reply-classify-v1";

export const CLASSIFICATIONS = ["interested", "question", "not_now", "not_interested", "out_of_office", "wrong_person", "unsubscribe", "bounce", "other"] as const;
export const RECOMMENDED_ACTIONS = ["reply", "send_booking_link", "mark_interested", "mark_not_interested", "opt_out", "wait", "escalate", "dismiss"] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export const replyAnalysisSchema = z.object({
  classification: z.enum(CLASSIFICATIONS),
  confidence: z.number().min(0).max(1).describe("How sure you are about the classification"),
  summary: z.string().max(300).describe("One sentence: what the person said and what they want"),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  recommendedAction: z.enum(RECOMMENDED_ACTIONS),
  draft: z.string().max(2000).nullable().describe("A reply draft when recommendedAction is reply or send_booking_link; otherwise null"),
  nextAction: z.string().max(200).describe("What the salesperson should do next, in plain words"),
  proposedTimes: z.array(z.string()).describe("Any meeting times the person proposed, verbatim"),
  questions: z.array(z.string()).describe("Explicit questions the person asked, verbatim"),
});
export type ReplyAnalysis = z.infer<typeof replyAnalysisSchema>;

/** Categories the AI may auto-send in when the workspace opts in. Never unsubscribe/bounce/wrong person. */
const AUTO_SEND_ALLOWED: ReplyClassification[] = ["interested", "question", "not_now"];

const STATUS_FOR: Record<ReplyClassification, "needs_attention" | "interested" | "not_interested" | "meeting_requested" | "awaiting_reply" | "archived"> = {
  interested: "interested",
  question: "needs_attention",
  not_now: "needs_attention",
  not_interested: "not_interested",
  out_of_office: "awaiting_reply",
  wrong_person: "needs_attention",
  unsubscribe: "archived",
  bounce: "archived",
  other: "needs_attention",
};

async function workspaceSlug(workspaceId: string) {
  return (await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { slug: true } })).slug;
}

/** Classify the latest inbound message of a conversation and prepare a draft. Idempotent per message. */
export async function processReply(workspaceId: string, conversationId: string, messageId: string, options?: { instructions?: string; force?: boolean }) {
  const ctx = jobCtx(workspaceId);
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: {
      lead: { include: { contact: true, account: true, research: { orderBy: { computedAt: "desc" }, take: 1 } } },
      campaign: true,
      senderAccount: true,
      messages: { orderBy: { createdAt: "asc" }, take: 20 },
    },
  });
  if (!convo) return null;
  const inbound = convo.messages.find((m) => m.id === messageId && m.direction === "inbound");
  if (!inbound) return null;
  const existingDraft = await prisma.message.findFirst({ where: { conversationId, direction: "outbound", kind: "reply", status: "awaiting_approval" }, orderBy: { createdAt: "desc" } });
  if (!options?.force && existingDraft && (existingDraft.aiMeta as { inboundMessageId?: string } | null)?.inboundMessageId === messageId) return existingDraft;

  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });
  const c = convo.lead.contact;
  const research = convo.lead.research[0]?.summary as LeadResearchOutput | undefined;
  const history = convo.messages.filter((m) => ["sent", "delivered", "received"].includes(m.status)).map((m) => `[${m.direction === "inbound" ? "THEM" : "US"} via ${m.channel} ${(m.sentAt ?? m.receivedAt ?? m.createdAt).toISOString().slice(0, 10)}]${m.subject ? ` Subject: ${m.subject}` : ""}\n${m.body.slice(0, 1500)}`);
  const { data, meta } = await aiStructured<ReplyAnalysis>(workspaceId, {
    schema: replyAnalysisSchema,
    schemaName: "reply_analysis",
    purpose: "reply.classify",
    promptVersion: PROMPT_VERSION,
    maxTokens: 1200,
    usage: { leadId: convo.leadId, campaignId: convo.campaignId ?? undefined },
    messages: [
      {
        role: "system",
        content: `You triage replies to B2B outreach for a salesperson and draft the next message.
${GROUNDING_RULES}
Classification guide:
- interested: wants to learn more, asks for a call, demo, pricing with intent.
- question: asks something specific before deciding.
- not_now: timing objection, "circle back in Q3".
- not_interested: clear no.
- out_of_office: automatic away reply.
- wrong_person: redirects to someone else.
- unsubscribe: asks to stop contacting them (treat any "remove me", "stop", "unsubscribe" as this).
- bounce: delivery failure notification.
- other: anything else.
Drafting rules:
- Draft only when a human reply makes sense (reply / send_booking_link). Never draft for unsubscribe, bounce, out_of_office, not_interested.
- Answer their actual question using ONLY the company facts provided; if the answer is not in the facts, say you will check and come back, do not invent.
- ${settings?.bookingLink ? `A booking link exists: ${settings.bookingLink}. Offer it when they want to talk.` : "No booking link is configured: propose two concrete time windows instead of a link."}
- Match their tone and length; two to five short sentences; same channel conventions as the thread (${convo.channel}).
- Never add a signature; the sender name is appended automatically.
- Set confidence honestly; ambiguous or sarcastic replies deserve low confidence.
${options?.instructions ? `- Reviewer guidance: ${options.instructions}` : ""}`,
      },
      {
        role: "user",
        content: `OUR COMPANY\n${await companyContext(workspaceId)}\n\nCAMPAIGN\n${convo.campaign ? `${convo.campaign.name} — objective: ${convo.campaign.objective ?? "book qualified conversations"}` : "none"}\n\nPERSON\nName: ${c.fullName}\nTitle: ${c.title ?? "unknown"}\nCompany: ${convo.lead.account?.name ?? c.companyNameRaw ?? "unknown"}\n\nRESEARCH\n${research ? `Why they might need us: ${research.whyTheyMightNeedUs}\nBest angle: ${research.bestAngle}` : "none"}\n\nTHREAD (oldest first)\n${history.join("\n\n")}\n\nLATEST REPLY TO TRIAGE\n${inbound.body.slice(0, 4000)}`,
      },
    ],
  });

  const classification = data.classification as ReplyClassification;
  const status = STATUS_FOR[classification];
  await prisma.conversation.update({ where: { id: conversationId }, data: { classification, classificationConfidence: data.confidence, status, replyStatus: ["unsubscribe", "bounce"].includes(classification) ? "decided" : "awaiting_decision" } });
  await prisma.message.update({ where: { id: inbound.id }, data: { aiMeta: { classification, confidence: data.confidence, summary: data.summary, sentiment: data.sentiment, recommendedAction: data.recommendedAction, nextAction: data.nextAction, proposedTimes: data.proposedTimes, questions: data.questions, provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion } as Prisma.InputJsonValue } });
  await recordActivity(ctx, { action: "reply.classified", leadId: convo.leadId, contactId: c.id, conversationId, campaignId: convo.campaignId, channel: convo.channel, metadata: { messageId, classification, confidence: data.confidence, recommendedAction: data.recommendedAction } });

  // Hard outcomes that need no human decision.
  if (classification === "unsubscribe" && c.email) {
    await recordUnsubscribe(workspaceId, { email: c.email, messageId: inbound.id, method: "reply" });
  } else if (classification === "bounce" && c.email) {
    await recordBounce(workspaceId, { email: c.email, kind: "bounce", detail: "Bounce reported in reply" });
  } else if (classification === "interested" || classification === "question") {
    const lead = await prisma.lead.findUnique({ where: { id: convo.leadId }, select: { status: true } });
    if (lead && !["qualified", "meeting_booked", "unsubscribed"].includes(lead.status)) {
      await prisma.lead.update({ where: { id: convo.leadId }, data: { status: "qualified", stage: "qualified" } });
      await recordActivity(ctx, { action: "lead.qualified", leadId: convo.leadId, contactId: c.id, conversationId, campaignId: convo.campaignId, channel: convo.channel, metadata: { by: "ai", classification, confidence: data.confidence } });
      await emitWebhook(workspaceId, "lead.status_changed", { leadId: convo.leadId, status: "qualified", reason: classification });
    }
  } else if (classification === "not_interested") {
    await prisma.lead.update({ where: { id: convo.leadId }, data: { status: "not_interested", stage: "not_interested" } }).catch(() => {});
    await recordActivity(ctx, { action: "lead.not_interested", leadId: convo.leadId, contactId: c.id, conversationId, campaignId: convo.campaignId, channel: convo.channel, metadata: { by: "ai", confidence: data.confidence } });
    await emitWebhook(workspaceId, "lead.status_changed", { leadId: convo.leadId, status: "not_interested", reason: classification });
  }

  let draft = null;
  const wantsDraft = data.draft && ["reply", "send_booking_link"].includes(data.recommendedAction) && !["unsubscribe", "bounce", "out_of_office", "not_interested"].includes(classification);
  if (wantsDraft) {
    if (existingDraft) await prisma.message.update({ where: { id: existingDraft.id }, data: { status: "rejected" } });
    const body = `${data.draft!.trim()}${convo.senderAccount?.displayName ? `\n\n${convo.senderAccount.displayName}` : ""}`;
    draft = await prisma.message.create({
      data: {
        workspaceId,
        leadId: convo.leadId,
        campaignLeadId: inbound.campaignLeadId ?? undefined,
        conversationId,
        channel: convo.channel,
        direction: "outbound",
        kind: "reply",
        subject: convo.channel === "email" ? (inbound.subject?.startsWith("Re:") ? inbound.subject : `Re: ${inbound.subject ?? convo.subject ?? ""}`.trim()) : null,
        body,
        status: "awaiting_approval",
        generatedBy: "ai",
        aiMeta: { inboundMessageId: messageId, classification, confidence: data.confidence, recommendedAction: data.recommendedAction, summary: data.summary, nextAction: data.nextAction, provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion, usage: meta.usage, instructions: options?.instructions ?? null } as Prisma.InputJsonValue,
        supersedesMessageId: existingDraft?.id,
        senderAccountId: convo.senderAccountId ?? undefined,
        toAddress: convo.channel === "email" ? (inbound.fromAddress ?? c.email) : convo.channel === "linkedin" ? c.linkedinUrl : c.xHandle,
      },
    });
    const auto = settings?.aiAutoSendReplies && data.confidence >= (settings.aiAutoSendMinConfidence ?? 0.9) && AUTO_SEND_ALLOWED.includes(classification) && data.recommendedAction === "reply";
    if (auto) {
      try {
        await sendReply(ctx, conversationId, { draftMessageId: draft.id, decidedVia: "auto" });
        await audit(ctx, "reply.auto_sent", { type: "conversation", id: conversationId }, { messageId: draft.id, confidence: data.confidence, classification });
      } catch (err) {
        logger.warn({ err, conversationId }, "auto-send failed; draft left for review");
      }
    }
  }
  const slug = await workspaceSlug(workspaceId);
  await notify(ctx, { type: "reply", title: `${classification.replace(/_/g, " ")} · ${c.fullName}`, body: data.summary, link: `/w/${slug}/inbox?conversation=${conversationId}` });
  return draft;
}

defineJob<{ workspaceId: string; conversationId: string; messageId: string }>("inbox.process", async ({ workspaceId, conversationId, messageId }) => {
  await processReply(workspaceId, conversationId, messageId);
}, { retryLimit: 2, singletonKey: (p) => `inbox.process:${p.messageId}` });

// ───────────────────────────── Listing ─────────────────────────────

export const INBOX_FILTERS = ["all", "unread", "awaiting", "interested", "qualified", "not_interested", "meeting_requested", "snoozed", "archived"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const inboxQuery = z.object({
  filter: z.enum(INBOX_FILTERS).default("all"),
  channel: z.enum(["email", "linkedin", "x"]).optional(),
  campaignId: z.string().uuid().optional(),
  assigned: z.enum(["me", "unassigned", "any"]).default("any"),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function whereFor(ctx: Ctx, filter: InboxFilter, extra: { channel?: string; campaignId?: string; assigned?: string; q?: string }): Prisma.ConversationWhereInput {
  const now = new Date();
  const base: Prisma.ConversationWhereInput = { workspaceId: ctx.workspaceId };
  const byFilter: Record<InboxFilter, Prisma.ConversationWhereInput> = {
    all: { status: { not: "archived" } },
    unread: { unreadCount: { gt: 0 }, status: { not: "archived" } },
    awaiting: { replyStatus: "awaiting_decision", status: { not: "archived" } },
    interested: { status: "interested" },
    qualified: { lead: { status: { in: ["qualified", "meeting_booked"] } }, status: { not: "archived" } },
    not_interested: { status: "not_interested" },
    meeting_requested: { OR: [{ status: "meeting_requested" }, { meetings: { some: {} } }] },
    snoozed: { status: "snoozed", snoozedUntil: { gt: now } },
    archived: { status: "archived" },
  };
  return {
    ...base,
    ...byFilter[filter],
    ...(extra.channel ? { channel: extra.channel as "email" | "linkedin" | "x" } : {}),
    ...(extra.campaignId ? { campaignId: extra.campaignId } : {}),
    ...(extra.assigned === "me" ? { assignedUserId: ctx.userId ?? "" } : extra.assigned === "unassigned" ? { assignedUserId: null } : {}),
    ...(extra.q ? { OR: [{ subject: { contains: extra.q, mode: "insensitive" } }, { contact: { fullName: { contains: extra.q, mode: "insensitive" } } }, { account: { name: { contains: extra.q, mode: "insensitive" } } }, { messages: { some: { body: { contains: extra.q, mode: "insensitive" } } } }] } : {}),
  };
}

export async function listConversations(ctx: Ctx, query: z.infer<typeof inboxQuery>) {
  requirePermission(ctx, "inbox.read");
  const rows = await prisma.conversation.findMany({
    where: whereFor(ctx, query.filter, query),
    include: {
      contact: { select: { fullName: true, title: true, email: true, linkedinUrl: true, xHandle: true } },
      account: { select: { name: true } },
      campaign: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, createdAt: true, status: true } },
      _count: { select: { messages: { where: { direction: "outbound", kind: "reply", status: "awaiting_approval" } } } },
    },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: query.limit,
  });
  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    channel: r.channel,
    status: r.status,
    replyStatus: r.replyStatus,
    classification: r.classification,
    classificationConfidence: r.classificationConfidence,
    unreadCount: r.unreadCount,
    assignedUserId: r.assignedUserId,
    subject: r.subject,
    lastMessageAt: r.lastMessageAt,
    snoozedUntil: r.snoozedUntil,
    contact: r.contact,
    account: r.account,
    campaign: r.campaign,
    lastMessage: r.messages[0] ? { preview: r.messages[0].body.slice(0, 140), direction: r.messages[0].direction, at: r.messages[0].createdAt } : null,
    pendingDrafts: r._count.messages,
  }));
}

export async function inboxCounts(ctx: Ctx) {
  requirePermission(ctx, "inbox.read");
  const entries = await Promise.all(INBOX_FILTERS.map(async (f) => [f, await prisma.conversation.count({ where: whereFor(ctx, f, {}) })] as const));
  return Object.fromEntries(entries) as Record<InboxFilter, number>;
}

export async function getConversation(ctx: Ctx, id: string) {
  requirePermission(ctx, "inbox.read");
  const convo = await prisma.conversation.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      lead: { include: { contact: true, account: { select: { id: true, name: true, domain: true, industry: true, headcount: true } }, research: { orderBy: { computedAt: "desc" }, take: 1, select: { summary: true } }, scores: { orderBy: { computedAt: "desc" }, take: 3, select: { kind: true, score: true } } } },
      campaign: { select: { id: true, name: true, status: true } },
      senderAccount: { select: { id: true, displayName: true, channel: true, provider: true, status: true } },
      messages: { orderBy: { createdAt: "asc" }, where: { status: { not: "rejected" } } },
      decisions: { orderBy: { decidedAt: "desc" }, take: 20 },
      meetings: { orderBy: { scheduledAt: "desc" }, take: 5 },
    },
  });
  if (!convo) throw ApiError.notFound("conversation");
  const members = await prisma.workspaceMember.findMany({ where: { workspaceId: ctx.workspaceId }, include: { user: { select: { id: true, name: true, email: true } } } });
  const campaigns = await prisma.campaign.findMany({ where: { workspaceId: ctx.workspaceId, status: { in: ["active", "draft", "paused"] } }, select: { id: true, name: true, status: true }, orderBy: { createdAt: "desc" }, take: 50 });
  return { ...convo, members: members.map((m) => m.user), campaigns };
}

export async function markRead(ctx: Ctx, id: string) {
  requirePermission(ctx, "inbox.read");
  const convo = await prisma.conversation.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!convo) throw ApiError.notFound("conversation");
  if (convo.unreadCount > 0) await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
}

export const updateConversationInput = z.object({
  assignedUserId: z.string().uuid().nullable().optional(),
  status: z.enum(["open", "archived", "needs_attention"]).optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
});

export async function updateConversation(ctx: Ctx, id: string, input: z.infer<typeof updateConversationInput>) {
  requirePermission(ctx, "inbox.decide");
  const convo = await prisma.conversation.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!convo) throw ApiError.notFound("conversation");
  if (input.assignedUserId) {
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: ctx.workspaceId, userId: input.assignedUserId } });
    if (!member) throw ApiError.invalid("Assignee is not a member of this workspace");
  }
  const updated = await prisma.conversation.update({
    where: { id },
    data: {
      assignedUserId: input.assignedUserId,
      ...(input.snoozedUntil !== undefined ? (input.snoozedUntil ? { status: "snoozed", snoozedUntil: new Date(input.snoozedUntil) } : { status: "open", snoozedUntil: null }) : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
  await audit(ctx, "conversation.updated", { type: "conversation", id }, { fields: Object.keys(input) });
  if (input.assignedUserId && input.assignedUserId !== ctx.userId) await notify(ctx, { userId: input.assignedUserId, type: "assignment", title: "Conversation assigned to you", link: `/w/${ctx.workspaceSlug || (await workspaceSlug(ctx.workspaceId))}/inbox?conversation=${id}` });
  return updated;
}

// ───────────────────────────── Decisions ─────────────────────────────

export const decisionInput = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("send"), draftMessageId: z.string().uuid().optional() }),
  z.object({ decision: z.literal("edit_and_send"), body: z.string().min(1).max(5000), subject: z.string().max(200).optional(), draftMessageId: z.string().uuid().optional() }),
  z.object({ decision: z.literal("snooze"), until: z.string().datetime() }),
  z.object({ decision: z.literal("mark_interested") }),
  z.object({ decision: z.literal("mark_not_interested"), stopSequences: z.boolean().default(true) }),
  z.object({ decision: z.literal("meeting_booked"), scheduledAt: z.string().datetime(), durationMin: z.number().int().min(5).max(480).default(30), notes: z.string().max(1000).optional() }),
  z.object({ decision: z.literal("booking_link") }),
  z.object({ decision: z.literal("start_sequence"), campaignId: z.string().uuid() }),
  z.object({ decision: z.literal("dismiss") }),
  z.object({ decision: z.literal("opt_out") }),
]);
export type DecisionInput = z.infer<typeof decisionInput>;

async function recordDecision(ctx: Ctx, conversationId: string, decision: DecisionInput["decision"], extra?: { inboundMessageId?: string | null; draftMessageId?: string | null; payload?: Prisma.InputJsonValue; decidedVia?: "ui" | "api" | "auto" }) {
  await prisma.replyDecision.create({ data: { workspaceId: ctx.workspaceId, conversationId, decision, decidedByUserId: ctx.userId ?? undefined, decidedVia: extra?.decidedVia ?? (ctx.actorType === "api_key" ? "api" : ctx.actorType === "user" ? "ui" : "auto"), inboundMessageId: extra?.inboundMessageId ?? undefined, draftMessageId: extra?.draftMessageId ?? undefined, payload: extra?.payload } });
  await prisma.conversation.update({ where: { id: conversationId }, data: { replyStatus: "decided", unreadCount: 0 } });
}

/** Dispatches an outbound reply through the conversation's channel. Creates a manual task when no authorized sender can send. */
export async function sendReply(ctx: Ctx, conversationId: string, input: { draftMessageId?: string; body?: string; subject?: string; decidedVia?: "ui" | "api" | "auto" }) {
  const convo = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId: ctx.workspaceId }, include: { lead: { include: { contact: true } }, senderAccount: { include: { mailbox: true } }, messages: { where: { direction: "inbound" }, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!convo) throw ApiError.notFound("conversation");
  const c = convo.lead.contact;
  const inbound = convo.messages[0];
  let message = input.draftMessageId ? await prisma.message.findFirst({ where: { id: input.draftMessageId, conversationId, direction: "outbound" } }) : null;
  if (input.draftMessageId && !message) throw ApiError.notFound("draft");
  if (message && ["sent", "delivered"].includes(message.status)) throw ApiError.conflict("This draft was already sent");
  const body = input.body?.trim() || message?.body;
  if (!body) throw ApiError.invalid("Reply body is empty");
  const subject = input.subject ?? message?.subject ?? (convo.channel === "email" ? `Re: ${(inbound?.subject ?? convo.subject ?? "").replace(/^Re:\s*/i, "")}`.trim() : null);
  const toAddress = convo.channel === "email" ? (inbound?.fromAddress ?? c.email) : convo.channel === "linkedin" ? c.linkedinUrl : c.xHandle;
  if (!toAddress) throw ApiError.invalid(`No ${convo.channel} identity for this person`);
  if (message) {
    message = await prisma.message.update({ where: { id: message.id }, data: { body, subject, status: "approved", approvedByUserId: ctx.userId ?? undefined, approvedAt: new Date(), editedByUserId: input.body && input.body.trim() !== message.body ? ctx.userId ?? undefined : undefined, toAddress } });
  } else {
    message = await prisma.message.create({ data: { workspaceId: ctx.workspaceId, leadId: convo.leadId, conversationId, channel: convo.channel, direction: "outbound", kind: "reply", subject, body, status: "approved", generatedBy: "user", approvedByUserId: ctx.userId ?? undefined, approvedAt: new Date(), senderAccountId: convo.senderAccountId ?? undefined, toAddress } });
  }
  // Use the conversation's sender, else any connected sender on the channel.
  const sender = convo.senderAccount ?? (await prisma.senderAccount.findFirst({ where: { workspaceId: ctx.workspaceId, channel: convo.channel === "manual" ? "email" : convo.channel, status: "connected" }, include: { mailbox: true }, orderBy: { createdAt: "asc" } }));
  let res: { providerMessageId: string; threadKey?: string } | { manual: true };
  try {
    if (convo.channel === "email") res = await sendEmailMessage(ctx, message, sender);
    else if (convo.channel === "linkedin") res = await sendLinkedInMessage(ctx, message, sender, "linkedin_message");
    else if (convo.channel === "x") res = await sendXMessage(ctx, message, sender);
    else res = { manual: true };
  } catch (err) {
    await prisma.message.update({ where: { id: message.id }, data: { status: "failed", error: { message: (err as Error).message } } });
    await recordActivity(ctx, { action: "message.failed", outcome: "failed", leadId: convo.leadId, conversationId, channel: convo.channel, metadata: { messageId: message.id, error: (err as Error).message } });
    throw new ApiError("provider_error", `Send failed: ${(err as Error).message}`);
  }
  if ("manual" in res) {
    const task = await prisma.task.create({ data: { workspaceId: ctx.workspaceId, leadId: convo.leadId, kind: convo.channel === "linkedin" ? "manual_linkedin_action" : convo.channel === "x" ? "manual_x_action" : "custom", title: `Send reply to ${c.fullName} on ${convo.channel}`, instructions: `${subject ? `Subject: ${subject}\n\n` : ""}${body}`, dueAt: new Date(), assignedUserId: convo.assignedUserId ?? ctx.userId ?? undefined } });
    await prisma.message.update({ where: { id: message.id }, data: { status: "scheduled", aiMeta: { ...((message.aiMeta as object) ?? {}), manualTaskId: task.id } as Prisma.InputJsonValue } });
    await recordActivity(ctx, { action: "task.created", leadId: convo.leadId, conversationId, channel: convo.channel, metadata: { taskId: task.id, reason: "no_connected_sender" } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { replyStatus: "decided", unreadCount: 0 } });
    return { message, manual: true as const, taskId: task.id };
  }
  message = await prisma.message.update({ where: { id: message.id }, data: { status: "sent", sentAt: new Date(), providerMessageId: res.providerMessageId, threadKey: res.threadKey ?? inbound?.threadKey ?? message.threadKey, senderAccountId: sender?.id ?? message.senderAccountId } });
  await prisma.conversation.update({ where: { id: conversationId }, data: { status: convo.status === "interested" || convo.status === "meeting_requested" ? convo.status : "awaiting_reply", replyStatus: "decided", lastMessageAt: new Date(), unreadCount: 0, senderAccountId: sender?.id ?? convo.senderAccountId } });
  await prisma.lead.update({ where: { id: convo.leadId }, data: { lastActivityAt: new Date() } });
  await recordActivity(ctx, { action: "reply.sent", leadId: convo.leadId, contactId: c.id, conversationId, campaignId: convo.campaignId, senderAccountId: sender?.id, channel: convo.channel, metadata: { messageId: message.id, decidedVia: input.decidedVia ?? "ui", generatedBy: message.generatedBy } });
  await emitWebhook(ctx.workspaceId, "message.sent", { messageId: message.id, leadId: convo.leadId, conversationId, channel: convo.channel, kind: "reply" });
  await recordDecision(ctx, conversationId, input.body ? "edit_and_send" : "send", { inboundMessageId: inbound?.id, draftMessageId: message.id, decidedVia: input.decidedVia });
  return { message, manual: false as const };
}

export async function decide(ctx: Ctx, conversationId: string, input: DecisionInput) {
  requirePermission(ctx, "inbox.decide");
  const convo = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId: ctx.workspaceId }, include: { lead: { include: { contact: true } }, messages: { where: { direction: "inbound" }, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!convo) throw ApiError.notFound("conversation");
  const inboundId = convo.messages[0]?.id ?? null;
  const slug = ctx.workspaceSlug || (await workspaceSlug(ctx.workspaceId));
  switch (input.decision) {
    case "send":
      return sendReply(ctx, conversationId, { draftMessageId: input.draftMessageId ?? (await latestDraftId(conversationId)) ?? undefined });
    case "edit_and_send":
      return sendReply(ctx, conversationId, { draftMessageId: input.draftMessageId ?? (await latestDraftId(conversationId)) ?? undefined, body: input.body, subject: input.subject });
    case "snooze": {
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: "snoozed", snoozedUntil: new Date(input.until) } });
      await recordDecision(ctx, conversationId, "snooze", { inboundMessageId: inboundId, payload: { until: input.until } });
      return { ok: true };
    }
    case "mark_interested": {
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: "interested" } });
      await prisma.lead.update({ where: { id: convo.leadId }, data: { status: "qualified", stage: "qualified", lastActivityAt: new Date() } });
      await recordDecision(ctx, conversationId, "mark_interested", { inboundMessageId: inboundId });
      await recordActivity(ctx, { action: "lead.qualified", leadId: convo.leadId, conversationId, channel: convo.channel });
      await emitWebhook(ctx.workspaceId, "lead.status_changed", { leadId: convo.leadId, status: "qualified", reason: "manual" });
      return { ok: true };
    }
    case "mark_not_interested": {
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: "not_interested" } });
      await prisma.lead.update({ where: { id: convo.leadId }, data: { status: "not_interested", stage: "not_interested", lastActivityAt: new Date() } });
      if (input.stopSequences) await stopAllForLead(ctx, convo.leadId, "not_interested");
      await recordDecision(ctx, conversationId, "mark_not_interested", { inboundMessageId: inboundId });
      await recordActivity(ctx, { action: "lead.not_interested", leadId: convo.leadId, conversationId, channel: convo.channel });
      await emitWebhook(ctx.workspaceId, "lead.status_changed", { leadId: convo.leadId, status: "not_interested", reason: "manual" });
      return { ok: true };
    }
    case "meeting_booked": {
      const meeting = await prisma.meeting.create({ data: { workspaceId: ctx.workspaceId, leadId: convo.leadId, conversationId, source: "manual", scheduledAt: new Date(input.scheduledAt), durationMin: input.durationMin, notes: input.notes } });
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: "meeting_requested" } });
      await prisma.lead.update({ where: { id: convo.leadId }, data: { status: "meeting_booked", stage: "meeting_booked", lastActivityAt: new Date() } });
      await recordDecision(ctx, conversationId, "meeting_booked", { inboundMessageId: inboundId, payload: { meetingId: meeting.id, scheduledAt: input.scheduledAt } });
      await recordActivity(ctx, { action: "meeting.booked", leadId: convo.leadId, contactId: convo.contactId, conversationId, campaignId: convo.campaignId, channel: convo.channel, metadata: { meetingId: meeting.id, scheduledAt: input.scheduledAt } });
      await emitWebhook(ctx.workspaceId, "meeting.booked", { meetingId: meeting.id, leadId: convo.leadId, conversationId, scheduledAt: input.scheduledAt });
      return { ok: true, meetingId: meeting.id };
    }
    case "booking_link": {
      const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId: ctx.workspaceId } });
      if (!settings?.bookingLink) throw ApiError.invalid("Add a booking link under Settings first");
      const first = convo.lead.contact.firstName ?? convo.lead.contact.fullName.split(" ")[0];
      const res = await sendReply(ctx, conversationId, { body: `Thanks ${first}. Here is a link to grab a time that suits you: ${settings.bookingLink}` });
      await prisma.replyDecision.updateMany({ where: { conversationId, draftMessageId: res.message.id }, data: { decision: "booking_link" } });
      return res;
    }
    case "start_sequence": {
      const r = await enrollLeads(ctx, input.campaignId, { leadIds: [convo.leadId] });
      await recordDecision(ctx, conversationId, "start_sequence", { inboundMessageId: inboundId, payload: { campaignId: input.campaignId, added: r.added.length, skipped: r.skipped as unknown as Prisma.InputJsonValue } });
      return { ok: true, added: r.added.length, skipped: r.skipped };
    }
    case "dismiss": {
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: "archived" } });
      await prisma.message.updateMany({ where: { conversationId, direction: "outbound", status: "awaiting_approval" }, data: { status: "rejected" } });
      await recordDecision(ctx, conversationId, "dismiss", { inboundMessageId: inboundId });
      return { ok: true };
    }
    case "opt_out": {
      const c = convo.lead.contact;
      if (c.email) await recordUnsubscribe(ctx.workspaceId, { email: c.email, messageId: inboundId, method: "manual" });
      if (c.linkedinUrl) await prisma.suppressionEntry.upsert({ where: { workspaceId_kind_value: { workspaceId: ctx.workspaceId, kind: "linkedin_url", value: c.linkedinUrl } }, create: { workspaceId: ctx.workspaceId, kind: "linkedin_url", value: c.linkedinUrl, reason: "do_not_contact", source: "inbox", addedByUserId: ctx.userId ?? undefined }, update: {} });
      if (c.xHandle) await prisma.suppressionEntry.upsert({ where: { workspaceId_kind_value: { workspaceId: ctx.workspaceId, kind: "x_handle", value: c.xHandle } }, create: { workspaceId: ctx.workspaceId, kind: "x_handle", value: c.xHandle, reason: "do_not_contact", source: "inbox", addedByUserId: ctx.userId ?? undefined }, update: {} });
      await prisma.lead.update({ where: { id: convo.leadId }, data: { status: "unsubscribed" } });
      await stopAllForLead(ctx, convo.leadId, "opted_out");
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: "archived" } });
      await recordDecision(ctx, conversationId, "opt_out", { inboundMessageId: inboundId });
      await audit(ctx, "lead.opted_out", { type: "lead", id: convo.leadId }, { via: "inbox", link: `/w/${slug}/inbox?conversation=${conversationId}` });
      return { ok: true };
    }
  }
}

async function latestDraftId(conversationId: string) {
  return (await prisma.message.findFirst({ where: { conversationId, direction: "outbound", kind: "reply", status: "awaiting_approval" }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id ?? null;
}

/** Re-run classification + drafting with reviewer guidance. */
export async function regenerateDraft(ctx: Ctx, conversationId: string, instructions?: string) {
  requirePermission(ctx, "inbox.decide");
  const convo = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId: ctx.workspaceId }, include: { messages: { where: { direction: "inbound" }, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!convo) throw ApiError.notFound("conversation");
  const inbound = convo.messages[0];
  if (!inbound) throw ApiError.invalid("No inbound message to reply to");
  const draft = await processReply(ctx.workspaceId, conversationId, inbound.id, { instructions, force: true });
  await audit(ctx, "reply.regenerated", { type: "conversation", id: conversationId }, { instructions: instructions ?? null, draftId: draft?.id ?? null });
  return draft;
}
