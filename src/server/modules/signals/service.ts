import "server-only";
import { z } from "zod";
import type { Prisma, SignalEventType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, jobCtx, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit, recordActivity, notify } from "@/server/modules/audit/service";
import { resolveProviders } from "@/server/providers/registry";
import type { SignalProvider } from "@/server/providers/types";
import { domainFromUrl } from "@/lib/normalize";
import { defineJob, enqueue } from "@/server/jobs";
import { decodeCursor, toPage } from "@/server/api/pagination";

/**
 * Buying signals. Provider-observed events are stored with `isInferred=false`
 * and `source=provider`; anything an LLM guesses is `isInferred=true` and is
 * displayed separately. Rules turn relevant signals into leads or campaign
 * additions.
 */
export const signalListQuery = z.object({
  eventType: z.string().optional(),
  accountId: z.string().uuid().optional(),
  inferred: z.enum(["true", "false"]).optional(),
  minRelevance: z.coerce.number().int().min(0).max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listSignals(ctx: Ctx, q: z.infer<typeof signalListQuery>) {
  requirePermission(ctx, "leads.read");
  const c = decodeCursor(q.cursor);
  const rows = await prisma.buyingSignal.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(q.eventType ? { eventType: q.eventType as SignalEventType } : {}),
      ...(q.accountId ? { accountId: q.accountId } : {}),
      ...(q.inferred ? { isInferred: q.inferred === "true" } : {}),
      ...(q.minRelevance !== undefined ? { relevanceScore: { gte: q.minRelevance } } : {}),
      ...(c ? { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] } : {}),
    },
    include: { account: { select: { id: true, name: true, domain: true } }, contact: { select: { id: true, fullName: true, lead: { select: { id: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
  });
  return toPage(rows, q.limit);
}

export const manualSignalInput = z.object({
  accountId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  companyName: z.string().max(160).optional(),
  companyDomain: z.string().max(253).optional(),
  eventType: z.enum(["hiring", "funding", "leadership_change", "expansion", "technology_adopted", "competitor_engagement", "linkedin_post_engagement", "x_post_engagement", "website_visit", "custom"]),
  title: z.string().min(1).max(200),
  occurredAt: z.coerce.date().optional(),
  url: z.string().url().max(1000).optional(),
  evidence: z.string().max(4000).optional(),
  relevanceScore: z.number().int().min(0).max(100).default(60),
});

export async function recordManualSignal(ctx: Ctx, input: z.infer<typeof manualSignalInput>) {
  requirePermission(ctx, "leads.manage");
  let accountId = input.accountId ?? null;
  if (!accountId && (input.companyDomain || input.companyName)) {
    const domain = domainFromUrl(input.companyDomain);
    const existing = await prisma.targetAccount.findFirst({ where: { workspaceId: ctx.workspaceId, OR: [...(domain ? [{ domain }] : []), ...(input.companyName ? [{ name: { equals: input.companyName, mode: "insensitive" as const } }] : [])] } });
    accountId = existing?.id ?? (await prisma.targetAccount.create({ data: { workspaceId: ctx.workspaceId, name: input.companyName ?? domain ?? "Unknown", domain: domain ?? undefined, source: "signal" } })).id;
  }
  const signal = await upsertSignal(ctx, {
    dedupeKey: `manual:${ctx.userId}:${Date.now()}`,
    source: "user",
    eventType: input.eventType,
    title: input.title,
    occurredAt: input.occurredAt ?? new Date(),
    url: input.url,
    evidence: { note: input.evidence ?? null, addedBy: ctx.userId },
    confidence: 1,
    relevanceScore: input.relevanceScore,
    isInferred: false,
    accountId,
    contactId: input.contactId ?? null,
  });
  await audit(ctx, "signal.recorded", { type: "signal", id: signal.id }, { eventType: input.eventType });
  return signal;
}

interface SignalInput {
  dedupeKey: string;
  source: "provider" | "user" | "ai_inference" | "webhook" | "x_api" | "linkedin_api";
  provider?: string;
  eventType: SignalEventType;
  title: string;
  occurredAt: Date;
  url?: string;
  evidence: Record<string, unknown>;
  confidence: number;
  relevanceScore: number;
  isInferred: boolean;
  accountId: string | null;
  contactId: string | null;
  expiresAt?: Date;
}

export async function upsertSignal(ctx: Ctx, s: SignalInput) {
  const existing = await prisma.buyingSignal.findUnique({ where: { workspaceId_dedupeKey: { workspaceId: ctx.workspaceId, dedupeKey: s.dedupeKey } } });
  if (existing) return existing;
  const created = await prisma.buyingSignal.create({
    data: {
      workspaceId: ctx.workspaceId,
      dedupeKey: s.dedupeKey,
      source: s.source,
      provider: s.provider,
      eventType: s.eventType,
      title: s.title,
      occurredAt: s.occurredAt,
      url: s.url,
      evidence: s.evidence as Prisma.InputJsonValue,
      confidence: s.confidence,
      relevanceScore: s.relevanceScore,
      isInferred: s.isInferred,
      accountId: s.accountId,
      contactId: s.contactId,
      expiresAt: s.expiresAt,
    },
  });
  await recordActivity(ctx, { action: "signal.detected", contactId: s.contactId, metadata: { signalId: created.id, eventType: s.eventType, inferred: s.isInferred, source: s.source } });
  await applyRules(ctx, created.id);
  return created;
}

/** Pulls hiring/funding signals for the workspace's tracked accounts from configured providers. */
export const syncSignalsJob = defineJob<{ workspaceId: string; roles?: string[]; sinceDays?: number }>("signals.sync", async ({ workspaceId, roles, sinceDays }) => {
  await syncProviderSignals(jobCtx(workspaceId), { roles, sinceDays });
});

export async function requestSignalSync(ctx: Ctx, input?: { roles?: string[]; sinceDays?: number }) {
  requirePermission(ctx, "leads.manage");
  const providers = await resolveProviders<SignalProvider>(ctx.workspaceId, "signals.hiring");
  if (providers.length === 0) throw new ApiError("not_configured", "Connect a signals-capable provider (Exa, or the mock provider in development) under Integrations.");
  await audit(ctx, "signals.sync_requested", { type: "workspace", id: ctx.workspaceId }, input ?? {});
  return enqueue("signals.sync", { workspaceId: ctx.workspaceId, ...input }, { workspaceId: ctx.workspaceId });
}

export async function syncProviderSignals(ctx: Ctx, input?: { roles?: string[]; sinceDays?: number }) {
  const providers = await resolveProviders<SignalProvider>(ctx.workspaceId, "signals.hiring");
  const accounts = await prisma.targetAccount.findMany({ where: { workspaceId: ctx.workspaceId, domain: { not: null }, doNotContact: false }, select: { id: true, domain: true, name: true }, take: 500 });
  const icps = await prisma.icpProfile.findMany({ where: { workspaceId: ctx.workspaceId, status: "active" }, select: { criteria: true } });
  const roles = input?.roles?.length ? input.roles : [...new Set(icps.flatMap((i) => ((i.criteria as { buyingSignals?: string[]; titles?: string[] }).buyingSignals ?? []).concat((i.criteria as { titles?: string[] }).titles ?? [])))].slice(0, 10);
  let stored = 0;
  const byDomain = new Map(accounts.map((a) => [a.domain as string, a]));
  for (const p of providers) {
    try {
      const domains = [...byDomain.keys()];
      for (let i = 0; i < Math.max(1, domains.length); i += 20) {
        const chunk = domains.slice(i, i + 20);
        const { events } = await p.instance.listSignals({ companyDomains: chunk.length ? chunk : undefined, roles, sinceDays: input?.sinceDays ?? 30, limit: 100 });
        for (const e of events) {
          const domain = domainFromUrl(e.company.domain ?? e.url ?? null);
          const account = domain ? byDomain.get(domain) : undefined;
          const before = await prisma.buyingSignal.count({ where: { workspaceId: ctx.workspaceId, dedupeKey: e.dedupeKey } });
          await upsertSignal(ctx, {
            dedupeKey: e.dedupeKey,
            source: "provider",
            provider: p.descriptor.id,
            eventType: e.eventType,
            title: e.title,
            occurredAt: new Date(e.occurredAt),
            url: e.url,
            evidence: { ...e.evidence, company: e.company },
            confidence: e.confidence,
            relevanceScore: account ? 70 : 40,
            isInferred: false,
            accountId: account?.id ?? null,
            contactId: null,
            expiresAt: new Date(Date.now() + 90 * 86400_000),
          });
          if (before === 0) stored++;
        }
        if (domains.length === 0) break;
      }
    } catch (err) {
      await recordActivity(ctx, { action: "signals.sync_failed", outcome: "failed", metadata: { provider: p.descriptor.id, error: (err as Error).message } });
    }
  }
  await recordActivity(ctx, { action: "signals.synced", metadata: { stored, providers: providers.map((p) => p.descriptor.id), roles } });
  return { stored };
}

// ───────────────────────────── Rules ─────────────────────────────

export const ruleInput = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  match: z.object({
    eventTypes: z.array(z.string()).default([]),
    minRelevance: z.number().int().min(0).max(100).default(50),
    includeInferred: z.boolean().default(false),
    minConfidence: z.number().min(0).max(1).default(0.5),
  }),
  action: z.enum(["create_lead", "add_to_campaign", "notify"]),
  campaignId: z.string().uuid().nullable().optional(),
  icpProfileId: z.string().uuid().nullable().optional(),
});

export async function listRules(ctx: Ctx) {
  requirePermission(ctx, "leads.read");
  return prisma.signalRule.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "asc" }, include: { campaign: { select: { id: true, name: true } }, icpProfile: { select: { id: true, name: true } } } });
}

