import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, jobCtx, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit, recordActivity, notify } from "@/server/modules/audit/service";
import { resolveProviders, toApiError } from "@/server/providers/registry";
import type { PeopleSearchCriteria, PeopleSearchProvider, PersonRecord } from "@/server/providers/types";
import type { IcpCriteriaV1 } from "@/server/modules/icp/schemas";
import { upsertContactFromPerson } from "@/server/modules/leads/service";
import { linkedinSlug, normalizeEmail, normalizeXHandle } from "@/lib/normalize";
import { defineJob, enqueue } from "@/server/jobs";
import { requestIdSchema } from "@/server/api/idempotency";

/** Search criteria stored on a LeadSearch. A subset of ICP criteria plus overrides. */
export const searchCriteriaV1 = z.object({
  version: z.literal(1).default(1),
  titles: z.array(z.string()).default([]),
  excludeTitles: z.array(z.string()).default([]),
  seniorities: z.array(z.string()).default([]),
  functions: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  companyNames: z.array(z.string()).default([]),
  companyDomains: z.array(z.string()).default([]),
  excludeCompanyDomains: z.array(z.string()).default([]),
  companySizeMin: z.number().int().nullable().default(null),
  companySizeMax: z.number().int().nullable().default(null),
  technologies: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  semanticQuery: z.string().max(2000).nullable().default(null),
});
export type SearchCriteriaV1 = z.infer<typeof searchCriteriaV1>;

export function criteriaFromIcp(icp: IcpCriteriaV1): SearchCriteriaV1 {
  return searchCriteriaV1.parse({
    titles: icp.titles,
    excludeTitles: icp.excludeTitles,
    seniorities: icp.seniorities,
    functions: icp.functions,
    industries: icp.industries,
    locations: icp.geographies,
    countries: icp.countries,
    companySizeMin: icp.companySize.min,
    companySizeMax: icp.companySize.max,
    technologies: icp.technologies,
    keywords: icp.keywords,
    semanticQuery: [...icp.companyCharacteristics, ...icp.exclusions.map((e) => `exclude: ${e}`)].join("; ") || null,
  });
}

function toProviderCriteria(c: SearchCriteriaV1, limit: number, cursor?: string): PeopleSearchCriteria {
  return {
    titles: c.titles,
    excludeTitles: c.excludeTitles,
    seniorities: c.seniorities,
    functions: c.functions,
    industries: c.industries,
    locations: c.locations,
    countries: c.countries,
    companyNames: c.companyNames,
    companyDomains: c.companyDomains,
    excludeCompanyDomains: c.excludeCompanyDomains,
    companySizeMin: c.companySizeMin ?? undefined,
    companySizeMax: c.companySizeMax ?? undefined,
    technologies: c.technologies,
    keywords: c.keywords,
    semanticQuery: c.semanticQuery ?? undefined,
    limit,
    cursor,
  };
}

export const createSearchInput = z.object({
  name: z.string().trim().min(1).max(120),
  icpProfileId: z.string().uuid().nullable().optional(),
  criteria: searchCriteriaV1,
  requestedCount: z.number().int().min(5).max(500).default(25),
  provider: z.string().min(1).max(40).optional(),
  requestId: requestIdSchema.optional(),
});

export async function listProvidersForSearch(ctx: Ctx) {
  const providers = await resolveProviders<PeopleSearchProvider>(ctx.workspaceId, "people.search");
  return providers.map((p) => ({ id: p.descriptor.id, name: p.descriptor.displayName, source: p.source, canEstimate: Boolean(p.instance.estimateSearch) }));
}

