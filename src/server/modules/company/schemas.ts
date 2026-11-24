import { z } from "zod";

export const namedEntity = z.object({ name: z.string().min(1).max(120), website: z.string().max(300).nullable().optional() });

/** Fields the user edits directly. */
export const companyProfileInput = z.object({
  companyName: z.string().trim().max(120).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  productOrService: z.string().trim().max(2000).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  businessModel: z.string().trim().max(120).nullable().optional(),
  targetGeography: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  targetCustomerType: z.string().trim().max(200).nullable().optional(),
  valueProposition: z.string().trim().max(2000).nullable().optional(),
  competitors: z.array(namedEntity).max(30).optional(),
  existingCustomers: z.array(namedEntity).max(50).optional(),
  preferredChannels: z.array(z.enum(["email", "linkedin", "x"])).optional(),
  salesObjective: z.string().trim().max(1000).nullable().optional(),
});
export type CompanyProfileInput = z.infer<typeof companyProfileInput>;

/** What the AI returns when analysing a website. Every claim carries evidence. */
export const companyDraftSchema = z.object({
  companyName: z.string().nullable(),
  description: z.string().nullable().describe("Two to four sentences on what the company does, grounded in the pages"),
  productOrService: z.string().nullable(),
  industry: z.string().nullable(),
  businessModel: z.enum(["B2B SaaS", "B2B services", "Marketplace", "B2C", "Agency", "Hardware", "Other"]).nullable(),
  targetGeography: z.array(z.string()),
  targetCustomerType: z.string().nullable().describe("Who buys, e.g. 'Heads of marketing at D2C brands'"),
  valueProposition: z.string().nullable(),
  competitors: z.array(namedEntity),
  existingCustomers: z.array(namedEntity).describe("Only customers named on the pages, e.g. logos or case studies"),
  evidence: z.array(z.object({ field: z.string(), quote: z.string().max(300), sourceUrl: z.string() })).describe("Short quotes that support the fields above"),
  notes: z.string().nullable().describe("What could not be determined and why"),
});
export type CompanyDraft = z.infer<typeof companyDraftSchema>;