export async function createRule(ctx: Ctx, input: z.infer<typeof ruleInput>) {
  requirePermission(ctx, "leads.manage");
  const rule = await prisma.signalRule.create({ data: { workspaceId: ctx.workspaceId, name: input.name, enabled: input.enabled, match: input.match, action: input.action, campaignId: input.campaignId ?? undefined, icpProfileId: input.icpProfileId ?? undefined } });
  await audit(ctx, "signal_rule.created", { type: "signal_rule", id: rule.id }, { action: input.action });
  return rule;
}

export async function updateRule(ctx: Ctx, id: string, input: Partial<z.infer<typeof ruleInput>>) {
  requirePermission(ctx, "leads.manage");
  const res = await prisma.signalRule.updateMany({ where: { id, workspaceId: ctx.workspaceId }, data: { name: input.name, enabled: input.enabled, match: input.match, action: input.action, campaignId: input.campaignId, icpProfileId: input.icpProfileId } });
  if (res.count === 0) throw ApiError.notFound("rule");
  await audit(ctx, "signal_rule.updated", { type: "signal_rule", id }, { fields: Object.keys(input) });
}

export async function deleteRule(ctx: Ctx, id: string) {
  requirePermission(ctx, "leads.manage");
  const res = await prisma.signalRule.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
  if (res.count === 0) throw ApiError.notFound("rule");
  await audit(ctx, "signal_rule.deleted", { type: "signal_rule", id });
}

