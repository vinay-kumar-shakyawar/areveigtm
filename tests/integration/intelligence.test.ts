import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { makeWorkspace } = await import("../helpers");
const integrations = await import("@/server/modules/integrations/service");
const leads = await import("@/server/modules/leads/service");
const enrichment = await import("@/server/modules/enrichment/service");
const signals = await import("@/server/modules/signals/service");
const intelligence = await import("@/server/modules/intelligence/service");
const { mockLlmState } = await import("@/server/providers/mock");

async function setup() {
  const ws = await makeWorkspace();
  await integrations.createIntegration(ws.ctx, { category: "llm", provider: "mock" });
  await integrations.createIntegration(ws.ctx, { category: "people_data", provider: "mock" });
  await integrations.createIntegration(ws.ctx, { category: "company_data", provider: "mock" });
  await integrations.createIntegration(ws.ctx, { category: "signals", provider: "mock" });
  const { lead, contact } = await leads.upsertContactFromPerson(ws.ctx, { providerRecordId: "p", fullName: "Dana Lee", linkedinUrl: "https://linkedin.com/in/dana-lee", company: { name: "Mock Company 1", domain: "mock1.example.com" } }, { kind: "manual" });
  return { ...ws, lead, contact };
}

describe("enrichment", () => {
  it("fills missing fields with provenance and never overwrites verified values", async () => {
    const { ctx, lead, contact } = await setup();
    const res = await enrichment.enrichLead(ctx, lead.id);
    expect(res.applied).toContain("email");
    const after = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(after.email).toBe("mock.enriched@example.com");
    expect(after.title).toBe("VP Marketing");
    const rows = await prisma.leadEnrichment.findMany({ where: { contactId: contact.id, field: "email" } });
    expect(rows.length).toBe(1);
    expect(rows[0].appliedAt).toBeTruthy();
    expect(rows[0].provider).toBe("mock");
    // Human marks the email verified; a later provider run must not replace it.
    await enrichment.verifyField(ctx, lead.id, "email", "verified");
    await leads.updateLead(ctx, lead.id, { contact: { email: "dana@real.com" } });
    await enrichment.enrichLead(ctx, lead.id);
    const final = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(final.email).toBe("dana@real.com");
  });

  it("refuses when no enrichment provider is configured", async () => {
    const { ctx } = await makeWorkspace();
    const { lead } = await leads.upsertContactFromPerson(ctx, { providerRecordId: "q", fullName: "Nobody", email: "n@x.com" }, { kind: "manual" });
    await expect(enrichment.requestEnrichment(ctx, lead.id)).rejects.toThrow(/Connect an enrichment provider/);
  });
});

describe("signals and rules", () => {
  it("syncs provider signals, dedupes, attaches to accounts, and fires rules once", async () => {
    const { ctx } = await setup();
    await signals.createRule(ctx, { name: "hiring", enabled: true, match: { eventTypes: ["hiring"], minRelevance: 50, includeInferred: false, minConfidence: 0.5 }, action: "notify" });
    const first = await signals.syncProviderSignals(ctx, { roles: ["Head of Growth"] });
    expect(first.stored).toBe(1);
    const second = await signals.syncProviderSignals(ctx, { roles: ["Head of Growth"] });
    expect(second.stored).toBe(0);
    const page = await signals.listSignals(ctx, { limit: 10 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].isInferred).toBe(false);
    expect(page.items[0].account?.domain).toBe("mock1.example.com");
    const fired = await prisma.activityEvent.count({ where: { workspaceId: ctx.workspaceId, action: "signal_rule.fired" } });
    expect(fired).toBe(1);
    const notifications = await prisma.notification.count({ where: { workspaceId: ctx.workspaceId, type: "signal" } });
    expect(notifications).toBe(1);
  });

  it("records manual signals and isolates rules by workspace", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const s = await signals.recordManualSignal(a.ctx, { eventType: "funding", title: "Raised Series A", companyName: "Foo", companyDomain: "foo.com", relevanceScore: 80 });
    expect(s.source).toBe("user");
    expect((await signals.listSignals(b.ctx, { limit: 10 })).items).toHaveLength(0);
    const rule = await signals.createRule(a.ctx, { name: "r", enabled: true, match: { eventTypes: [], minRelevance: 0, includeInferred: true, minConfidence: 0 }, action: "notify" });
    await expect(signals.deleteRule(b.ctx, rule.id)).rejects.toThrow(/not found/);
  });
});

describe("lead intelligence", () => {
  it("stores research, three explained scores, and flags inferred signals", async () => {
    const { ctx, lead } = await setup();
    const factors = [{ factor: "Title matches ICP", weight: 0.5, evidence: "VP Marketing", contribution: 40 }];
    mockLlmState.nextStructured = {
      whoIsThisPerson: "Dana leads marketing.",
      whatCompanyDoes: "Mock Company 1 builds software.",
      whyTheyMightNeedUs: "They are hiring growth roles.",
      likelyChallenges: ["Pipeline"],
      signalsFound: [
        { signal: "Hiring Head of Growth", evidence: "observed signal", observed: true },
        { signal: "Probably expanding to UAE", evidence: "website mentions Dubai", observed: false },
      ],
      evidence: [{ claim: "VP Marketing", source: "contact record" }],
      bestAngle: "Hiring growth",
      bestChannel: "email",
      suggestedOpener: "Saw you are hiring a Head of Growth.",
      suggestedValueProp: "Pipeline faster",
      nextAction: "Send email",
      scores: { icpFit: { score: 78, factors }, intent: { score: 55, factors }, quality: { score: 60, factors } },
      confidence: 0.7,
      gaps: ["No revenue data"],
    };
    const research = await intelligence.researchLead(ctx, lead.id, { fetchWebsite: true });
    expect(research.modelProvider).toBe("mock");
    const scores = await prisma.leadScore.findMany({ where: { leadId: lead.id, isCurrent: true } });
    expect(scores.map((s) => s.kind).sort()).toEqual(["icp_fit", "intent", "quality"]);
    expect(scores.find((s) => s.kind === "icp_fit")?.score).toBe(78);
    expect((scores[0].explanation as { factors: unknown[] }).factors).toHaveLength(1);
    const inferred = await prisma.buyingSignal.findMany({ where: { workspaceId: ctx.workspaceId, isInferred: true } });
    expect(inferred).toHaveLength(1);
    expect(inferred[0].source).toBe("ai_inference");
    // Second run supersedes scores without duplicating current ones.
    await intelligence.researchLead(ctx, lead.id, { fetchWebsite: false });
    expect(await prisma.leadScore.count({ where: { leadId: lead.id, isCurrent: true } })).toBe(3);
    expect(await prisma.leadScore.count({ where: { leadId: lead.id } })).toBe(6);
  });
});
