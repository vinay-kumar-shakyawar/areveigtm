import "server-only";
import { z } from "zod";
import type { LeadSourceKind, LeadStage, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { ApiError } from "@/server/api/errors";
import { audit, recordActivity } from "@/server/modules/audit/service";
import type { PersonRecord } from "@/server/providers/types";
import { canonicalLinkedinUrl, domainFromUrl, linkedinSlug, normalizeEmail, normalizeXHandle, splitName } from "@/lib/normalize";
import { decodeCursor, toPage } from "@/server/api/pagination";

export interface SourceInfo {
  kind: LeadSourceKind;
  provider?: string | null;
  searchId?: string | null;
  importBatchId?: string | null;
  evidence?: Record<string, unknown>;
}

/**
 * Canonical identity rule: one Contact per workspace per LinkedIn slug / email /
 * X handle. Returns whether the person already existed. Never overwrites a
 * populated field with an empty one; richer values flow through enrichment.
 */
export async function upsertContactFromPerson(ctx: Ctx, person: PersonRecord, source: SourceInfo) {
  const email = normalizeEmail(person.email);
  const slug = linkedinSlug(person.linkedinUrl);
  const xHandle = normalizeXHandle(person.xHandle);
  if (!email && !slug && !xHandle && !person.fullName) throw ApiError.invalid("A person needs at least a name, email, LinkedIn URL or X handle");

  const existing = await prisma.contact.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      deletedAt: null,
      OR: [...(slug ? [{ linkedinSlug: slug }] : []), ...(email ? [{ email }] : []), ...(xHandle ? [{ xHandle }] : [])],
    },
    include: { lead: true },
  });

  // Resolve or create the account by domain, then by exact name.
  let accountId: string | null = existing?.accountId ?? null;
  const domain = domainFromUrl(person.company?.domain ?? person.company?.website ?? null);
  if (person.company?.name || domain) {
    const account = await prisma.targetAccount.findFirst({
      where: { workspaceId: ctx.workspaceId, OR: [...(domain ? [{ domain }] : []), { name: { equals: person.company?.name ?? "", mode: "insensitive" } }] },
    });
    if (account) {
      accountId = account.id;
      await prisma.targetAccount.update({
        where: { id: account.id },
        data: {
          domain: account.domain ?? domain ?? undefined,
          industry: account.industry ?? person.company?.industry ?? undefined,
          headcount: account.headcount ?? person.company?.headcount ?? undefined,
          website: account.website ?? person.company?.website ?? undefined,
          linkedinUrl: account.linkedinUrl ?? person.company?.linkedinUrl ?? undefined,
          description: account.description ?? person.company?.description ?? undefined,
        },
      });
    } else if (person.company?.name) {
      const created = await prisma.targetAccount.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: person.company.name,
          domain: domain ?? undefined,
          website: person.company.website,
          linkedinUrl: person.company.linkedinUrl,
          industry: person.company.industry,
          headcount: person.company.headcount,
          headcountRange: person.company.headcountRange,
          location: person.company.location,
          country: person.company.country,
          description: person.company.description,
          technologies: person.company.technologies ?? [],
          fundingStage: person.company.fundingStage,
          investors: person.company.investors ?? [],
          source: source.provider ?? source.kind,
          externalIds: person.company.providerRecordId && source.provider ? { [source.provider]: person.company.providerRecordId } : {},
        },
      });
      accountId = created.id;
    }
  }

  const names = person.firstName || person.lastName ? { firstName: person.firstName ?? null, lastName: person.lastName ?? null } : splitName(person.fullName);
  const base = {
    firstName: names.firstName || null,
    lastName: names.lastName || null,
    fullName: person.fullName || [names.firstName, names.lastName].filter(Boolean).join(" "),
    title: person.title ?? null,
    seniority: person.seniority ?? null,
    function: person.function ?? null,
    headline: person.headline ?? null,
    companyNameRaw: person.company?.name ?? null,
    location: person.location ?? null,
    country: person.country ?? null,
    phone: person.phone ?? null,
  };

  let contact;
  let created = false;
  if (existing) {
    contact = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        firstName: existing.firstName ?? base.firstName ?? undefined,
        lastName: existing.lastName ?? base.lastName ?? undefined,
        title: existing.title ?? base.title ?? undefined,
        seniority: existing.seniority ?? base.seniority ?? undefined,
        function: existing.function ?? base.function ?? undefined,
        headline: existing.headline ?? base.headline ?? undefined,
        companyNameRaw: existing.companyNameRaw ?? base.companyNameRaw ?? undefined,
        location: existing.location ?? base.location ?? undefined,
        country: existing.country ?? base.country ?? undefined,
        phone: existing.phone ?? base.phone ?? undefined,
        email: existing.email ?? email ?? undefined,
        emailStatus: existing.email ? undefined : (person.emailStatus ?? undefined),
        linkedinUrl: existing.linkedinUrl ?? canonicalLinkedinUrl(person.linkedinUrl) ?? undefined,
        linkedinSlug: existing.linkedinSlug ?? slug ?? undefined,
        xHandle: existing.xHandle ?? xHandle ?? undefined,
        accountId: existing.accountId ?? accountId ?? undefined,
        externalIds: source.provider && person.providerRecordId ? { ...(existing.externalIds as object), [source.provider]: person.providerRecordId } : undefined,
      },
    });
  } else {
    created = true;
    contact = await prisma.contact.create({
      data: {
        workspaceId: ctx.workspaceId,
        ...base,
        email,
        emailStatus: email ? (person.emailStatus ?? "unknown") : "unknown",
        linkedinUrl: canonicalLinkedinUrl(person.linkedinUrl),
        linkedinSlug: slug,
        xHandle,
        accountId,
        externalIds: source.provider && person.providerRecordId ? { [source.provider]: person.providerRecordId } : {},
      },
    });
  }

  const lead = await prisma.lead.upsert({
    where: { contactId: contact.id },
    update: { accountId: accountId ?? undefined, lastActivityAt: new Date() },
    create: { workspaceId: ctx.workspaceId, contactId: contact.id, accountId, status: "new", stage: "discovered", lastActivityAt: new Date() },
  });
  await prisma.leadSource.create({
    data: {
      workspaceId: ctx.workspaceId,
      leadId: lead.id,
      kind: source.kind,
      provider: source.provider ?? undefined,
      searchId: source.searchId ?? undefined,
      importBatchId: source.importBatchId ?? undefined,
      evidence: (source.evidence ?? {}) as Prisma.InputJsonValue,
    },
  });
  await recordActivity(ctx, {
    action: created ? "lead.created" : "lead.source_added",
    leadId: lead.id,
    contactId: contact.id,
    metadata: { source: source.kind, provider: source.provider ?? null },
  });
  return { contact, lead, created, duplicate: !created };
}