export async function createSearch(ctx: Ctx, input: z.infer<typeof createSearchInput>) {
  requirePermission(ctx, "leads.manage");
  const providers = await resolveProviders<PeopleSearchProvider>(ctx.workspaceId, "people.search");
  if (providers.length === 0) throw new ApiError("not_configured", "Connect a lead data provider (Hunter, Apollo, People Data Labs…) under Integrations before searching.");
  const provider = input.provider ? providers.find((p) => p.descriptor.id === input.provider) : providers[0];
  if (!provider) throw ApiError.invalid(`Provider ${input.provider} is not configured for people search`);
  if (input.requestId) {
    const existing = await prisma.leadSearch.findUnique({ where: { workspaceId_requestId: { workspaceId: ctx.workspaceId, requestId: input.requestId } } });
    if (existing) return existing;
  }
  const search = await prisma.leadSearch.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: input.name,
      icpProfileId: input.icpProfileId ?? undefined,
      criteria: input.criteria as Prisma.InputJsonValue,
      provider: provider.descriptor.id,
      requestedCount: input.requestedCount,
      requestId: input.requestId,
      createdByUserId: ctx.userId ?? ctx.workspaceId,
      status: "draft",
    },
  });
  await audit(ctx, "search.created", { type: "lead_search", id: search.id }, { provider: search.provider, requestedCount: input.requestedCount });
  return search;
}

export async function previewSearch(ctx: Ctx, id: string) {
  requirePermission(ctx, "leads.manage");
  const search = await getSearch(ctx, id);
  const providers = await resolveProviders<PeopleSearchProvider>(ctx.workspaceId, "people.search", { preferProvider: search.provider });
  const provider = providers.find((p) => p.descriptor.id === search.provider);
  if (!provider) throw new ApiError("not_configured", `Provider ${search.provider} is no longer configured`);
  const criteria = searchCriteriaV1.parse(search.criteria);
  let preview: Record<string, unknown>;
  try {
    if (provider.instance.estimateSearch) {
      const est = await provider.instance.estimateSearch(toProviderCriteria(criteria, 1));
      preview = { ...est, provider: provider.descriptor.id, previewedAt: new Date().toISOString() };
    } else {
      preview = { provider: provider.descriptor.id, note: "This provider cannot estimate before running.", previewedAt: new Date().toISOString() };
    }
  } catch (err) {
    throw toApiError(err, provider.descriptor.id);
  }
  const updated = await prisma.leadSearch.update({ where: { id }, data: { preview: preview as Prisma.InputJsonValue, status: "previewed" } });
  return updated;
}

export const runSearchJob = defineJob<{ searchId: string; workspaceId: string }>("search.run", async ({ searchId, workspaceId }) => {
  await executeSearch(jobCtx(workspaceId), searchId);
}, { retryLimit: 1 });

/** Spends provider credits: requires an explicit requestId so retries never double-charge. */
export async function runSearch(ctx: Ctx, id: string, requestId: string) {
  requirePermission(ctx, "leads.manage");
  const search = await getSearch(ctx, id);
  if (search.status === "running") return search;
  if (search.status === "completed") throw ApiError.conflict("This search already ran. Duplicate it to run again.");
  requestIdSchema.parse(requestId);
  const updated = await prisma.leadSearch.update({ where: { id }, data: { status: "running", startedAt: new Date(), requestId: search.requestId ?? requestId } });
  await audit(ctx, "search.run", { type: "lead_search", id }, { requestId });
  await enqueue("search.run", { searchId: id, workspaceId: ctx.workspaceId }, { workspaceId: ctx.workspaceId });
  return prisma.leadSearch.findUniqueOrThrow({ where: { id: updated.id } });
}

