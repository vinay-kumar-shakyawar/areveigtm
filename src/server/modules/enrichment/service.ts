import "server-only";
import type { Prisma, VerificationState } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, jobCtx, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit, recordActivity } from "@/server/modules/audit/service";
import { resolveProviders } from "@/server/providers/registry";
import type { EnrichmentProvider, EnrichmentResult } from "@/server/providers/types";
import { canonicalLinkedinUrl, domainFromUrl, linkedinSlug, normalizeEmail, normalizeXHandle } from "@/lib/normalize";
import { defineJob, enqueue } from "@/server/jobs";

/**
 * Enrichment waterfall with field-level provenance. Every candidate value is
 * stored in LeadEnrichment; a value is promoted onto Contact/Account only when
 * it beats what is there (never replaces a verified value with a guess).
 */
type ContactField = "email" | "emailStatus" | "phone" | "title" | "linkedinUrl" | "xHandle" | "location" | "country" | "headline";
type AccountField = "companyName" | "companyDomain" | "companyHeadcount" | "companyIndustry" | "companyDescription" | "companyTechnologies";

const CONTACT_FIELDS: ContactField[] = ["email", "emailStatus", "phone", "title", "linkedinUrl", "xHandle", "location", "country", "headline"];

export const enrichJob = defineJob<{ workspaceId: string; leadId: string }>("lead.enrich", async ({ workspaceId, leadId }) => {
  await enrichLead(jobCtx(workspaceId), leadId);
});

export async function requestEnrichment(ctx: Ctx, leadId: string) {
  requirePermission(ctx, "leads.manage");
  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: ctx.workspaceId } });
  if (!lead) throw ApiError.notFound("lead");
  const providers = await resolveProviders<EnrichmentProvider>(ctx.workspaceId, "people.enrich");
  if (providers.length === 0) throw new ApiError("not_configured", "Connect an enrichment provider (Apollo, People Data Labs, Hunter…) under Integrations.");
  await audit(ctx, "lead.enrichment_requested", { type: "lead", id: leadId });
  return enqueue("lead.enrich", { workspaceId: ctx.workspaceId, leadId }, { workspaceId: ctx.workspaceId });
}

export async function enrichLead(ctx: Ctx, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: ctx.workspaceId }, include: { contact: true, account: true } });
  if (!lead) throw ApiError.notFound("lead");
  const providers = await resolveProviders<EnrichmentProvider>(ctx.workspaceId, "people.enrich", { usage: { leadId } });
  const c = lead.contact;
  const input = {
    email: c.email ?? undefined,
    linkedinUrl: c.linkedinUrl ?? undefined,
    firstName: c.firstName ?? undefined,
    lastName: c.lastName ?? undefined,
    fullName: c.fullName,
    companyDomain: lead.account?.domain ?? undefined,
    companyName: lead.account?.name ?? c.companyNameRaw ?? undefined,
  };
  const missing = new Set<string>(CONTACT_FIELDS.filter((f) => !currentContactValue(c, f)));
  const applied: string[] = [];
  const tried: { provider: string; found: boolean; error?: string }[] = [];

  for (const p of providers) {
    if (missing.size === 0) break;
    let result: EnrichmentResult;
    try {
      // Prefer the cheaper targeted call when only an email is missing.
      if (missing.size === 1 && missing.has("email") && p.instance.findEmail && c.firstName && c.lastName && lead.account?.domain) {
        result = await p.instance.findEmail({ firstName: c.firstName, lastName: c.lastName, companyDomain: lead.account.domain });
      } else {
        result = await p.instance.enrichPerson(input);
      }
    } catch (err) {
      tried.push({ provider: p.descriptor.id, found: false, error: (err as Error).message });
      continue;
    }
    tried.push({ provider: p.descriptor.id, found: result.found });
    if (!result.found) continue;
    for (const [field, val] of Object.entries(result.fields) as [ContactField | AccountField, { value: unknown; confidence: number; verified?: boolean; sourceUrl?: string }][]) {
      if (!val || val.value === null || val.value === undefined || val.value === "") continue;
      const promoted = await storeAndMaybePromote(ctx, lead.contactId, lead.accountId, field, val, p.descriptor.id, result.providerRecordId);
      if (promoted) {
        applied.push(field);
        missing.delete(field);
      }
    }
  }
  await recordActivity(ctx, { action: "enrichment.completed", leadId, contactId: lead.contactId, metadata: { applied, tried, stillMissing: [...missing] } });
  await prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: new Date() } });
  return { applied, tried, stillMissing: [...missing] };
}

function currentContactValue(c: { email: string | null; emailStatus: string; phone: string | null; title: string | null; linkedinUrl: string | null; xHandle: string | null; location: string | null; country: string | null; headline: string | null }, f: ContactField) {
  if (f === "emailStatus") return c.emailStatus !== "unknown" ? c.emailStatus : null;
  return c[f];
}

