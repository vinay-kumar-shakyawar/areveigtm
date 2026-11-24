import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { makeWorkspace, ctxAs, addMember } = await import("../helpers");
const integrations = await import("@/server/modules/integrations/service");
const leads = await import("@/server/modules/leads/service");
const campaigns = await import("@/server/modules/campaigns/service");
const sequences = await import("@/server/modules/sequences/service");
const execution = await import("@/server/modules/execution/service");
const senders = await import("@/server/modules/senders/service");
const inbound = await import("@/server/modules/inbound/service");
const webhooks = await import("@/server/modules/webhooks/service");
const emailChannel = await import("@/server/modules/channels/email");
const xChannel = await import("@/server/modules/channels/x");
const { sentMockEmails, mockInboundQueue, mockLinkedInState, mockXState } = await import("@/server/providers/mock");

const ALWAYS = { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" };

async function workspaceWithMailbox() {
  const ws = await makeWorkspace();
  await prisma.workspaceSettings.update({ where: { workspaceId: ws.ctx.workspaceId }, data: { sendingWindow: ALWAYS } });
  await integrations.createIntegration(ws.ctx, { category: "llm", provider: "mock" });
  const mailbox = await integrations.createIntegration(ws.ctx, { category: "mailbox", provider: "mock" });
  const senderId = await senders.createEmailSender(ws.ctx, { integrationId: mailbox.id, emailAddress: "sam@arevei.test", fromName: "Sam Seller", dailyLimit: 50 });
  return { ...ws, mailboxIntegrationId: mailbox.id, senderId };
}

/** Runs a one-step template campaign for a lead and returns the sent message. */
async function sendOneEmail(ctx: Awaited<ReturnType<typeof makeWorkspace>>["ctx"], senderId: string, leadId: string) {
  const campaign = await campaigns.createCampaign(ctx, { name: "Reply test", channels: ["email"], template: "email_3", approvalMode: "approve_sequence_once" });
  const full = await campaigns.getCampaign(ctx, campaign.id);
  const seq = full.sequences[0];
  await sequences.updateSequence(ctx, seq.id, { name: "One step", executionModel: "linear", steps: [
    { kind: "email", delayDays: 0, subject: "Hello {{firstName}}", bodyTemplate: "Hi {{firstName}}.", aiGeneration: { enabled: false, tone: "plain", length: "short" } },
    { kind: "email", delayDays: 3, bodyTemplate: "Following up.", aiGeneration: { enabled: false, tone: "plain", length: "short" } },
  ] }, seq.revision);
  const fresh = await sequences.getSequence(ctx, seq.id);
  await sequences.approveSequence(ctx, seq.id, fresh.revision);
  await campaigns.setCampaignStatus(ctx, campaign.id, "active");
  await campaigns.enrollLeads(ctx, campaign.id, { leadIds: [leadId], senderAccountId: senderId });
  const t = await execution.tick(ctx);
  expect(t.sent).toBe(1);
  const message = await prisma.message.findFirstOrThrow({ where: { leadId, status: "sent" } });
  return { campaign, message };
}

describe("sender accounts", () => {
  it("creates an email sender from an integration, sends a test email with compliance headers, and checks the domain", async () => {
    const { ctx, senderId } = await workspaceWithMailbox();
    const list = await senders.listSenders(ctx);
    expect(list).toHaveLength(1);
    expect(list[0].mailbox?.emailAddress).toBe("sam@arevei.test");
    expect(list[0].mailbox?.inboundMode).toBe("gmail_api");
    expect(list[0].status).toBe("connected");

    const before = sentMockEmails.length;
    const result = await senders.sendTestEmail(ctx, senderId, "owner@arevei.test");
    expect(result.ok).toBe(true);
    expect(sentMockEmails.length).toBe(before + 1);
    expect(sentMockEmails[before].from).toBe("sam@arevei.test");
    expect(sentMockEmails[before].subject).toMatch(/test email/i);

    const report = await senders.checkSenderDomain(ctx, senderId);
    expect(report.domain).toBe("arevei.test");
    expect(report.providerVerified).toBe(true); // mock provider reports verified
    const mb = await prisma.emailMailbox.findFirstOrThrow({ where: { senderAccountId: senderId } });
    expect(mb.verificationState).toBe("verified");

    // Duplicate address is rejected; members cannot manage senders.
    const mailbox = await prisma.integration.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId, category: "mailbox" } });
    await expect(senders.createEmailSender(ctx, { integrationId: mailbox.id, emailAddress: "sam@arevei.test" })).rejects.toThrow(/already/);
    const member = await addMember(ctx.workspaceId, "member");
    await expect(senders.createEmailSender(ctxAs(ctx, "member", member.id), { integrationId: mailbox.id, emailAddress: "x@arevei.test" })).rejects.toThrow(/cannot perform/);
  });

  it("outbound email carries List-Unsubscribe headers and the one-click token unsubscribes the lead", async () => {
    const { ctx, senderId } = await workspaceWithMailbox();
    const a = await leads.upsertContactFromPerson(ctx, { providerRecordId: "a", fullName: "Alice Anders", email: "alice@acme.test", company: { name: "Acme", domain: "acme.test" } }, { kind: "manual" });
    const { message } = await sendOneEmail(ctx, senderId, a.lead.id);
    const sent = sentMockEmails[sentMockEmails.length - 1];
    expect(sent.headers?.["List-Unsubscribe"]).toMatch(/\/api\/unsubscribe\//);
    expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.text).toContain("/u/");

    const link = await emailChannel.unsubscribeLink(ctx.workspaceId, message.id, "alice@acme.test");
    const token = link.split("/u/")[1];
    const [payload, sig] = token.split(".");
    const verified = emailChannel.verifyUnsubscribeToken(payload, sig);
    expect(verified?.email).toBe("alice@acme.test");
    expect(emailChannel.verifyUnsubscribeToken(payload, "deadbeef")).toBeNull();

    const r1 = await inbound.recordUnsubscribe(ctx.workspaceId, { email: verified!.email, messageId: verified!.messageId, method: "list_unsubscribe_header", token });
    expect(r1.handled && !r1.duplicate).toBe(true);
    const r2 = await inbound.recordUnsubscribe(ctx.workspaceId, { email: verified!.email, messageId: verified!.messageId, method: "link", token });
    expect(r2.handled && r2.duplicate).toBe(true);
    expect(await prisma.suppressionEntry.count({ where: { workspaceId: ctx.workspaceId, kind: "email", value: "alice@acme.test", reason: "unsubscribe" } })).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.lead.id } })).status).toBe("unsubscribed");
    const cl = await prisma.campaignLead.findFirstOrThrow({ where: { leadId: a.lead.id } });
    expect(cl.status).toBe("stopped");
    expect(cl.stopReason).toBe("opted_out");
  });
});

