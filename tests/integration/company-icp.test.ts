import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { makeWorkspace } = await import("../helpers");
const integrations = await import("@/server/modules/integrations/service");
const company = await import("@/server/modules/company/service");
const icp = await import("@/server/modules/icp/service");
const { mockLlmState } = await import("@/server/providers/mock");

async function withMockAi(ctx: Awaited<ReturnType<typeof makeWorkspace>>["ctx"]) {
  await integrations.createIntegration(ctx, { category: "llm", provider: "mock" });
  await integrations.createIntegration(ctx, { category: "company_data", provider: "mock" });
}

describe("company profile", () => {
  it("drafts from the website through the AI, applies and approves with re-approval on edit", async () => {
    const { ctx } = await makeWorkspace();
    await withMockAi(ctx);
    mockLlmState.nextStructured = {
      companyName: "Example Corp",
      description: "Example Corp builds GTM software for B2B teams.",
      productOrService: "GTM platform",
      industry: "Software",
      businessModel: "B2B SaaS",
      targetGeography: ["UAE"],
      targetCustomerType: "Heads of growth at B2B SaaS",
      valueProposition: "Find buyers faster",
      competitors: [{ name: "Competitor A" }],
      existingCustomers: [],
      evidence: [{ field: "description", quote: "builds GTM software", sourceUrl: "https://example.com" }],
      notes: null,
    };
    const { draft, sources } = await company.draftFromWebsite(ctx, "example.com");
    expect(draft.companyName).toBe("Example Corp");
    expect(sources.length).toBeGreaterThan(0);
    const before = await company.getCompanyProfile(ctx);
    expect(before.companyName).toBeNull(); // draft is not applied automatically
    await company.applyDraft(ctx);
    const applied = await company.getCompanyProfile(ctx);
    expect(applied.companyName).toBe("Example Corp");
    expect(applied.approvedAt).toBeNull();
    await company.approveCompanyProfile(ctx);
    expect((await company.getCompanyProfile(ctx)).approvedAt).toBeTruthy();
    await company.updateCompanyProfile(ctx, { salesObjective: "20 demos a month" });
    expect((await company.getCompanyProfile(ctx)).approvedAt).toBeNull();
  });

  it("enforces revision concurrency", async () => {
    const { ctx } = await makeWorkspace();
    const p = await company.getCompanyProfile(ctx);
    await company.updateCompanyProfile(ctx, { companyName: "A" }, { expectedRevision: p.revision });
    await expect(company.updateCompanyProfile(ctx, { companyName: "B" }, { expectedRevision: p.revision })).rejects.toThrow(/changed since/);
  });

  it("refuses approval without the basics", async () => {
    const { ctx } = await makeWorkspace();
    await expect(company.approveCompanyProfile(ctx)).rejects.toThrow(/company name/);
  });
});

describe("icp", () => {
  it("extracts structured criteria from plain language and validates enums", async () => {
    const { ctx } = await makeWorkspace();
    await withMockAi(ctx);
    mockLlmState.nextStructured = {
      name: "D2C marketing leaders UAE",
      criteria: { titles: ["Head of Marketing", "Founder"], seniorities: ["Head", "Owner / Founder"], industries: ["Ecommerce"], geographies: ["UAE"], countries: ["AE"], companySize: { min: 10, max: 100 }, exclusions: ["agencies"] },
      rationale: "Follows the description.",
      ambiguities: [],
    };
    const extraction = await icp.extractIcpFromDescription(ctx, "Founders and heads of marketing at D2C ecommerce companies in the UAE with 10–100 employees, excluding agencies");
    expect(extraction.criteria.titles).toContain("Head of Marketing");
    expect(extraction.criteria.countries).toEqual(["AE"]);
    expect(extraction.criteria.version).toBe(1);
    mockLlmState.nextStructured = { name: "x", criteria: { seniorities: ["Emperor"] }, rationale: "", ambiguities: [] };
    await expect(icp.extractIcpFromDescription(ctx, "anything at all here")).rejects.toThrow();
  });

  it("creates, duplicates, activates, and isolates by workspace", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const created = await icp.createIcp(a.ctx, { name: "ICP A", criteria: { titles: ["CTO"] } as never });
    expect(created.isDefault).toBe(true);
    const copy = await icp.duplicateIcp(a.ctx, created.id);
    expect(copy.name).toBe("ICP A (copy)");
    expect(copy.isDefault).toBe(false);
    await icp.setIcpStatus(a.ctx, created.id, "active");
    expect((await icp.listIcps(a.ctx)).length).toBe(2);
    await expect(icp.getIcp(b.ctx, created.id)).rejects.toThrow(/not found/);
    await expect(icp.updateIcp(b.ctx, created.id, { name: "hacked" })).rejects.toThrow(/not found/);
    await icp.updateIcp(a.ctx, created.id, { name: "Renamed" }, created.revision);
    await expect(icp.updateIcp(a.ctx, created.id, { name: "Stale" }, created.revision)).rejects.toThrow(/changed since/);
    await icp.deleteIcp(a.ctx, copy.id);
    expect(await prisma.icpProfile.count({ where: { workspaceId: a.ctx.workspaceId } })).toBe(1);
  });
});
