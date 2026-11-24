import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { makeWorkspace } = await import("../helpers");
const integrations = await import("@/server/modules/integrations/service");
const leads = await import("@/server/modules/leads/service");
const campaigns = await import("@/server/modules/campaigns/service");
const sequences = await import("@/server/modules/sequences/service");
const execution = await import("@/server/modules/execution/service");
const senders = await import("@/server/modules/senders/service");
const inbound = await import("@/server/modules/inbound/service");
const inbox = await import("@/server/modules/inbox/service");
const analytics = await import("@/server/modules/analytics/service");

const ALWAYS = { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" };

describe("analytics", () => {
  it("computes funnel, rates with denominators, channel, campaign and sender tables from stored events", async () => {
    const ws = await makeWorkspace();
    await prisma.workspaceSettings.update({ where: { workspaceId: ws.ctx.workspaceId }, data: { sendingWindow: ALWAYS } });
    await integrations.createIntegration(ws.ctx, { category: "llm", provider: "mock" });
    const mailbox = await integrations.createIntegration(ws.ctx, { category: "mailbox", provider: "mock" });
    const senderId = await senders.createEmailSender(ws.ctx, { integrationId: mailbox.id, emailAddress: "sam@arevei.test" });
    const campaign = await campaigns.createCampaign(ws.ctx, { name: "Metrics", channels: ["email"], template: "email_3", approvalMode: "approve_sequence_once" });
    const seq = (await campaigns.getCampaign(ws.ctx, campaign.id)).sequences[0];
    await sequences.updateSequence(ws.ctx, seq.id, { name: "One", executionModel: "linear", steps: [{ kind: "email", delayDays: 0, subject: "Hi {{firstName}}", bodyTemplate: "Hello.", aiGeneration: { enabled: false, tone: "plain", length: "short" } }] }, seq.revision);
    await sequences.approveSequence(ws.ctx, seq.id, (await sequences.getSequence(ws.ctx, seq.id)).revision);
    await campaigns.setCampaignStatus(ws.ctx, campaign.id, "active");

    const people = await Promise.all([1, 2, 3].map((n) => leads.upsertContactFromPerson(ws.ctx, { providerRecordId: `p${n}`, fullName: `Person ${n}`, email: `p${n}@acme.test` }, { kind: "manual" })));
    await campaigns.enrollLeads(ws.ctx, campaign.id, { leadIds: people.map((p) => p.lead.id), senderAccountId: senderId });
    const t = await execution.tick(ws.ctx);
    expect(t.sent).toBe(3);

    // One reply (question → qualified), then a meeting; one bounce.
    const sent1 = await prisma.message.findFirstOrThrow({ where: { leadId: people[0].lead.id, status: "sent" } });
    const r = await inbound.ingestInboundEmail(ws.ctx.workspaceId, { senderAccountId: senderId, mailboxAddress: "sam@arevei.test" }, { providerMessageId: "<r1@acme.test>", inReplyTo: sent1.providerMessageId!, from: { email: "p1@acme.test" }, to: [], text: "Tell me more?", receivedAt: new Date().toISOString() });
    await inbox.decide(ws.ctx, r.conversationId!, { decision: "meeting_booked", scheduledAt: new Date(Date.now() + 86400_000).toISOString(), durationMin: 30 });
    const sent3 = await prisma.message.findFirstOrThrow({ where: { leadId: people[2].lead.id, status: "sent" } });
    await inbound.recordBounce(ws.ctx.workspaceId, { providerMessageId: sent3.providerMessageId, kind: "bounce", permanent: true });

    const o = await analytics.overview(ws.ctx, { days: 7 });
    expect(o.headline.contacted).toBe(3);
    expect(o.headline.replied).toBe(1);
    expect(o.headline.meetings).toBe(1);
    expect(o.headline.replyRate).toMatchObject({ numerator: 1, denominator: 3 });
    expect(o.headline.replyRate.value).toBeCloseTo(1 / 3);
    expect(o.headline.replyRate.definition).toMatch(/contacted/);
    expect(o.headline.positiveReplyRate).toMatchObject({ numerator: 1, denominator: 1 });
    expect(o.headline.meetingRate).toMatchObject({ numerator: 1, denominator: 1 });
    expect(o.headline.bounceRate).toMatchObject({ numerator: 1, denominator: 3 });
    expect(o.headline.unsubscribeRate.value).toBe(0);
    expect(o.headline.medianHoursToReply).not.toBeNull();
    expect(o.headline.aiDraftsSentUnedited.denominator).toBe(0); // template sends only

    const stage = (s: string) => o.funnel.find((f) => f.stage === s)!.leads;
    expect(stage("Discovered")).toBe(3);
    expect(stage("Enrolled")).toBe(3);
    expect(stage("Contacted")).toBe(3);
    expect(stage("Replied")).toBe(1);
    expect(stage("Qualified")).toBe(1);
    expect(stage("Meeting booked")).toBe(1);

    const email = o.channels.find((c) => c.channel === "email")!;
    expect(email.sent).toBe(3);
    expect(email.replies).toBe(1);
    expect(email.bounces).toBe(1);
    expect(email.replyRate).toMatchObject({ numerator: 1, denominator: 3 });
    expect(o.channels.find((c) => c.channel === "linkedin")!.sent).toBe(0);
    expect(o.classifications).toEqual([{ classification: "question", count: 1 }]);
    expect(o.timeseries.reduce((n, d) => n + d.sent, 0)).toBe(3);
    expect(o.timeseries.reduce((n, d) => n + d.replies, 0)).toBe(1);
    expect(o.timeseries.reduce((n, d) => n + d.meetings, 0)).toBe(1);
    expect(o.timeseries.length).toBeGreaterThanOrEqual(7);

    const camp = o.campaigns.find((c) => c.id === campaign.id)!;
    expect(camp).toMatchObject({ enrolled: 3, sent: 3, replied: 1, meetings: 1, bounces: 1 });
    expect(camp.replyRate.value).toBeCloseTo(1 / 3);
    const sender = o.senders.find((s) => s.id === senderId)!;
    expect(sender).toMatchObject({ sent: 3, replies: 1, bounces: 1, dailyLimit: 40 });
    expect(sender.bounceRate.value).toBeCloseTo(1 / 3);
    expect(o.providerUsage.some((u) => u.provider === "mock" && u.operation === "email.send" && u.calls === 3)).toBe(true);

    // Campaign filter and empty ranges.
    const filtered = await analytics.overview(ws.ctx, { days: 7, campaignId: campaign.id });
    expect(filtered.headline.contacted).toBe(3);
    const other = await campaigns.createCampaign(ws.ctx, { name: "Empty", channels: ["email"], template: "email_3" });
    const empty = await analytics.overview(ws.ctx, { days: 7, campaignId: other.id });
    expect(empty.headline.contacted).toBe(0);
    expect(empty.headline.replyRate.value).toBeNull();

    // Another workspace sees nothing.
    const stranger = await makeWorkspace();
    const none = await analytics.overview(stranger.ctx, { days: 7 });
    expect(none.headline.contacted).toBe(0);
    expect(none.campaigns).toHaveLength(0);
  });
});