describe("inbound replies and delivery events", () => {
  it("matches an inbound reply to the outbound thread, opens a conversation, stops the sequence, and dedupes", async () => {
    const { ctx, senderId } = await workspaceWithMailbox();
    const a = await leads.upsertContactFromPerson(ctx, { providerRecordId: "a", fullName: "Alice Anders", email: "alice@acme.test" }, { kind: "manual" });
    const { campaign, message } = await sendOneEmail(ctx, senderId, a.lead.id);
    const follow = await prisma.stepRun.findFirstOrThrow({ where: { campaignLeadId: message.campaignLeadId!, stepIndex: 1 } });
    expect(follow.status).toBe("scheduled");

    mockInboundQueue.push({ providerMessageId: "<reply-1@acme.test>", inReplyTo: message.providerMessageId!, from: { email: "Alice@Acme.test", name: "Alice" }, to: ["sam@arevei.test"], subject: "Re: Hello Alice", text: "Sure, let's talk next week.\n\nOn Mon, Sam wrote:\n> Hi Alice.", receivedAt: new Date().toISOString() });
    const sync = await senders.syncInboxNow(ctx, senderId);
    expect(sync).toEqual({ fetched: 1, created: 1 });

    const convo = await prisma.conversation.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId, leadId: a.lead.id } });
    expect(convo.channel).toBe("email");
    expect(convo.campaignId).toBe(campaign.id);
    expect(convo.status).toBe("needs_attention");
    expect(convo.replyStatus).toBe("awaiting_decision");
    expect(convo.unreadCount).toBe(1);
    const reply = await prisma.message.findFirstOrThrow({ where: { conversationId: convo.id, direction: "inbound" } });
    expect(reply.status).toBe("received");
    expect(reply.body).toContain("next week");
    expect(reply.campaignLeadId).toBe(message.campaignLeadId);
    // Reply ingestion marks the lead replied; the inline AI triage (mock: "question") then promotes it to qualified.
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.lead.id } })).status).toBe("qualified");
    const cl = await prisma.campaignLead.findUniqueOrThrow({ where: { id: message.campaignLeadId! } });
    expect(cl.status).toBe("stopped");
    expect(cl.stopReason).toBe("replied");
    expect((await prisma.stepRun.findUniqueOrThrow({ where: { id: follow.id } })).status).toBe("cancelled");
    expect(await prisma.activityEvent.count({ where: { conversationId: convo.id, action: "reply.received" } })).toBe(1);
    // One notification for the reply itself and one for the AI triage result.
    expect(await prisma.notification.count({ where: { workspaceId: ctx.workspaceId, type: "reply" } })).toBe(2);

    // Same provider message again → ignored; own outbound echo → ignored; unknown sender → ignored.
    const dup = await inbound.ingestInboundEmail(ctx.workspaceId, { senderAccountId: senderId, mailboxAddress: "sam@arevei.test" }, { providerMessageId: "<reply-1@acme.test>", from: { email: "alice@acme.test" }, to: [], text: "again", receivedAt: new Date().toISOString() });
    expect(dup).toMatchObject({ created: false, reason: "duplicate" });
    const own = await inbound.ingestInboundEmail(ctx.workspaceId, { senderAccountId: senderId, mailboxAddress: "sam@arevei.test" }, { providerMessageId: "<own@arevei.test>", from: { email: "sam@arevei.test" }, to: [], text: "me", receivedAt: new Date().toISOString() });
    expect(own.reason).toBe("own_message");
    const stranger = await inbound.ingestInboundEmail(ctx.workspaceId, { senderAccountId: senderId }, { providerMessageId: "<spam@nowhere.test>", from: { email: "nobody@nowhere.test" }, to: [], text: "hi", receivedAt: new Date().toISOString() });
    expect(stranger.reason).toBe("no_match");
    expect(await prisma.message.count({ where: { conversationId: convo.id, direction: "inbound" } })).toBe(1);
  });

  it("records delivery, bounce and complaint events against the sent message", async () => {
    const { ctx, senderId } = await workspaceWithMailbox();
    const a = await leads.upsertContactFromPerson(ctx, { providerRecordId: "a", fullName: "Bo Bounce", email: "bo@bounce.test" }, { kind: "manual" });
    const { message } = await sendOneEmail(ctx, senderId, a.lead.id);
    await inbound.recordDelivered(ctx.workspaceId, message.providerMessageId!);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("delivered");
    const r = await inbound.recordBounce(ctx.workspaceId, { providerMessageId: message.providerMessageId, kind: "bounce", detail: "550 user unknown", permanent: true });
    expect(r.handled).toBe(true);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("bounced");
    expect(await prisma.suppressionEntry.count({ where: { workspaceId: ctx.workspaceId, value: "bo@bounce.test", reason: "bounce" } })).toBe(1);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: a.contact.id } })).emailStatus).toBe("invalid");
    expect((await prisma.campaignLead.findFirstOrThrow({ where: { leadId: a.lead.id } })).stopReason).toBe("bounced");
    expect(await prisma.activityEvent.count({ where: { workspaceId: ctx.workspaceId, action: "email.bounced" } })).toBe(1);
    // Unknown message id and no email → nothing to do.
    expect((await inbound.recordBounce(ctx.workspaceId, { providerMessageId: "nope", kind: "complaint" })).handled).toBe(false);
  });

  it("ingests LinkedIn replies from a connected mock account and X DMs go through the mock adapter", async () => {
    const ws = await makeWorkspace();
    await integrations.createIntegration(ws.ctx, { category: "linkedin", provider: "mock" });
    await integrations.createIntegration(ws.ctx, { category: "x", provider: "mock" });
    const link = await senders.createLinkedInConnectLink(ws.ctx);
    expect(link.url).toBeNull();
    expect(link.senderId).toBeTruthy();
    const li = await prisma.senderAccount.findUniqueOrThrow({ where: { id: link.senderId! } });
    expect(li.status).toBe("connected");
    expect((li.limits as { warmup: number[] }).warmup).toEqual([5, 7, 10, 15, 16, 20]);

    const bob = await leads.upsertContactFromPerson(ws.ctx, { providerRecordId: "b", fullName: "Bob Brown", linkedinUrl: "https://www.linkedin.com/in/bob-brown" }, { kind: "manual" });
    mockLinkedInState.inbox.push({ providerMessageId: "li-msg-1", threadKey: "chat-1", fromLinkedinUrl: "https://linkedin.com/in/bob-brown/", text: "Thanks for connecting!", receivedAt: new Date().toISOString(), direction: "inbound" });
    mockLinkedInState.inbox.push({ providerMessageId: "li-msg-2", threadKey: "chat-1", text: "my own message", receivedAt: new Date().toISOString(), direction: "outbound" });
    const sync = await senders.syncInboxNow(ws.ctx, link.senderId!);
    expect(sync).toEqual({ fetched: 2, created: 1 });
    const convo = await prisma.conversation.findFirstOrThrow({ where: { workspaceId: ws.ctx.workspaceId, leadId: bob.lead.id } });
    expect(convo.channel).toBe("linkedin");
    expect(convo.externalThreadId).toBe("chat-1");

    // X: a DM message dispatched through the mock provider.
    const xSender = await senders.registerXSender(ws.ctx.workspaceId, (await prisma.integration.findFirstOrThrow({ where: { workspaceId: ws.ctx.workspaceId, category: "x" } })).id, { userId: "123", handle: "arevei" }, ws.user.id);
    const carol = await leads.upsertContactFromPerson(ws.ctx, { providerRecordId: "c", fullName: "Carol", xHandle: "@carol" }, { kind: "manual" });
    const msg = await prisma.message.create({ data: { workspaceId: ws.ctx.workspaceId, leadId: carol.lead.id, channel: "x", direction: "outbound", kind: "x_dm", body: "Hey Carol", status: "approved", toAddress: "carol" } });
    const res = await xChannel.sendXMessage(ws.ctx, msg, { ...xSender, mailbox: null });
    expect("manual" in res).toBe(false);
    expect(mockXState.dms[mockXState.dms.length - 1]).toEqual({ to: "x:carol", text: "Hey Carol" });
  });
});