/** Job body: pages through the provider, stores results, flags duplicates. Idempotent per provider record. */
export async function executeSearch(ctx: Ctx, id: string) {
  const search = await prisma.leadSearch.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!search) throw ApiError.notFound("search");
  const providers = await resolveProviders<PeopleSearchProvider>(ctx.workspaceId, "people.search", { preferProvider: search.provider, usage: { requestId: search.requestId ?? undefined } });
  const provider = providers.find((p) => p.descriptor.id === search.provider);
  if (!provider) {
    await prisma.leadSearch.update({ where: { id }, data: { status: "failed", error: { message: `Provider ${search.provider} is not configured` } } });
    return;
  }
  const criteria = searchCriteriaV1.parse(search.criteria);
  let cursor: string | undefined;
  let fetched = 0;
  let duplicates = 0;
  let total: number | undefined;
  try {
    for (let page = 0; page < 50 && fetched < search.requestedCount; page++) {
      const batchSize = Math.min(100, search.requestedCount - fetched);
      const res = await provider.instance.searchPeople(toProviderCriteria(criteria, batchSize, cursor));
      total = res.totalEstimate ?? total;
      for (const person of res.people) {
        const dup = await findExistingContact(ctx.workspaceId, person);
        if (dup) duplicates++;
        await prisma.leadSearchResult.upsert({
          where: { searchId_providerRecordId: { searchId: id, providerRecordId: person.providerRecordId } },
          update: {},
          create: {
            workspaceId: ctx.workspaceId,
            searchId: id,
            providerRecordId: person.providerRecordId,
            person: minimizePerson(person) as unknown as Prisma.InputJsonValue,
            matchReason: matchReason(person, criteria),
            duplicateOfContactId: dup?.id,
            contactId: dup?.id,
          },
        });
        fetched++;
        if (fetched >= search.requestedCount) break;
      }
      if (!res.nextCursor || res.people.length === 0) break;
      cursor = res.nextCursor;
    }
    await prisma.leadSearch.update({
      where: { id },
      data: { status: "completed", completedAt: new Date(), resultCount: fetched, duplicateCount: duplicates, preview: { ...((search.preview as object) ?? {}), totalEstimate: total ?? null } as Prisma.InputJsonValue },
    });
    await recordActivity(ctx, { action: "search.completed", metadata: { searchId: id, provider: search.provider, results: fetched, duplicates } });
    await notify(ctx, { userId: search.createdByUserId, type: "search.completed", title: `Search “${search.name}” found ${fetched} people`, body: duplicates ? `${duplicates} already in your workspace.` : undefined, link: `/w/${await slugFor(ctx.workspaceId)}/leads/searches/${id}` });
  } catch (err) {
    const apiErr = toApiError(err, search.provider);
    await prisma.leadSearch.update({ where: { id }, data: { status: "failed", completedAt: new Date(), resultCount: fetched, error: { message: apiErr.message, code: apiErr.code } } });
    await recordActivity(ctx, { action: "search.failed", outcome: "failed", metadata: { searchId: id, provider: search.provider, error: apiErr.message } });
    throw apiErr;
  }
}

async function slugFor(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
  return ws?.slug ?? "";
}

async function findExistingContact(workspaceId: string, person: PersonRecord) {
  const slug = linkedinSlug(person.linkedinUrl);
  const email = normalizeEmail(person.email);
  const xHandle = normalizeXHandle(person.xHandle);
  if (!slug && !email && !xHandle) return null;
  return prisma.contact.findFirst({
    where: { workspaceId, deletedAt: null, OR: [...(slug ? [{ linkedinSlug: slug }] : []), ...(email ? [{ email }] : []), ...(xHandle ? [{ xHandle }] : [])] },
    select: { id: true },
  });
}

function minimizePerson(p: PersonRecord): PersonRecord {
  const rest: PersonRecord = { ...p, raw: undefined };
  if (rest.company) rest.company = { ...rest.company, raw: undefined };
  return rest;
}

function matchReason(p: PersonRecord, c: SearchCriteriaV1): string {
  const reasons: string[] = [];
  const title = (p.title ?? "").toLowerCase();
  const t = c.titles.find((x) => title.includes(x.toLowerCase()));
  if (t) reasons.push(`title matches “${t}”`);
  if (p.company?.industry && c.industries.some((i) => p.company?.industry?.toLowerCase().includes(i.toLowerCase()))) reasons.push(`industry ${p.company.industry}`);
  if (p.country && c.countries.includes(p.country.toUpperCase())) reasons.push(`in ${p.country}`);
  if (p.company?.headcount && (c.companySizeMin || c.companySizeMax)) reasons.push(`${p.company.headcount} employees`);
  return reasons.join(", ") || "returned by provider for these filters";
}

