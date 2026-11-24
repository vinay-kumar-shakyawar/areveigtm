import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";

/**
 * Analytics computed from stored events, never estimated. Every ratio states its
 * numerator and denominator (see docs/analytics/metrics.md). All queries are
 * scoped to the workspace and the selected date range / campaign.
 */
export const analyticsQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
  campaignId: z.string().uuid().optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuery>;

export interface Ratio {
  value: number | null;
  numerator: number;
  denominator: number;
  /** Human-readable definition, e.g. "leads replied / leads contacted". */
  definition: string;
}

function ratio(numerator: number, denominator: number, definition: string): Ratio {
  return { value: denominator > 0 ? numerator / denominator : null, numerator, denominator, definition };
}

function range(q: AnalyticsQuery) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - q.days * 86400_000);
  return { from, to };
}

type Row = { action: string; channel: string | null; leads: bigint; events: bigint };

export async function overview(ctx: Ctx, q: AnalyticsQuery) {
  requirePermission(ctx, "analytics.read");
  const { from, to } = range(q);
  const wsId = ctx.workspaceId;
  const campaignFilter = q.campaignId ? Prisma.sql`AND "campaignId" = ${q.campaignId}::uuid` : Prisma.empty;

  // Distinct leads and raw event counts per action and channel within the range.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT action, channel::text AS channel, COUNT(DISTINCT "leadId") AS leads, COUNT(*) AS events
    FROM "ActivityEvent"
    WHERE "workspaceId" = ${wsId}::uuid AND "occurredAt" >= ${from} AND "occurredAt" < ${to} ${campaignFilter}
    GROUP BY action, channel`;
  const leadsFor = (actions: string[], channel?: string) => Number(rows.filter((r) => actions.includes(r.action) && (!channel || r.channel === channel)).reduce((n, r) => n + r.leads, BigInt(0)));
  const eventsFor = (actions: string[], channel?: string) => Number(rows.filter((r) => actions.includes(r.action) && (!channel || r.channel === channel)).reduce((n, r) => n + r.events, BigInt(0)));

  // Distinct leads contacted/replied need cross-channel dedupe: query again without channel grouping.
  const distinct = await prisma.$queryRaw<{ action: string; leads: bigint }[]>`
    SELECT action, COUNT(DISTINCT "leadId") AS leads FROM "ActivityEvent"
    WHERE "workspaceId" = ${wsId}::uuid AND "occurredAt" >= ${from} AND "occurredAt" < ${to} ${campaignFilter}
      AND action IN ('message.sent','invite.sent','reply.received','meeting.booked','lead.qualified','sequence.started','email.bounced','unsubscribe')
    GROUP BY action`;
  const d = (a: string) => Number(distinct.find((x) => x.action === a)?.leads ?? BigInt(0));
  const contacted = Number((await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT "leadId") AS n FROM "ActivityEvent"
    WHERE "workspaceId" = ${wsId}::uuid AND "occurredAt" >= ${from} AND "occurredAt" < ${to} ${campaignFilter} AND action IN ('message.sent','invite.sent')`)[0]?.n ?? BigInt(0));

  // Funnel (distinct leads). Discovery/review stages come from lead rows created in range.
  const leadWhere: Prisma.LeadWhereInput = { workspaceId: wsId, createdAt: { gte: from, lt: to }, ...(q.campaignId ? { campaignLeads: { some: { campaignId: q.campaignId } } } : {}) };
  const [discovered, approved] = await Promise.all([prisma.lead.count({ where: leadWhere }), prisma.lead.count({ where: { ...leadWhere, status: { notIn: ["new", "reviewing", "rejected"] } } })]);
  const enrolled = d("sequence.started");
  const replied = d("reply.received");
  const qualified = d("lead.qualified");
  const meetings = d("meeting.booked");
  const funnel = [
    { stage: "Discovered", leads: discovered, definition: "leads created in range" },
    { stage: "Approved", leads: approved, definition: "leads created in range not new/reviewing/rejected" },
    { stage: "Enrolled", leads: enrolled, definition: "distinct leads with sequence.started" },
    { stage: "Contacted", leads: contacted, definition: "distinct leads with message.sent or invite.sent" },
    { stage: "Replied", leads: replied, definition: "distinct leads with reply.received" },
    { stage: "Qualified", leads: qualified, definition: "distinct leads with lead.qualified (manual or AI interested/question)" },
    { stage: "Meeting booked", leads: meetings, definition: "distinct leads with meeting.booked" },
  ];

  // Reply classification mix from the inbound messages' triage metadata.
  const classRows = await prisma.$queryRaw<{ classification: string | null; n: bigint }[]>`
    SELECT classification::text AS classification, COUNT(*) AS n FROM "Conversation"
    WHERE "workspaceId" = ${wsId}::uuid AND "createdAt" >= ${from} AND "createdAt" < ${to} ${campaignFilter}
    GROUP BY classification ORDER BY n DESC`;
  const classifications = classRows.map((r) => ({ classification: r.classification ?? "unclassified", count: Number(r.n) }));
  const positive = classifications.filter((c) => ["interested", "question"].includes(c.classification)).reduce((n, c) => n + c.count, 0);
  const totalClassified = classifications.filter((c) => c.classification !== "unclassified").reduce((n, c) => n + c.count, 0);

  // Channel breakdown (events, not leads).
  const channels = (["email", "linkedin", "x"] as const).map((ch) => ({
    channel: ch,
    sent: eventsFor(["message.sent", "invite.sent"], ch),
    delivered: eventsFor(["message.delivered"], ch),
    replies: eventsFor(["reply.received"], ch),
    bounces: eventsFor(["email.bounced", "email.complained"], ch),
    manualTasks: eventsFor(["task.created"], ch),
    replyRate: ratio(leadsFor(["reply.received"], ch), leadsFor(["message.sent", "invite.sent"], ch), "leads replied on channel / leads contacted on channel"),
  }));

  // AI draft acceptance among sent AI-generated messages.
  const aiSent = await prisma.message.groupBy({ by: ["generatedBy"], where: { workspaceId: wsId, direction: "outbound", status: { in: ["sent", "delivered"] }, sentAt: { gte: from, lt: to }, ...(q.campaignId ? { campaignLead: { campaignId: q.campaignId } } : {}) }, _count: { _all: true } });
  const aiEdited = await prisma.message.count({ where: { workspaceId: wsId, direction: "outbound", generatedBy: "ai", status: { in: ["sent", "delivered"] }, sentAt: { gte: from, lt: to }, editedByUserId: { not: null }, ...(q.campaignId ? { campaignLead: { campaignId: q.campaignId } } : {}) } });
  const aiSentCount = aiSent.find((g) => g.generatedBy === "ai")?._count._all ?? 0;
  const autoSent = await prisma.replyDecision.count({ where: { workspaceId: wsId, decidedVia: "auto", decidedAt: { gte: from, lt: to } } });

  // Time series by day (UTC): sent, replies, meetings.
  const series = await prisma.$queryRaw<{ day: Date; action: string; n: bigint }[]>`
    SELECT date_trunc('day', "occurredAt") AS day, action, COUNT(*) AS n FROM "ActivityEvent"
    WHERE "workspaceId" = ${wsId}::uuid AND "occurredAt" >= ${from} AND "occurredAt" < ${to} ${campaignFilter}
      AND action IN ('message.sent','invite.sent','reply.received','meeting.booked')
    GROUP BY day, action ORDER BY day`;
  const byDay = new Map<string, { date: string; sent: number; replies: number; meetings: number }>();
  for (let t = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); t < to; t = new Date(t.getTime() + 86400_000)) {
    byDay.set(t.toISOString().slice(0, 10), { date: t.toISOString().slice(0, 10), sent: 0, replies: 0, meetings: 0 });
  }
  for (const r of series) {
    const key = new Date(r.day).toISOString().slice(0, 10);
    const row = byDay.get(key) ?? { date: key, sent: 0, replies: 0, meetings: 0 };
    if (r.action === "message.sent" || r.action === "invite.sent") row.sent += Number(r.n);
    else if (r.action === "reply.received") row.replies += Number(r.n);
    else if (r.action === "meeting.booked") row.meetings += Number(r.n);
    byDay.set(key, row);
  }

  // Campaign table.
  const campaignRows = await prisma.$queryRaw<{ campaignId: string; action: string; leads: bigint; events: bigint }[]>`
    SELECT "campaignId", action, COUNT(DISTINCT "leadId") AS leads, COUNT(*) AS events FROM "ActivityEvent"
    WHERE "workspaceId" = ${wsId}::uuid AND "occurredAt" >= ${from} AND "occurredAt" < ${to} AND "campaignId" IS NOT NULL
      AND action IN ('sequence.started','message.sent','invite.sent','reply.received','meeting.booked','email.bounced','unsubscribe','lead.qualified')
    GROUP BY "campaignId", action`;
  const campaignIds = [...new Set(campaignRows.map((r) => r.campaignId))];
  const campaignsMeta = await prisma.campaign.findMany({ where: { workspaceId: wsId, ...(campaignIds.length ? { id: { in: campaignIds } } : {}) }, select: { id: true, name: true, status: true, _count: { select: { campaignLeads: true } } } });
  const campaigns = campaignsMeta
    .map((c) => {
      const r = (a: string[], f: "leads" | "events") => Number(campaignRows.filter((x) => x.campaignId === c.id && a.includes(x.action)).reduce((n, x) => n + x[f], BigInt(0)));
      const contactedC = Number(campaignRows.filter((x) => x.campaignId === c.id && ["message.sent", "invite.sent"].includes(x.action)).reduce((n, x) => n + x.leads, BigInt(0)));
      return { id: c.id, name: c.name, status: c.status, enrolled: c._count.campaignLeads, sent: r(["message.sent", "invite.sent"], "events"), contacted: contactedC, replied: r(["reply.received"], "leads"), meetings: r(["meeting.booked"], "leads"), bounces: r(["email.bounced"], "events"), unsubscribes: r(["unsubscribe"], "events"), replyRate: ratio(r(["reply.received"], "leads"), contactedC, "leads replied / leads contacted (same campaign; contacted may count a lead twice across channels)") };
    })
    .sort((a, b) => b.sent - a.sent);

  // Sender table.
  const senderRows = await prisma.$queryRaw<{ senderAccountId: string; action: string; n: bigint }[]>`
    SELECT "senderAccountId", action, COUNT(*) AS n FROM "ActivityEvent"
    WHERE "workspaceId" = ${wsId}::uuid AND "occurredAt" >= ${from} AND "occurredAt" < ${to} AND "senderAccountId" IS NOT NULL ${campaignFilter}
      AND action IN ('message.sent','invite.sent','reply.received','email.bounced','message.failed')
    GROUP BY "senderAccountId", action`;
  const sendersMeta = await prisma.senderAccount.findMany({ where: { workspaceId: wsId }, select: { id: true, displayName: true, channel: true, provider: true, status: true, mailbox: { select: { emailAddress: true, dailyLimit: true } } } });
  const senders = sendersMeta.map((s) => {
    const n = (a: string[]) => Number(senderRows.filter((x) => x.senderAccountId === s.id && a.includes(x.action)).reduce((acc, x) => acc + x.n, BigInt(0)));
    return { id: s.id, name: s.mailbox?.emailAddress ?? s.displayName, channel: s.channel, provider: s.provider, status: s.status, dailyLimit: s.mailbox?.dailyLimit ?? null, sent: n(["message.sent", "invite.sent"]), replies: n(["reply.received"]), bounces: n(["email.bounced"]), failed: n(["message.failed"]), bounceRate: ratio(n(["email.bounced"]), n(["message.sent"]), "bounced events / sent events for this sender") };
  });

  // Provider usage and cost.
  const usage = await prisma.providerUsage.groupBy({ by: ["provider", "operation"], where: { workspaceId: wsId, occurredAt: { gte: from, lt: to } }, _count: { _all: true }, _sum: { units: true, estimatedCostCents: true } });
  const providerUsage = usage.map((u) => ({ provider: u.provider, operation: u.operation, calls: u._count._all, units: u._sum.units ?? 0, estimatedCostCents: u._sum.estimatedCostCents ?? 0 })).sort((a, b) => b.calls - a.calls);

  // Median time to first reply (hours) among leads that replied in range.
  const ttr = await prisma.$queryRaw<{ median_hours: number | null }[]>`
    WITH first_sent AS (
      SELECT "leadId", MIN("occurredAt") AS sent_at FROM "ActivityEvent"
      WHERE "workspaceId" = ${wsId}::uuid AND action IN ('message.sent','invite.sent') ${campaignFilter} GROUP BY "leadId"),
    first_reply AS (
      SELECT "leadId", MIN("occurredAt") AS reply_at FROM "ActivityEvent"
      WHERE "workspaceId" = ${wsId}::uuid AND action = 'reply.received' AND "occurredAt" >= ${from} AND "occurredAt" < ${to} ${campaignFilter} GROUP BY "leadId")
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.reply_at - s.sent_at)) / 3600.0) AS median_hours
    FROM first_reply r JOIN first_sent s ON s."leadId" = r."leadId" WHERE r.reply_at > s.sent_at`;

  return {
    range: { from: from.toISOString(), to: to.toISOString(), campaignId: q.campaignId ?? null },
    headline: {
      contacted,
      replied,
      meetings,
      replyRate: ratio(replied, contacted, "distinct leads with a reply / distinct leads contacted"),
      positiveReplyRate: ratio(positive, totalClassified, "conversations classified interested or question / conversations classified"),
      meetingRate: ratio(meetings, replied, "distinct leads with a meeting / distinct leads that replied"),
      bounceRate: ratio(eventsFor(["email.bounced"]), eventsFor(["message.sent"], "email"), "email bounce events / email sent events"),
      unsubscribeRate: ratio(eventsFor(["unsubscribe"]), eventsFor(["message.sent"], "email"), "unsubscribe events / email sent events"),
      medianHoursToReply: ttr[0]?.median_hours ?? null,
      aiDraftsSentUnedited: ratio(aiSentCount - aiEdited, aiSentCount, "AI-generated messages sent without edits / AI-generated messages sent"),
      autoSentReplies: autoSent,
    },
    funnel,
    classifications,
    channels,
    timeseries: [...byDay.values()],
    campaigns,
    senders,
    providerUsage,
  };
}

export type AnalyticsOverview = Awaited<ReturnType<typeof overview>>;
