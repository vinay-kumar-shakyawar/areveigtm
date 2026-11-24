import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit } from "@/server/modules/audit/service";
import { aiStructured, GROUNDING_RULES } from "@/server/ai";
import { withFallback } from "@/server/providers/registry";
import type { WebResearchProvider, WebPage } from "@/server/providers/types";
import { companyDraftSchema, type CompanyDraft, type CompanyProfileInput } from "@/server/modules/company/schemas";

export async function getCompanyProfile(ctx: Ctx) {
  requirePermission(ctx, "company.read");
  return prisma.companyProfile.upsert({ where: { workspaceId: ctx.workspaceId }, update: {}, create: { workspaceId: ctx.workspaceId } });
}

export async function updateCompanyProfile(ctx: Ctx, input: CompanyProfileInput, options?: { expectedRevision?: number }) {
  requirePermission(ctx, "company.update");
  const current = await getCompanyProfile(ctx);
  if (options?.expectedRevision !== undefined && options.expectedRevision !== current.revision) {
    throw new ApiError("revision_conflict", "The company profile changed since you loaded it. Reload and try again.", { details: { currentRevision: current.revision } });
  }
  const data: Prisma.CompanyProfileUpdateInput = {
    ...input,
    competitors: input.competitors as Prisma.InputJsonValue | undefined,
    existingCustomers: input.existingCustomers as Prisma.InputJsonValue | undefined,
    revision: { increment: 1 },
    // Any edit after approval needs re-approval so AI never works from stale, unreviewed facts.
    approvedAt: null,
    approvedByUserId: null,
  };
  const updated = await prisma.companyProfile.update({ where: { workspaceId: ctx.workspaceId }, data });
  await audit(ctx, "company.updated", { type: "company_profile", id: updated.id }, { fields: Object.keys(input), revision: updated.revision });
  return updated;
}

export async function approveCompanyProfile(ctx: Ctx) {
  requirePermission(ctx, "company.update");
  const current = await getCompanyProfile(ctx);
  if (!current.companyName || !current.description) throw ApiError.invalid("Add at least a company name and a description before approving.");
  const updated = await prisma.companyProfile.update({
    where: { workspaceId: ctx.workspaceId },
    data: { approvedAt: new Date(), approvedByUserId: ctx.userId },
  });
  await audit(ctx, "company.approved", { type: "company_profile", id: updated.id }, { revision: updated.revision });
  return updated;
}

const PROMPT_VERSION = "company-draft-v1";

/**
 * Fetches the company's public pages and asks the LLM for a grounded draft.
 * The draft is stored separately; nothing changes on the profile until the
 * user applies it.
 */
export async function draftFromWebsite(ctx: Ctx, website: string) {
  requirePermission(ctx, "company.update");
  const url = normalizeUrl(website);
  const pages = await fetchCompanyPages(ctx.workspaceId, url);
  if (pages.length === 0) throw new ApiError("provider_error", `Could not read any page from ${url}. Check the address or add a web research provider.`);

  const evidenceText = pages
    .map((p) => `### ${p.url}${p.title ? ` — ${p.title}` : ""}\n${p.text.slice(0, 6000)}`)
    .join("\n\n");

  const { data, meta } = await aiStructured<CompanyDraft>(ctx.workspaceId, {
    schema: companyDraftSchema,
    schemaName: "company_profile_draft",
    purpose: "company.draft",
    promptVersion: PROMPT_VERSION,
    maxTokens: 4000,
    messages: [
      {
        role: "system",
        content: `You build a factual company profile for a go-to-market team from the company's own web pages.\n${GROUNDING_RULES}\n- List competitors only if the pages name them or compare against them; otherwise return an empty list.\n- List existing customers only when the pages name them (logos, testimonials, case studies).\n- targetCustomerType and valueProposition should be written from the buyer's perspective, specific to this company.`,
      },
      { role: "user", content: `Website: ${url}\n\nPages:\n\n${evidenceText}` },
    ],
  });

  const updated = await prisma.companyProfile.update({
    where: { workspaceId: ctx.workspaceId },
    data: {
      website: url,
      aiDraft: { ...data, generatedAt: new Date().toISOString(), provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion } as unknown as Prisma.InputJsonValue,
      aiDraftSources: pages.map((p) => ({ url: p.url, title: p.title ?? null, chars: p.text.length })) as unknown as Prisma.InputJsonValue,
    },
  });
  await audit(ctx, "company.draft_generated", { type: "company_profile", id: updated.id }, { pages: pages.length, provider: meta.provider, model: meta.model });
  return { draft: data, sources: pages.map((p) => ({ url: p.url, title: p.title })), meta };
}

/** Copies the stored AI draft onto the profile (user clicked "Use this draft"). */
export async function applyDraft(ctx: Ctx, fields?: (keyof CompanyDraft)[]) {
  requirePermission(ctx, "company.update");
  const current = await getCompanyProfile(ctx);
  const draft = current.aiDraft as (CompanyDraft & { generatedAt?: string }) | null;
  if (!draft) throw ApiError.invalid("There is no AI draft to apply. Analyse the website first.");
  const pick = (k: keyof CompanyDraft) => !fields || fields.includes(k);
  const input: CompanyProfileInput = {};
  if (pick("companyName") && draft.companyName) input.companyName = draft.companyName;
  if (pick("description") && draft.description) input.description = draft.description;
  if (pick("productOrService") && draft.productOrService) input.productOrService = draft.productOrService;
  if (pick("industry") && draft.industry) input.industry = draft.industry;
  if (pick("businessModel") && draft.businessModel) input.businessModel = draft.businessModel;
  if (pick("targetGeography") && draft.targetGeography?.length) input.targetGeography = draft.targetGeography;
  if (pick("targetCustomerType") && draft.targetCustomerType) input.targetCustomerType = draft.targetCustomerType;
  if (pick("valueProposition") && draft.valueProposition) input.valueProposition = draft.valueProposition;
  if (pick("competitors") && draft.competitors?.length) input.competitors = draft.competitors;
  if (pick("existingCustomers") && draft.existingCustomers?.length) input.existingCustomers = draft.existingCustomers;
  const updated = await updateCompanyProfile(ctx, input);
  await audit(ctx, "company.draft_applied", { type: "company_profile", id: updated.id }, { fields: Object.keys(input) });
  return updated;
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withScheme);
  return `${u.protocol}//${u.hostname}${u.pathname === "/" ? "" : u.pathname}`;
}

/** Home page plus a few conventional pages, fetched through the best available web provider. */
async function fetchCompanyPages(workspaceId: string, base: string): Promise<WebPage[]> {
  const candidates = [base, `${base}/about`, `${base}/product`, `${base}/pricing`, `${base}/customers`];
  const pages: WebPage[] = [];
  for (const url of candidates) {
    try {
      const { result } = await withFallback<WebResearchProvider, WebPage>(workspaceId, "web.fetch", async (p) => {
        if (!p.instance.fetchPage) throw new Error("fetchPage unsupported");
        return p.instance.fetchPage(url);
      });
      if (result.text.trim().length > 200) pages.push(result);
    } catch {
      // Secondary pages often do not exist; only the home page matters.
      if (url === base) return [];
    }
    if (pages.reduce((n, p) => n + p.text.length, 0) > 24000) break;
  }
  return pages;
}
