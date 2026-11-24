import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { makeWorkspace } = await import("../helpers");
const integrations = await import("@/server/modules/integrations/service");
const leads = await import("@/server/modules/leads/service");
const discovery = await import("@/server/modules/discovery/service");
const icp = await import("@/server/modules/icp/service");
const { normalizeEmail, linkedinSlug, normalizeXHandle, domainFromUrl } = await import("@/lib/normalize");

describe("identity normalization", () => {
  it("normalizes email, LinkedIn and X identifiers", () => {
    expect(normalizeEmail(" Jane@Acme.COM ")).toBe("jane@acme.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(linkedinSlug("https://www.linkedin.com/in/Jane-Doe-123/?x=1")).toBe("jane-doe-123");
    expect(linkedinSlug("linkedin.com/company/acme")).toBeNull();
    expect(normalizeXHandle("@JaneDoe")).toBe("janedoe");
    expect(normalizeXHandle("https://x.com/JaneDoe/status/1")).toBe("janedoe");
    expect(domainFromUrl("https://www.Acme.com/about")).toBe("acme.com");
  });
});

describe("leads: canonical contact and dedup", () => {
  it("creates one contact per identity and links campaigns through the lead", async () => {
    const { ctx } = await makeWorkspace();
    const a = await leads.upsertContactFromPerson(ctx, { providerRecordId: "p1", fullName: "Jane Doe", email: "jane@acme.com", linkedinUrl: "https://linkedin.com/in/jane-doe", company: { name: "Acme", domain: "acme.com", headcount: 40 } }, { kind: "manual" });
    expect(a.created).toBe(true);
    // Same LinkedIn, different casing/URL shape, no email → merges, keeps the email.
    const b = await leads.upsertContactFromPerson(ctx, { providerRecordId: "p2", fullName: "J. Doe", linkedinUrl: "https://www.linkedin.com/in/Jane-Doe/", title: "VP Marketing" }, { kind: "csv_import" });
    expect(b.created).toBe(false);
    expect(b.contact.id).toBe(a.contact.id);
    expect(b.contact.email).toBe("jane@acme.com");
    expect(b.contact.title).toBe("VP Marketing");
    // Same email only → merges too.
    const c = await leads.upsertContactFromPerson(ctx, { providerRecordId: "p3", fullName: "Jane Doe", email: "JANE@acme.com" }, { kind: "api" });
    expect(c.contact.id).toBe(a.contact.id);
    expect(await prisma.contact.count({ where: { workspaceId: ctx.workspaceId } })).toBe(1);
    expect(await prisma.lead.count({ where: { workspaceId: ctx.workspaceId } })).toBe(1);
    expect(await prisma.leadSource.count({ where: { leadId: a.lead.id } })).toBe(3);
    expect(await prisma.targetAccount.count({ where: { workspaceId: ctx.workspaceId, domain: "acme.com" } })).toBe(1);
  });

  it("rejects identity collisions on manual edit and isolates workspaces", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const one = await leads.upsertContactFromPerson(a.ctx, { providerRecordId: "x", fullName: "One", email: "one@a.com" }, { kind: "manual" });
    const two = await leads.upsertContactFromPerson(a.ctx, { providerRecordId: "y", fullName: "Two", email: "two@a.com" }, { kind: "manual" });
    await expect(leads.updateLead(a.ctx, two.lead.id, { contact: { email: "one@a.com" } })).rejects.toThrow(/already has/);
    await expect(leads.getLead(b.ctx, one.lead.id)).rejects.toThrow(/not found/);
    await expect(leads.updateLead(b.ctx, one.lead.id, { status: "qualified" })).rejects.toThrow(/not found/);
    // Same email in another workspace is a different contact.
    const other = await leads.upsertContactFromPerson(b.ctx, { providerRecordId: "z", fullName: "One", email: "one@a.com" }, { kind: "manual" });
    expect(other.created).toBe(true);
  });

  it("imports CSV rows with mapping, counting duplicates and invalid rows", async () => {
    const { ctx } = await makeWorkspace();
    const batch = await leads.importCsv(ctx, {
      fileName: "list.csv",
      mapping: { fullName: "Name", email: "Email", company: "Company", title: "Title" },
      rows: [
        { Name: "Ann Lee", Email: "ann@foo.com", Company: "Foo", Title: "CEO" },
        { Name: "Ann Lee", Email: "ann@foo.com", Company: "Foo", Title: "CEO" },
        { Name: "", Email: "", Company: "", Title: "" },
        { Name: "Bad Email", Email: "nope", Company: "Bar", Title: "" },
      ],
    });
    expect(batch.addedCount).toBe(1);
    expect(batch.duplicateCount).toBe(1);
    expect(batch.invalidCount).toBe(2);
    const page = await leads.listLeads(ctx, { limit: 50 });
    expect(page.items).toHaveLength(1);
    const csv = await leads.exportLeadsCsv(ctx, { limit: 50 });
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("ann@foo.com");
  });
});