export async function listSearches(ctx: Ctx) {
  requirePermission(ctx, "leads.read");
  return prisma.leadSearch.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { icpProfile: { select: { id: true, name: true } }, _count: { select: { results: true } } },
  });
}

export async function getSearch(ctx: Ctx, id: string) {
  requirePermission(ctx, "leads.read");
  const search = await prisma.leadSearch.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { icpProfile: { select: { id: true, name: true } } } });
  if (!search) throw ApiError.notFound("search");
  return search;
}

export async function getSearchResults(ctx: Ctx, id: string, filter: "all" | "undecided" | "good_fit" | "not_a_fit" = "all") {
  await getSearch(ctx, id);
  return prisma.leadSearchResult.findMany({
    where: { searchId: id, ...(filter === "all" ? {} : { decision: filter }) },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
}

export const decisionsInput = z.object({
  decisions: z.array(z.object({ resultId: z.string().uuid(), decision: z.enum(["good_fit", "not_a_fit", "undecided"]) })).min(1).max(500),
  finish: z.boolean().default(false),
});

/** Records human decisions; with finish=true imports every good fit into Leads. */
export async function decideResults(ctx: Ctx, id: string, input: z.infer<typeof decisionsInput>) {
  requirePermission(ctx, "leads.manage");
  const search = await getSearch(ctx, id);
  for (const d of input.decisions) {
    await prisma.leadSearchResult.updateMany({
      where: { id: d.resultId, searchId: id },
      data: { decision: d.decision, decidedByUserId: ctx.userId, decidedAt: d.decision === "undecided" ? null : new Date() },
    });
  }
  await audit(ctx, "search.decided", { type: "lead_search", id }, { count: input.decisions.length, finish: input.finish });
  if (!input.finish) return { imported: 0, duplicates: 0 };
  return importGoodFits(ctx, search.id);
}

export async function importGoodFits(ctx: Ctx, id: string) {
  requirePermission(ctx, "leads.manage");
  const search = await getSearch(ctx, id);
  const pending = await prisma.leadSearchResult.findMany({ where: { searchId: id, decision: "good_fit", contactId: null } });
  let imported = 0;
  let duplicates = 0;
  const leadIds: string[] = [];
  for (const r of pending) {
    const person = r.person as unknown as PersonRecord;
    const res = await upsertContactFromPerson(ctx, person, {
      kind: "provider_search",
      provider: search.provider,
      searchId: id,
      evidence: { matchReason: r.matchReason, providerRecordId: r.providerRecordId, sourceUrl: person.sourceUrl ?? null },
    });
    await prisma.leadSearchResult.update({ where: { id: r.id }, data: { contactId: res.contact.id } });
    if (res.created) imported++;
    else duplicates++;
    leadIds.push(res.lead.id);
    if (search.icpProfileId) await prisma.lead.update({ where: { id: res.lead.id }, data: { icpProfileId: res.lead.icpProfileId ?? search.icpProfileId, status: "approved", stage: "reviewed" } });
    else await prisma.lead.update({ where: { id: res.lead.id }, data: { status: "approved", stage: "reviewed" } });
  }
  await prisma.leadSearch.update({ where: { id }, data: { importedCount: { increment: imported } } });
  await recordActivity(ctx, { action: "search.imported", metadata: { searchId: id, imported, duplicates } });
  return { imported, duplicates, leadIds };
}

export async function saveSearchAs(ctx: Ctx, id: string, name: string) {
  requirePermission(ctx, "leads.manage");
  await getSearch(ctx, id);
  return prisma.leadSearch.update({ where: { id }, data: { savedAsName: name.trim().slice(0, 120) } });
}

export async function duplicateSearch(ctx: Ctx, id: string) {
  const s = await getSearch(ctx, id);
  return createSearch(ctx, { name: `${s.name} (again)`, icpProfileId: s.icpProfileId, criteria: searchCriteriaV1.parse(s.criteria), requestedCount: s.requestedCount, provider: s.provider });
}