export const leadListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().optional(),
  stage: z.string().optional(),
  icpProfileId: z.string().uuid().optional(),
  sourceKind: z.string().optional(),
  ownerUserId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listLeads(ctx: Ctx, query: z.infer<typeof leadListQuery>) {
  requirePermission(ctx, "leads.read");
  const c = decodeCursor(query.cursor);
  const where: Prisma.LeadWhereInput = {
    workspaceId: ctx.workspaceId,
    ...(query.status ? { status: query.status as LeadStatus } : {}),
    ...(query.stage ? { stage: query.stage as LeadStage } : {}),
    ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
    ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
    ...(query.sourceKind ? { sources: { some: { kind: query.sourceKind as LeadSourceKind } } } : {}),
    ...(query.q
      ? {
          contact: {
            OR: [
              { fullName: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
              { title: { contains: query.q, mode: "insensitive" } },
              { companyNameRaw: { contains: query.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
    ...(c ? { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] } : {}),
  };
  const rows = await prisma.lead.findMany({
    where,
    include: {
      contact: true,
      account: { select: { id: true, name: true, domain: true, headcount: true, industry: true } },
      scores: { where: { isCurrent: true }, select: { kind: true, score: true } },
      _count: { select: { campaignLeads: true, conversations: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  return toPage(rows, query.limit);
}

export async function getLead(ctx: Ctx, id: string) {
  requirePermission(ctx, "leads.read");
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      contact: { include: { enrichments: { orderBy: { fetchedAt: "desc" }, take: 100 }, signals: { orderBy: { occurredAt: "desc" }, take: 50 } } },
      account: { include: { signals: { orderBy: { occurredAt: "desc" }, take: 50 } } },
      icpProfile: { select: { id: true, name: true } },
      sources: { orderBy: { occurredAt: "desc" } },
      scores: { where: { isCurrent: true } },
      research: { orderBy: { computedAt: "desc" }, take: 1 },
      campaignLeads: { include: { campaign: { select: { id: true, name: true, status: true } }, sequence: { select: { id: true, name: true } } } },
      conversations: { orderBy: { lastMessageAt: "desc" }, take: 10 },
      activity: { orderBy: { occurredAt: "desc" }, take: 50 },
    },
  });
  if (!lead) throw ApiError.notFound("lead");
  return lead;
}

export const updateLeadInput = z.object({
  status: z.enum(["new", "reviewing", "approved", "rejected", "enrolled", "replied", "qualified", "meeting_booked", "not_interested", "disqualified", "unsubscribed"]).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  icpProfileId: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  contact: z
    .object({
      firstName: z.string().max(80).nullable().optional(),
      lastName: z.string().max(80).nullable().optional(),
      title: z.string().max(160).nullable().optional(),
      email: z.string().max(320).nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      linkedinUrl: z.string().max(500).nullable().optional(),
      xHandle: z.string().max(60).nullable().optional(),
      location: z.string().max(160).nullable().optional(),
      country: z.string().max(2).nullable().optional(),
      companyNameRaw: z.string().max(160).nullable().optional(),
      doNotContact: z.boolean().optional(),
    })
    .optional(),
});

export async function updateLead(ctx: Ctx, id: string, input: z.infer<typeof updateLeadInput>) {
  requirePermission(ctx, "leads.manage");
  const lead = await getLead(ctx, id);
  if (input.contact) {
    const c = input.contact;
    const email = c.email === undefined ? undefined : normalizeEmail(c.email);
    if (c.email && !email) throw ApiError.invalid("Invalid email address", { field: "email" });
    const slug = c.linkedinUrl === undefined ? undefined : linkedinSlug(c.linkedinUrl);
    const xHandle = c.xHandle === undefined ? undefined : normalizeXHandle(c.xHandle);
    // Identity collision check: the same email / LinkedIn / X cannot belong to two contacts.
    const clash = await prisma.contact.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        id: { not: lead.contactId },
        OR: [...(email ? [{ email }] : []), ...(slug ? [{ linkedinSlug: slug }] : []), ...(xHandle ? [{ xHandle }] : [])],
      },
    });
    if (clash) throw ApiError.conflict("Another contact already has that email, LinkedIn URL or X handle", { contactId: clash.id });
    await prisma.contact.update({
      where: { id: lead.contactId },
      data: {
        firstName: c.firstName,
        lastName: c.lastName,
        fullName: c.firstName !== undefined || c.lastName !== undefined ? [c.firstName ?? lead.contact.firstName, c.lastName ?? lead.contact.lastName].filter(Boolean).join(" ") || lead.contact.fullName : undefined,
        title: c.title,
        email: c.email === undefined ? undefined : email,
        emailStatus: c.email === undefined ? undefined : "unknown",
        phone: c.phone,
        linkedinUrl: c.linkedinUrl === undefined ? undefined : canonicalLinkedinUrl(c.linkedinUrl),
        linkedinSlug: c.linkedinUrl === undefined ? undefined : slug,
        xHandle: c.xHandle === undefined ? undefined : xHandle,
        location: c.location,
        country: c.country ? c.country.toUpperCase() : c.country,
        companyNameRaw: c.companyNameRaw,
        doNotContact: c.doNotContact,
      },
    });
    for (const [field, value] of Object.entries(c)) {
      if (value === undefined) continue;
      await prisma.leadEnrichment.create({
        data: { workspaceId: ctx.workspaceId, contactId: lead.contactId, provider: "user", field, value: value as Prisma.InputJsonValue, confidence: 1, verificationState: "verified", appliedAt: new Date() },
      });
    }
  }
  const updated = await prisma.lead.update({
    where: { id },
    data: {
      status: input.status,
      stage: input.status === "qualified" ? "qualified" : input.status === "meeting_booked" ? "meeting_booked" : input.status === "not_interested" ? "not_interested" : input.status === "disqualified" ? "disqualified" : undefined,
      ownerUserId: input.ownerUserId,
      icpProfileId: input.icpProfileId,
      notes: input.notes,
      qualifiedAt: input.status === "qualified" ? new Date() : undefined,
      lastActivityAt: new Date(),
    },
  });
  await audit(ctx, "lead.updated", { type: "lead", id }, { fields: Object.keys(input) });
  if (input.status && input.status !== lead.status) {
    await recordActivity(ctx, { action: `lead.status.${input.status}`, leadId: id, contactId: lead.contactId, metadata: { from: lead.status } });
  }
  return updated;
}

export async function deleteLead(ctx: Ctx, id: string) {
  requirePermission(ctx, "leads.delete");
  const lead = await getLead(ctx, id);
  const active = lead.campaignLeads.some((cl) => ["queued", "active", "waiting_approval", "waiting_input"].includes(cl.status));
  if (active) throw ApiError.conflict("This lead is in an active campaign. Stop it first.");
  await prisma.$transaction([prisma.lead.delete({ where: { id } }), prisma.contact.delete({ where: { id: lead.contactId } })]);
  await audit(ctx, "lead.deleted", { type: "lead", id });
}

export async function exportLeadsCsv(ctx: Ctx, query: z.infer<typeof leadListQuery>): Promise<string> {
  requirePermission(ctx, "leads.export");
  const header = ["full_name", "first_name", "last_name", "title", "company", "company_domain", "email", "email_status", "phone", "linkedin_url", "x_handle", "location", "country", "status", "stage", "created_at"];
  const lines = [header.join(",")];
  let cursor: string | undefined;
  for (let i = 0; i < 100; i++) {
    const page = await listLeads(ctx, { ...query, cursor, limit: 200 });
    for (const l of page.items) {
      const c = l.contact;
      lines.push(
        [c.fullName, c.firstName, c.lastName, c.title, l.account?.name ?? c.companyNameRaw, l.account?.domain, c.email, c.emailStatus, c.phone, c.linkedinUrl, c.xHandle, c.location, c.country, l.status, l.stage, l.createdAt.toISOString()]
          .map(csvCell)
          .join(","),
      );
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  await audit(ctx, "leads.exported", { type: "lead" }, { rows: lines.length - 1 });
  return lines.join("\n");
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvImportInput = z.object({
  fileName: z.string().max(200).optional(),
  requestId: z.string().optional(),
  rows: z.array(z.record(z.string(), z.string().nullable())).min(1).max(5000),
  mapping: z.object({
    fullName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    title: z.string().optional(),
    company: z.string().optional(),
    companyDomain: z.string().optional(),
    linkedinUrl: z.string().optional(),
    xHandle: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    country: z.string().optional(),
  }),
});

export async function importCsv(ctx: Ctx, input: z.infer<typeof csvImportInput>) {
  requirePermission(ctx, "leads.manage");
  const batch = await prisma.importBatch.create({
    data: { workspaceId: ctx.workspaceId, kind: "csv", fileName: input.fileName, rowCount: input.rows.length, status: "processing", requestId: input.requestId, createdByUserId: ctx.userId },
  });
  let added = 0;
  let duplicates = 0;
  let invalid = 0;
  const errors: { row: number; reason: string }[] = [];
  const m = input.mapping;
  const get = (row: Record<string, string | null>, key?: string) => (key ? (row[key] ?? "").trim() || undefined : undefined);
  for (const [i, row] of input.rows.entries()) {
    const fullName = get(row, m.fullName) ?? [get(row, m.firstName), get(row, m.lastName)].filter(Boolean).join(" ");
    const email = get(row, m.email);
    const linkedinUrl = get(row, m.linkedinUrl);
    const xHandle = get(row, m.xHandle);
    if (!fullName && !email && !linkedinUrl && !xHandle) {
      invalid++;
      errors.push({ row: i + 1, reason: "no name, email, LinkedIn URL or X handle" });
      continue;
    }
    if (email && !normalizeEmail(email)) {
      invalid++;
      errors.push({ row: i + 1, reason: `invalid email ${email}` });
      continue;
    }
    try {
      const res = await upsertContactFromPerson(
        ctx,
        {
          providerRecordId: `csv:${batch.id}:${i}`,
          fullName: fullName || email || linkedinUrl || xHandle || "Unknown",
          firstName: get(row, m.firstName),
          lastName: get(row, m.lastName),
          email,
          title: get(row, m.title),
          linkedinUrl,
          xHandle,
          phone: get(row, m.phone),
          location: get(row, m.location),
          country: get(row, m.country)?.toUpperCase().slice(0, 2),
          company: get(row, m.company) || get(row, m.companyDomain) ? { name: get(row, m.company) ?? get(row, m.companyDomain) ?? "", domain: get(row, m.companyDomain) } : undefined,
        },
        { kind: "csv_import", importBatchId: batch.id, evidence: { row: i + 1, fileName: input.fileName ?? null } },
      );
      if (res.created) added++;
      else duplicates++;
    } catch (err) {
      invalid++;
      errors.push({ row: i + 1, reason: (err as Error).message });
    }
  }
  const done = await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: "completed", addedCount: added, duplicateCount: duplicates, invalidCount: invalid, errors: errors.slice(0, 200) as Prisma.InputJsonValue },
  });
  await audit(ctx, "leads.imported", { type: "import_batch", id: batch.id }, { added, duplicates, invalid });
  await recordActivity(ctx, { action: "import.completed", metadata: { batchId: batch.id, added, duplicates, invalid } });
  return done;
}