describe("discovery: search → review → import", () => {
  it("runs a provider search, flags duplicates, records decisions and imports good fits once", async () => {
    const { ctx } = await makeWorkspace();
    await integrations.createIntegration(ctx, { category: "people_data", provider: "mock" });
    const profile = await icp.createIcp(ctx, { name: "Marketing UAE", criteria: { titles: ["Head of Marketing"], countries: ["AE"], companySize: { min: 10, max: 100 } } as never });
    // Pre-existing contact that the search will also return.
    await leads.upsertContactFromPerson(ctx, { providerRecordId: "pre", fullName: "Mock Person 1", email: "mock.person1@example.com" }, { kind: "manual" });

    const criteria = discovery.criteriaFromIcp(profile.criteria as never);
    expect(criteria.titles).toEqual(["Head of Marketing"]);
    const search = await discovery.createSearch(ctx, { name: "Test search", icpProfileId: profile.id, criteria, requestedCount: 12, requestId: "search-req-0001" });
    expect(search.provider).toBe("mock");
    // Idempotent create with the same requestId
    const again = await discovery.createSearch(ctx, { name: "Test search", icpProfileId: profile.id, criteria, requestedCount: 12, requestId: "search-req-0001" });
    expect(again.id).toBe(search.id);

    const previewed = await discovery.previewSearch(ctx, search.id);
    expect((previewed.preview as { totalEstimate: number }).totalEstimate).toBe(42);

    await discovery.runSearch(ctx, search.id, "search-run-0001");
    const done = await discovery.getSearch(ctx, search.id);
    expect(done.status).toBe("completed");
    expect(done.resultCount).toBe(12);
    expect(done.duplicateCount).toBe(1);

    const results = await discovery.getSearchResults(ctx, search.id);
    expect(results).toHaveLength(12);
    const dup = results.find((r) => r.duplicateOfContactId);
    expect(dup).toBeTruthy();
    await expect(discovery.runSearch(ctx, search.id, "search-run-0002")).rejects.toThrow(/already ran/);

    const good = results.slice(0, 5).map((r) => ({ resultId: r.id, decision: "good_fit" as const }));
    const bad = results.slice(5).map((r) => ({ resultId: r.id, decision: "not_a_fit" as const }));
    const out = await discovery.decideResults(ctx, search.id, { decisions: [...good, ...bad], finish: true });
    // A result already linked to a known contact is not re-imported.
    const dupInGood = dup && good.some((g) => g.resultId === dup.id) ? 1 : 0;
    expect(out.imported).toBe(5 - dupInGood);
    expect(out.duplicates).toBe(0);
    const leadCount = await prisma.lead.count({ where: { workspaceId: ctx.workspaceId } });
    expect(leadCount).toBe(1 + out.imported);
    // Importing again adds nothing.
    const second = await discovery.importGoodFits(ctx, search.id);
    expect(second.imported).toBe(0);
    const imported = await prisma.lead.findMany({ where: { workspaceId: ctx.workspaceId, icpProfileId: profile.id } });
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.every((l) => l.status === "approved")).toBe(true);
  });

  it("fails clearly when no data provider is configured", async () => {
    const { ctx } = await makeWorkspace();
    await expect(discovery.createSearch(ctx, { name: "x", criteria: discovery.searchCriteriaV1.parse({}), requestedCount: 10 })).rejects.toThrow(/Connect a lead data provider/);
  });
});
