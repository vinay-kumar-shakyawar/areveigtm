import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, jobCtx, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit, recordActivity } from "@/server/modules/audit/service";
import { aiStructured, companyContext, GROUNDING_RULES } from "@/server/ai";
import { withFallback } from "@/server/providers/registry";
import type { WebPage, WebResearchProvider } from "@/server/providers/types";
import type { IcpCriteriaV1 } from "@/server/modules/icp/schemas";
import { defineJob, enqueue } from "@/server/jobs";

const PROMPT_VERSION = "lead-research-v1";

/** What the research step must answer. Each score is 0–100 with factors and evidence. */
export const researchSchema = z.object({
  whoIsThisPerson: z.string().describe("Two sentences: role, tenure if known, what they are responsible for"),
  whatCompanyDoes: z.string(),
  whyTheyMightNeedUs: z.string().describe("Grounded in our value proposition and their situation; say 'unclear' if evidence is thin"),
  likelyChallenges: z.array(z.string()).max(5),
  signalsFound: z.array(z.object({ signal: z.string(), evidence: z.string(), observed: z.boolean().describe("true when taken from provided signal/evidence data, false when inferred") })),
  evidence: z.array(z.object({ claim: z.string(), source: z.string().describe("URL or 'contact record' / 'account record' / 'signal'") })),
  bestAngle: z.string().describe("The single most credible reason to reach out now"),
  bestChannel: z.enum(["email", "linkedin", "x"]),
  suggestedOpener: z.string().max(400).describe("One or two sentences, no flattery, no invented facts"),
  suggestedValueProp: z.string().max(400),
  nextAction: z.string().max(200),
  scores: z.object({
    icpFit: z.object({ score: z.number().int().min(0).max(100), factors: z.array(z.object({ factor: z.string(), weight: z.number().min(0).max(1), evidence: z.string(), contribution: z.number().int().min(-100).max(100) })) }),
    intent: z.object({ score: z.number().int().min(0).max(100), factors: z.array(z.object({ factor: z.string(), weight: z.number().min(0).max(1), evidence: z.string(), contribution: z.number().int().min(-100).max(100) })) }),
    quality: z.object({ score: z.number().int().min(0).max(100), factors: z.array(z.object({ factor: z.string(), weight: z.number().min(0).max(1), evidence: z.string(), contribution: z.number().int().min(-100).max(100) })) }),
  }),
  confidence: z.number().min(0).max(1).describe("How much evidence supported this research"),
  gaps: z.array(z.string()).describe("What we could not find"),
});
export type LeadResearchOutput = z.infer<typeof researchSchema>;

export const researchJob = defineJob<{ workspaceId: string; leadId: string; fetchWebsite?: boolean }>("lead.research", async ({ workspaceId, leadId, fetchWebsite }) => {
  await researchLead(jobCtx(workspaceId), leadId, { fetchWebsite });
});

export async function requestResearch(ctx: Ctx, leadId: string, options?: { fetchWebsite?: boolean }) {
  requirePermission(ctx, "leads.manage");
  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: ctx.workspaceId } });
  if (!lead) throw ApiError.notFound("lead");
  await audit(ctx, "lead.research_requested", { type: "lead", id: leadId });
  return enqueue("lead.research", { workspaceId: ctx.workspaceId, leadId, fetchWebsite: options?.fetchWebsite ?? true }, { workspaceId: ctx.workspaceId });
}