/** Evaluates enabled rules against one signal. Idempotent: a rule acts once per signal. */
export async function applyRules(ctx: Ctx, signalId: string) {
  const signal = await prisma.buyingSignal.findUnique({ where: { id: signalId }, include: { account: true, contact: { include: { lead: true } } } });
  if (!signal) return;
  const rules = await prisma.signalRule.findMany({ where: { workspaceId: ctx.workspaceId, enabled: true } });
  for (const rule of rules) {
    const m = rule.match as { eventTypes?: string[]; minRelevance?: number; includeInferred?: boolean; minConfidence?: number };
    if (m.eventTypes?.length && !m.eventTypes.includes(signal.eventType)) continue;
    if ((m.minRelevance ?? 0) > signal.relevanceScore) continue;
    if (!m.includeInferred && signal.isInferred) continue;
    if ((m.minConfidence ?? 0) > signal.confidence) continue;
    const already = await prisma.activityEvent.findFirst({ where: { workspaceId: ctx.workspaceId, action: "signal_rule.fired", metadata: { path: ["signalId"], equals: signalId } } });
    if (already && (already.metadata as { ruleId?: string }).ruleId === rule.id) continue;
    if (rule.action === "notify") {
      await notify(ctx, { type: "signal", title: `Signal: ${signal.title}`, body: signal.account?.name ?? undefined, link: signal.account ? `/w/${ctx.workspaceSlug}/signals?accountId=${signal.account.id}` : undefined });
    } else if (rule.action === "create_lead" && signal.contact?.lead) {
      await prisma.lead.update({ where: { id: signal.contact.lead.id }, data: { status: signal.contact.lead.status === "new" ? "reviewing" : undefined, icpProfileId: rule.icpProfileId ?? undefined, lastActivityAt: new Date() } });
      await notify(ctx, { type: "signal", title: `Lead flagged by signal: ${signal.contact.fullName}`, body: signal.title, link: `/w/${ctx.workspaceSlug}/leads/${signal.contact.lead.id}` });
    } else if (rule.action === "add_to_campaign" && rule.campaignId && signal.contact?.lead) {
      // Campaign enrolment is wired in Phase 4; record the intent so it is auditable now.
      await notify(ctx, { type: "signal", title: `Signal suggests adding ${signal.contact.fullName} to a campaign`, body: signal.title, link: `/w/${ctx.workspaceSlug}/leads/${signal.contact.lead.id}` });
    }
    await recordActivity(ctx, { action: "signal_rule.fired", contactId: signal.contactId, metadata: { signalId, ruleId: rule.id, action: rule.action } });
  }
}