describe("outbound webhooks", () => {
  let server: Server;
  let port: number;
  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  let respondWith = 200;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.statusCode = respondWith;
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("creates a subscription with a one-time secret, delivers signed events, and retries failures with backoff", async () => {
    const { ctx } = await makeWorkspace();
    const sub = await webhooks.createSubscription(ctx, { url: `http://127.0.0.1:${port}/hook`, events: ["reply.received", "webhook.test"] });
    expect(sub.secret).toMatch(/^whsec_/);
    const listed = await webhooks.listSubscriptions(ctx);
    expect(listed[0].id).toBe(sub.id);
    expect("secret" in listed[0]).toBe(false);

    respondWith = 200;
    const [deliveryId] = await webhooks.emitWebhook(ctx.workspaceId, "reply.received", { leadId: "l1", preview: "hi" });
    const delivered = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(delivered.status).toBe("delivered");
    expect(delivered.responseStatus).toBe(200);
    const last = received[received.length - 1];
    expect(last.headers["x-arevei-event"]).toBe("reply.received");
    expect(webhooks.verifySignature(sub.secret, last.headers["x-arevei-signature"] as string, last.body)).toBe(true);
    expect(webhooks.verifySignature("whsec_wrong", last.headers["x-arevei-signature"] as string, last.body)).toBe(false);
    expect(JSON.parse(last.body)).toMatchObject({ event: "reply.received", workspaceId: ctx.workspaceId, data: { leadId: "l1" } });

    // Unsubscribed event types are not delivered.
    expect(await webhooks.emitWebhook(ctx.workspaceId, "message.sent", { messageId: "m" })).toEqual([]);

    // Failing endpoint → pending with backoff; flush retries; status reflects attempts.
    respondWith = 500;
    const test = await webhooks.testSubscription(ctx, sub.id);
    expect(test?.status).toBe("pending");
    const row1 = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: test!.id } });
    expect(row1.attempt).toBe(2);
    expect(row1.lastError).toBe("HTTP 500");
    expect(row1.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await webhooks.flushDue(new Date())).toBe(0); // not due yet
    expect(await webhooks.flushDue(new Date(Date.now() + 5_000))).toBe(1);
    const row2 = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: test!.id } });
    expect(row2.attempt).toBe(3);
    respondWith = 200;
    await webhooks.flushDue(new Date(Date.now() + 120_000));
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: test!.id } })).status).toBe("delivered");
    expect((await prisma.webhookSubscription.findUniqueOrThrow({ where: { id: sub.id } })).failureCount).toBe(0);

    // Tenant isolation and rotation.
    const other = await makeWorkspace();
    await expect(webhooks.listDeliveries(other.ctx, sub.id)).rejects.toThrow(/not found/i);
    await expect(webhooks.updateSubscription(other.ctx, sub.id, { enabled: false })).rejects.toThrow(/not found/i);
    const rotated = await webhooks.rotateSecret(ctx, sub.id);
    expect(rotated.secret).not.toBe(sub.secret);
    await webhooks.deleteSubscription(ctx, sub.id);
    expect(await webhooks.listSubscriptions(ctx)).toHaveLength(0);
  });
});