export async function researchLead(ctx: Ctx, leadId: string, options?: { fetchWebsite?: boolean }) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId: ctx.workspaceId },
    include: {
      contact: { include: { signals: { orderBy: { occurredAt: "desc" }, take: 10 } } },
      account: { include: { signals: { orderBy: { occurredAt: "desc" }, take: 10 } } },
      icpProfile: true,
      sources: { orderBy: { occurredAt: "desc" }, take: 5 },
    },
  });
  if (!lead) throw ApiError.notFound("lead");
  const icp = lead.icpProfile ?? (await prisma.icpProfile.findFirst({ where: { workspaceId: ctx.workspaceId, isDefault: true } })) ?? (await prisma.icpProfile.findFirst({ where: { workspaceId: ctx.workspaceId, status: "active" } }));
  const company = await companyContext(ctx.workspaceId);

  const pages: WebPage[] = [];
  const site = lead.account?.website ?? (lead.account?.domain ? `https://${lead.account.domain}` : null);
  if (options?.fetchWebsite !== false && site) {
    try {
      const { result } = await withFallback<WebResearchProvider, WebPage>(ctx.workspaceId, "web.fetch", async (p) => {
        if (!p.instance.fetchPage) throw new Error("unsupported");
        return p.instance.fetchPage(site);
      }, { usage: { leadId } });
      if (result.text.length > 100) pages.push(result);
    } catch {
      /* website unavailable: research proceeds on stored data only */
    }
  }

  const c = lead.contact;
  const a = lead.account;
  const signals = [...(a?.signals ?? []), ...c.signals].map((s) => `- [${s.isInferred ? "INFERRED" : "OBSERVED"}] ${s.eventType}: ${s.title} (${s.occurredAt.toISOString().slice(0, 10)}${s.url ? `, ${s.url}` : ""}) relevance ${s.relevanceScore}`);
  const contactBlock = [
    `Name: ${c.fullName}`,
    c.title && `Title: ${c.title}`,
    c.headline && `Headline: ${c.headline}`,
    c.seniority && `Seniority: ${c.seniority}`,
    c.location && `Location: ${c.location}${c.country ? ` (${c.country})` : ""}`,
    c.email ? `Email: present (${c.emailStatus})` : "Email: missing",
    c.linkedinUrl && `LinkedIn: ${c.linkedinUrl}`,
    c.xHandle && `X: @${c.xHandle}`,
    `Sources: ${lead.sources.map((s) => `${s.kind}${s.provider ? ` via ${s.provider}` : ""}`).join(", ") || "unknown"}`,
  ].filter(Boolean);
  const accountBlock = a
    ? [
        `Company: ${a.name}${a.domain ? ` (${a.domain})` : ""}`,
        a.industry && `Industry: ${a.industry}`,
        a.headcount && `Headcount: ${a.headcount}`,
        a.location && `Location: ${a.location}`,
        a.description && `Description: ${a.description}`,
        a.technologies.length && `Technologies: ${a.technologies.join(", ")}`,
        a.fundingStage && `Funding stage: ${a.fundingStage}`,
      ].filter(Boolean)
    : [`Company: ${c.companyNameRaw ?? "unknown"}`];

  const { data, meta } = await aiStructured<LeadResearchOutput>(ctx.workspaceId, {
    schema: researchSchema,
    schemaName: "lead_research",
    purpose: "lead.research",
    promptVersion: PROMPT_VERSION,
    maxTokens: 6000,
    usage: { leadId },
    messages: [
      {
        role: "system",
        content: `You are a B2B sales researcher. Produce evidence-based research and transparent scores for one prospect.
${GROUNDING_RULES}
Scoring guidance:
- icpFit: how well the person and company match the ICP criteria. Weight title/seniority, industry, geography, company size. Unknown attributes reduce confidence, not the score.
- intent: only OBSERVED signals count fully; INFERRED signals count at most half. No signals → score 10–25 with an explanation.
- quality: completeness and verification of contact data, reachability on the preferred channel, and seniority appropriate to buy.
- Every factor must cite evidence from the provided data. Contributions sum roughly to the score.
- suggestedOpener must reference something verifiable (their title, company, an observed signal, a page quote). If nothing verifiable exists, open with a plain question about their responsibility.`,
      },
      {
        role: "user",
        content: `OUR COMPANY\n${company}\n\nICP CRITERIA\n${icp ? JSON.stringify(icp.criteria as IcpCriteriaV1) : "none defined"}\n\nPROSPECT\n${contactBlock.join("\n")}\n\nCOMPANY\n${accountBlock.join("\n")}\n\nSIGNALS\n${signals.join("\n") || "none"}\n\nWEB PAGES\n${pages.map((p) => `### ${p.url}\n${p.text.slice(0, 5000)}`).join("\n\n") || "none fetched"}`,
      },
    ],
  });

  const research = await prisma.$transaction(async (tx) => {
    const r = await tx.leadResearch.create({
      data: {
        workspaceId: ctx.workspaceId,
        leadId,
        summary: data as unknown as Prisma.InputJsonValue,
        sources: pages.map((p) => ({ url: p.url, title: p.title ?? null })) as Prisma.InputJsonValue,
        modelProvider: meta.provider,
        model: meta.model,
        promptVersion: meta.promptVersion,
        tokenUsage: meta.usage,
      },
    });
    await tx.leadScore.updateMany({ where: { leadId, isCurrent: true }, data: { isCurrent: false } });
    for (const kind of ["icp_fit", "intent", "quality"] as const) {
      const s = kind === "icp_fit" ? data.scores.icpFit : kind === "intent" ? data.scores.intent : data.scores.quality;
      await tx.leadScore.create({
        data: { workspaceId: ctx.workspaceId, leadId, kind, score: s.score, explanation: { factors: s.factors, confidence: data.confidence, researchId: r.id } as Prisma.InputJsonValue, modelProvider: meta.provider, model: meta.model, promptVersion: meta.promptVersion },
      });
    }
    await tx.lead.update({ where: { id: leadId }, data: { lastActivityAt: new Date() } });
    return r;
  });
  // Inferred signals the model surfaced are stored as inferences, clearly flagged.
  for (const s of data.signalsFound.filter((x) => !x.observed).slice(0, 5)) {
    await prisma.buyingSignal
      .create({
        data: {
          workspaceId: ctx.workspaceId,
          accountId: lead.accountId,
          contactId: lead.contactId,
          source: "ai_inference",
          provider: meta.provider,
          eventType: "custom",
          title: s.signal.slice(0, 200),
          occurredAt: new Date(),
          evidence: { evidence: s.evidence, researchId: research.id },
          confidence: Math.min(0.5, data.confidence),
          relevanceScore: 30,
          isInferred: true,
          dedupeKey: `inferred:${leadId}:${s.signal.toLowerCase().slice(0, 60)}`,
        },
      })
      .catch(() => {});
  }
  await recordActivity(ctx, { action: "lead.researched", leadId, contactId: lead.contactId, metadata: { provider: meta.provider, model: meta.model, icpFit: data.scores.icpFit.score, intent: data.scores.intent.score, quality: data.scores.quality.score, pages: pages.length } });
  return research;
}