async function storeAndMaybePromote(
  ctx: Ctx,
  contactId: string,
  accountId: string | null,
  field: ContactField | AccountField,
  val: { value: unknown; confidence: number; verified?: boolean; sourceUrl?: string },
  provider: string,
  providerRecordId?: string,
): Promise<boolean> {
  const verificationState: VerificationState = val.verified ? "verified" : "unverified";
  const normalized = normalizeValue(field, val.value);
  if (normalized === null) return false;
  const latest = await prisma.leadEnrichment.findFirst({ where: { contactId, field, appliedAt: { not: null } }, orderBy: { fetchedAt: "desc" } });
  const row = await prisma.leadEnrichment.create({
    data: {
      workspaceId: ctx.workspaceId,
      contactId,
      provider,
      field,
      value: normalized as Prisma.InputJsonValue,
      confidence: val.confidence,
      verificationState,
      sourceUrl: val.sourceUrl,
      providerRecordId,
    },
  });
  // Promotion rule: empty → fill; unverified → replace only by higher confidence or verified; verified → never replace automatically.
  const current = await currentValue(contactId, accountId, field);
  const canPromote =
    current === null ||
    (latest?.verificationState !== "verified" && (val.verified || val.confidence > (latest?.confidence ?? 0)));
  if (!canPromote) return false;
  if (CONTACT_FIELDS.includes(field as ContactField)) {
    await prisma.contact.update({ where: { id: contactId }, data: contactUpdate(field as ContactField, normalized) });
  } else if (accountId) {
    await prisma.targetAccount.update({ where: { id: accountId }, data: accountUpdate(field as AccountField, normalized) });
  } else {
    return false;
  }
  await prisma.leadEnrichment.update({ where: { id: row.id }, data: { appliedAt: new Date() } });
  if (latest) await prisma.leadEnrichment.update({ where: { id: latest.id }, data: { supersededById: row.id } });
  return true;
}

function normalizeValue(field: string, value: unknown): unknown {
  if (field === "email") return normalizeEmail(String(value));
  if (field === "linkedinUrl") return canonicalLinkedinUrl(String(value));
  if (field === "xHandle") return normalizeXHandle(String(value));
  if (field === "companyDomain") return domainFromUrl(String(value));
  if (field === "companyHeadcount") return Number.isFinite(Number(value)) ? Number(value) : null;
  if (field === "country") return String(value).toUpperCase().slice(0, 2);
  if (field === "companyTechnologies") return Array.isArray(value) ? value.map(String).slice(0, 50) : null;
  return typeof value === "string" ? value.trim().slice(0, 2000) || null : value;
}

async function currentValue(contactId: string, accountId: string | null, field: string): Promise<unknown> {
  if (CONTACT_FIELDS.includes(field as ContactField)) {
    const c = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
    return currentContactValue(c, field as ContactField) ?? null;
  }
  if (!accountId) return null;
  const a = await prisma.targetAccount.findUniqueOrThrow({ where: { id: accountId } });
  const map: Record<AccountField, unknown> = { companyName: a.name, companyDomain: a.domain, companyHeadcount: a.headcount, companyIndustry: a.industry, companyDescription: a.description, companyTechnologies: a.technologies.length ? a.technologies : null };
  return map[field as AccountField] ?? null;
}

function contactUpdate(field: ContactField, value: unknown): Prisma.ContactUpdateInput {
  switch (field) {
    case "email":
      return { email: String(value), emailStatus: "unknown" };
    case "emailStatus":
      return { emailStatus: value as "valid" | "risky" | "invalid" | "catch_all" | "unknown" };
    case "linkedinUrl":
      return { linkedinUrl: String(value), linkedinSlug: linkedinSlug(String(value)) };
    case "xHandle":
      return { xHandle: String(value) };
    default:
      return { [field]: value } as Prisma.ContactUpdateInput;
  }
}

function accountUpdate(field: AccountField, value: unknown): Prisma.TargetAccountUpdateInput {
  switch (field) {
    case "companyName":
      return { name: String(value) };
    case "companyDomain":
      return { domain: String(value) };
    case "companyHeadcount":
      return { headcount: Number(value) };
    case "companyIndustry":
      return { industry: String(value) };
    case "companyDescription":
      return { description: String(value) };
    case "companyTechnologies":
      return { technologies: value as string[] };
  }
}

/** Marks a field value as verified or invalid by a human. */
export async function verifyField(ctx: Ctx, leadId: string, field: ContactField, state: "verified" | "invalid") {
  requirePermission(ctx, "leads.manage");
  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: ctx.workspaceId }, include: { contact: true } });
  if (!lead) throw ApiError.notFound("lead");
  const value = currentContactValue(lead.contact, field);
  if (value === null) throw ApiError.invalid(`${field} is empty`);
  await prisma.leadEnrichment.create({
    data: { workspaceId: ctx.workspaceId, contactId: lead.contactId, provider: "user", field, value: value as Prisma.InputJsonValue, confidence: 1, verificationState: state, appliedAt: new Date() },
  });
  if (field === "email") await prisma.contact.update({ where: { id: lead.contactId }, data: { emailStatus: state === "verified" ? "valid" : "invalid" } });
  await audit(ctx, "lead.field_verified", { type: "lead", id: leadId }, { field, state });
}
