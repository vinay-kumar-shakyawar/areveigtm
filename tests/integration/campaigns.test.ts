import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { makeWorkspace } = await import("../helpers");
const integrations = await import("@/server/modules/integrations/service");
const leads = await import("@/server/modules/leads/service");
const campaigns = await import("@/server/modules/campaigns/service");
const sequences = await import("@/server/modules/sequences/service");
const messaging = await import("@/server/modules/messaging/service");
const execution = await import("@/server/modules/execution/service");
const { sentMockEmails } = await import("@/server/providers/mock");

const ALWAYS = { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" };

async function setup(options?: { withSender?: boolean; approvalMode?: "review_each_message" | "approve_sequence_once" }) {
  const ws = await makeWorkspace();
  await prisma.workspaceSettings.update({ where: { workspaceId: ws.ctx.workspaceId }, data: { sendingWindow: ALWAYS } });
  await integrations.createIntegration(ws.ctx, { category: "llm", provider: "mock" });
  await integrations.createIntegration(ws.ctx, { category: "email", provider: "mock" });
  let senderId: string | null = null;
  if (options?.withSender !== false) {
    const sender = await prisma.senderAccount.create({ data: { workspaceId: ws.ctx.workspaceId, channel: "email", provider: "mock", displayName: "Sam Seller", status: "connected", connectedAt: new Date() } });
    await prisma.emailMailbox.create({ data: { workspaceId: ws.ctx.workspaceId, senderAccountId: sender.id, emailAddress: "sam@arevei.test", provider: "smtp_imap", fromName: "Sam Seller", verificationState: "verified" } });
    senderId = sender.id;
  }
  const campaign = await campaigns.createCampaign(ws.ctx, { name: "Q4 outbound", objective: "Book demos", channels: ["email"], template: "email_3", approvalMode: options?.approvalMode ?? "review_each_message" });
  const full = await campaigns.getCampaign(ws.ctx, campaign.id);
  const seq = full.sequences[0];
  const a = await leads.upsertContactFromPerson(ws.ctx, { providerRecordId: "a", fullName: "Alice Anders", email: "alice@acme.test", title: "VP Marketing", company: { name: "Acme", domain: "acme.test" } }, { kind: "manual" });
  const b = await leads.upsertContactFromPerson(ws.ctx, { providerRecordId: "b", fullName: "Bob Brown", linkedinUrl: "https://linkedin.com/in/bob-brown" }, { kind: "manual" });
  return { ...ws, campaign, seq, senderId, leadA: a.lead, leadB: b.lead };
}

describe("campaigns and sequences", () => {
  it("creates a campaign from a template, enforces approval before activation, and edits revisions", async () => {
    const { ctx, campaign, seq } = await setup();
    expect(seq.steps).toHaveLength(3);
    expect(seq.status).toBe("draft");
    await expect(campaigns.setCampaignStatus(ctx, campaign.id, "active")).rejects.toThrow(/Approve a sequence/);
    await expect(sequences.setSequenceStatus(ctx, seq.id, "active")).rejects.toThrow(/Approve the current revision/);
    await sequences.approveSequence(ctx, seq.id, seq.revision);
    await expect(sequences.approveSequence(ctx, seq.id, seq.revision + 5)).rejects.toThrow(/changed since/);
    const edited = await sequences.updateSequence(ctx, seq.id, { name: "Edited", executionModel: "linear", steps: [{ kind: "email", delayDays: 0, subject: "Hello", bodyTemplate: "Hi {{firstName}}", aiGeneration: { enabled: false, tone: "plain", length: "short" } }] }, seq.revision);
    expect(edited.revision).toBe(seq.revision + 1);
    expect(edited.approvedRevision).toBeNull();
    await expect(sequences.updateSequence(ctx, seq.id, { name: "x", executionModel: "linear", steps: [{ kind: "linkedin_message", delayDays: 0, aiGeneration: { enabled: false, tone: "plain", length: "short" }, bodyTemplate: "hi" }] }, edited.revision)).rejects.toThrow(/connection request/);
    await sequences.approveSequence(ctx, seq.id, edited.revision);
    const active = await campaigns.setCampaignStatus(ctx, campaign.id, "active");
    expect(active.status).toBe("active");
  });

  it("enrolls leads once, skips suppressed and concurrently-active people", async () => {
    const { ctx, campaign, seq, leadA, leadB } = await setup();
    await sequences.approveSequence(ctx, seq.id, seq.revision);
    await campaigns.setCampaignStatus(ctx, campaign.id, "active");
    await prisma.suppressionEntry.create({ data: { workspaceId: ctx.workspaceId, kind: "email", value: "alice@acme.test", reason: "manual" } });
    const r1 = await campaigns.enrollLeads(ctx, campaign.id, { leadIds: [leadA.id, leadB.id] });
    expect(r1.added).toEqual([leadB.id]);
    expect(r1.skipped[0].reason).toMatch(/suppression/);
    const r2 = await campaigns.enrollLeads(ctx, campaign.id, { leadIds: [leadB.id] });
    expect(r2.added).toHaveLength(0);
    expect(r2.skipped[0].reason).toMatch(/already in this campaign/);
    // Second campaign: Bob is active elsewhere, so skipped unless concurrency is allowed.
    const c2 = await campaigns.createCampaign(ctx, { name: "Second", channels: ["email"], template: "email_3" });
    const r3 = await campaigns.enrollLeads(ctx, c2.id, { leadIds: [leadB.id] });
    expect(r3.skipped[0].reason).toMatch(/another campaign/);
    await prisma.workspaceSettings.update({ where: { workspaceId: ctx.workspaceId }, data: { allowConcurrentCampaigns: true } });
    const r4 = await campaigns.enrollLeads(ctx, c2.id, { leadIds: [leadB.id] });
    expect(r4.added).toHaveLength(1);
    expect(await prisma.campaignLead.count({ where: { leadId: leadB.id } })).toBe(2);
  });
});

describe("execution engine", () => {
  it("generates, waits for approval, sends through the mock email provider, and schedules the next step", async () => {
    const { ctx, campaign, seq, senderId, leadA } = await setup();
    await sequences.approveSequence(ctx, seq.id, seq.revision);
    await campaigns.setCampaignStatus(ctx, campaign.id, "active");
    await campaigns.enrollLeads(ctx, campaign.id, { leadIds: [leadA.id], senderAccountId: senderId });
    const before = sentMockEmails.length;

    const t1 = await execution.tick(ctx);
    expect(t1.generated).toBe(1);
    expect(t1.awaiting).toBe(1);
    expect(t1.sent).toBe(0);
    const pending = await messaging.listPendingMessages(ctx, { campaignId: campaign.id });
    expect(pending).toHaveLength(1);
    expect(pending[0].body).toContain("mock draft");
    expect(pending[0].body).toContain("Sam Seller"); // signature appended
    expect(pending[0].subject).toBeTruthy();
    expect(pending[0].generatedBy).toBe("ai");
    expect(sentMockEmails.length).toBe(before); // nothing sent before approval

    // Regenerate, then approve with an edit.
    const regenerated = await messaging.reviewMessage(ctx, pending[0].id, { decision: "regenerate", instructions: "shorter" });
    expect(regenerated.id).not.toBe(pending[0].id);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: pending[0].id } })).status).toBe("rejected");
    await messaging.reviewMessage(ctx, regenerated.id, { decision: "edit", body: "Hi Alice, quick question about your marketing pipeline. Worth a chat?" });

    const t2 = await execution.tick(ctx);
    expect(t2.sent).toBe(1);
    expect(sentMockEmails.length).toBe(before + 1);
    expect(sentMockEmails[sentMockEmails.length - 1].to).toBe("alice@acme.test");
    expect(sentMockEmails[sentMockEmails.length - 1].text).toContain("rather not hear from me again"); // unsubscribe footer
    const msg = await prisma.message.findUniqueOrThrow({ where: { id: regenerated.id } });
    expect(msg.status).toBe("sent");
    expect(msg.providerMessageId).toMatch(/^mock-msg-/);
    const cl = await prisma.campaignLead.findFirstOrThrow({ where: { campaignId: campaign.id, leadId: leadA.id } });
    expect(cl.currentStepIndex).toBe(1);
    expect(cl.status).toBe("active");
    const nextRun = await prisma.stepRun.findFirstOrThrow({ where: { campaignLeadId: cl.id, stepIndex: 1 } });
    expect(nextRun.scheduledFor.getTime()).toBeGreaterThan(Date.now() + 2 * 86400_000);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadA.id } });
    expect(lead.stage).toBe("messaged");
    expect(await prisma.activityEvent.count({ where: { campaignId: campaign.id, action: "message.sent" } })).toBe(1);

    // A tick with nothing due does nothing; re-ticking never double sends.
    const t3 = await execution.tick(ctx);
    expect(t3.claimed).toBe(0);
    expect(sentMockEmails.length).toBe(before + 1);
  });

  it("auto-approves template steps when the sequence was approved once, and stops on reply", async () => {
    const { ctx, campaign, seq, senderId, leadA } = await setup({ approvalMode: "approve_sequence_once" });
    await sequences.updateSequence(ctx, seq.id, { name: "Templated", executionModel: "linear", steps: [
      { kind: "email", delayDays: 0, subject: "Hello {{firstName}}", bodyTemplate: "Hi {{firstName}} at {{company}}.", aiGeneration: { enabled: false, tone: "plain", length: "short" } },
      { kind: "email", delayDays: 0, bodyTemplate: "Following up.", aiGeneration: { enabled: false, tone: "plain", length: "short" } },
    ] }, seq.revision);
    const fresh = await sequences.getSequence(ctx, seq.id);
    await sequences.approveSequence(ctx, seq.id, fresh.revision);
    await campaigns.setCampaignStatus(ctx, campaign.id, "active");
    await campaigns.enrollLeads(ctx, campaign.id, { leadIds: [leadA.id], senderAccountId: senderId });
    const t1 = await execution.tick(ctx);
    expect(t1.sent).toBe(1);
    const sent = await prisma.message.findFirstOrThrow({ where: { leadId: leadA.id, status: "sent" } });
    expect(sent.subject).toBe("Hello Alice");
    expect(sent.body).toContain("Hi Alice at Acme.");
    // Prospect replies → the follow-up (due now because delayDays 0) is cancelled.
    await prisma.message.create({ data: { workspaceId: ctx.workspaceId, leadId: leadA.id, channel: "email", direction: "inbound", kind: "reply", body: "Sure, tell me more", status: "received", receivedAt: new Date() } });
    const t2 = await execution.tick(ctx);
    expect(t2.sent).toBe(0);
    expect(t2.skipped).toBe(1);
    const cl = await prisma.campaignLead.findFirstOrThrow({ where: { campaignId: campaign.id, leadId: leadA.id } });
    expect(cl.status).toBe("stopped");
    expect(cl.stopReason).toBe("replied");
  });

  it("creates a manual task when no authorized sender exists and advances when it is done", async () => {
    const { ctx, campaign, seq, leadA } = await setup({ withSender: false, approvalMode: "approve_sequence_once" });
    await sequences.updateSequence(ctx, seq.id, { name: "T", executionModel: "linear", steps: [{ kind: "email", delayDays: 0, subject: "Hi", bodyTemplate: "Body", aiGeneration: { enabled: false, tone: "plain", length: "short" } }] }, seq.revision);
    const fresh = await sequences.getSequence(ctx, seq.id);
    await sequences.approveSequence(ctx, seq.id, fresh.revision);
    await campaigns.setCampaignStatus(ctx, campaign.id, "active");
    await campaigns.enrollLeads(ctx, campaign.id, { leadIds: [leadA.id] });
    const t = await execution.tick(ctx);
    expect(t.manual).toBe(1);
    const task = await prisma.task.findFirstOrThrow({ where: { leadId: leadA.id, status: "open" } });
    expect(task.instructions).toContain("Body");
    await execution.completeTask(ctx, task.id);
    const cl = await prisma.campaignLead.findFirstOrThrow({ where: { campaignId: campaign.id, leadId: leadA.id } });
    expect(cl.status).toBe("completed");
  });

  it("respects daily limits and sending windows", async () => {
    const { ctx, campaign, seq, senderId, leadA, leadB } = await setup({ approvalMode: "approve_sequence_once" });
    await prisma.contact.update({ where: { id: leadB.contactId }, data: { email: "bob@acme.test" } });
    await sequences.updateSequence(ctx, seq.id, { name: "T", executionModel: "linear", steps: [{ kind: "email", delayDays: 0, subject: "Hi", bodyTemplate: "Body", aiGeneration: { enabled: false, tone: "plain", length: "short" } }] }, seq.revision);
    const fresh = await sequences.getSequence(ctx, seq.id);
    await sequences.approveSequence(ctx, seq.id, fresh.revision);
    await campaigns.updateCampaign(ctx, campaign.id, { dailyLimits: { email: 1 } });
    await campaigns.setCampaignStatus(ctx, campaign.id, "active");
    await campaigns.enrollLeads(ctx, campaign.id, { leadIds: [leadA.id, leadB.id], senderAccountId: senderId });
    const t = await execution.tick(ctx);
    expect(t.sent).toBe(1);
    expect(t.deferred).toBe(1);
    // Outside the window, everything defers.
    await prisma.workspaceSettings.update({ where: { workspaceId: ctx.workspaceId }, data: { sendingWindow: { days: [1, 2, 3, 4, 5], start: "09:00", end: "10:00" } } });
    const sunday = new Date("2026-11-22T12:00:00Z");
    expect(execution.inSendingWindow(sunday, "UTC", { days: [1, 2, 3, 4, 5], start: "09:00", end: "10:00" })).toBe(false);
    const next = execution.nextWindowStart(sunday, "UTC", { days: [1, 2, 3, 4, 5], start: "09:00", end: "10:00" });
    expect(next.toISOString()).toBe("2026-11-23T09:00:00.000Z");
  });

  it("tenant isolation: campaigns and messages are invisible across workspaces", async () => {
    const a = await setup();
    const b = await makeWorkspace();
    await expect(campaigns.getCampaign(b.ctx, a.campaign.id)).rejects.toThrow(/not found/);
    await expect(sequences.approveSequence(b.ctx, a.seq.id, 1)).rejects.toThrow(/not found/);
    await expect(campaigns.enrollLeads(b.ctx, a.campaign.id, { leadIds: [a.leadA.id] })).rejects.toThrow(/not found/);
  });
});
