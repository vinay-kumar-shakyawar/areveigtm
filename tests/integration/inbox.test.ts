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
const { sentMockEmails, mockLlmState } = await import("@/server/providers/mock");

const ALWAYS = { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" };

async function setup() {
  const ws = await makeWorkspace();
  await prisma.workspaceSettings.update({ where: { workspaceId: ws.ctx.workspaceId }, data: { sendingWindow: ALWAYS } });
  await integrations.createIntegration(ws.ctx, { category: "llm", provider: "mock" });
  const mailbox = await integrations.createIntegration(ws.ctx, { category: "mailbox", provider: "mock" });
  const senderId = await senders.createEmailSender(ws.ctx, { integrationId: mailbox.id, emailAddress: "sam@arevei.test", fromName: "Sam Seller" });
  const campaign = await campaigns.createCampaign(ws.ctx, { name: "Inbox test", channels: ["email"], template: "email_3", approvalMode: "approve_sequence_once" });
  const full = await campaigns.getCampaign(ws.ctx, campaign.id);
  const seq = full.sequences[0];
  await sequences.updateSequence(ws.ctx, seq.id, { name: "Two steps", executionModel: "linear", steps: [
    { kind: "email", delayDays: 0, subject: "Hello {{firstName}}", bodyTemplate: "Hi {{firstName}}.", aiGeneration: { enabled: false, tone: "plain", length: "short" } },
    { kind: "email", delayDays: 3, bodyTemplate: "Following up.", aiGeneration: { enabled: false, tone: "plain", length: "short" } },
  ] }, seq.revision);
  const fresh = await sequences.getSequence(ws.ctx, seq.id);
  await sequences.approveSequence(ws.ctx, seq.id, fresh.revision);
  await campaigns.setCampaignStatus(ws.ctx, campaign.id, "active");
  return { ...ws, senderId, campaign };
}

async function sendAndReply(s: Awaited<ReturnType<typeof setup>>, person: { id: string; name: string; email: string }, replyText: string) {
  const up = await leads.upsertContactFromPerson(s.ctx, { providerRecordId: person.id, fullName: person.name, email: person.email, title: "VP Marketing", company: { name: "Acme", domain: "acme.test" } }, { kind: "manual" });
  await campaigns.enrollLeads(s.ctx, s.campaign.id, { leadIds: [up.lead.id], senderAccountId: s.senderId });
  const t = await execution.tick(s.ctx);
  expect(t.sent).toBeGreaterThanOrEqual(1);
  const sent = await prisma.message.findFirstOrThrow({ where: { leadId: up.lead.id, status: "sent" } });
  const r = await inbound.ingestInboundEmail(s.ctx.workspaceId, { senderAccountId: s.senderId, mailboxAddress: "sam@arevei.test" }, { providerMessageId: `<reply-${person.id}@acme.test>`, inReplyTo: sent.providerMessageId!, from: { email: person.email, name: person.name }, to: ["sam@arevei.test"], subject: `Re: Hello`, text: replyText, receivedAt: new Date().toISOString() });
  expect(r.created).toBe(true);
  return { lead: up.lead, conversationId: r.conversationId!, inboundId: r.messageId! };
}

describe("unified inbox", () => {
  it("classifies a reply, drafts a grounded response, lists and filters conversations, and sends on decision", async () => {
    const s = await setup();
    const { lead, conversationId } = await sendAndReply(s, { id: "a", name: "Alice Anders", email: "alice@acme.test" }, "Does this integrate with HubSpot?");
    const convo = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(convo.classification).toBe("question"); // mock canned classification
    expect(convo.classificationConfidence).toBeCloseTo(0.6);
    expect(convo.status).toBe("needs_attention");
    expect(convo.replyStatus).toBe("awaiting_decision");
    expect(convo.unreadCount).toBe(1);
    const draft = await prisma.message.findFirstOrThrow({ where: { conversationId, direction: "outbound", kind: "reply", status: "awaiting_approval" } });
    expect(draft.body).toContain("mock draft");
    expect(draft.body).toContain("Sam Seller"); // sender signature appended
    expect(draft.subject).toMatch(/^Re: /);
    expect(draft.generatedBy).toBe("ai");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("qualified");
    expect(await prisma.activityEvent.count({ where: { conversationId, action: "reply.classified" } })).toBe(1);
    expect(sentMockEmails.filter((e) => e.to === "alice@acme.test")).toHaveLength(1); // nothing auto-sent

    const all = await inbox.listConversations(s.ctx, { filter: "all", assigned: "any", limit: 50 });
    expect(all).toHaveLength(1);
    expect(all[0].pendingDrafts).toBe(1);
    expect(all[0].contact.fullName).toBe("Alice Anders");
    const counts = await inbox.inboxCounts(s.ctx);
    expect(counts.unread).toBe(1);
    expect(counts.awaiting).toBe(1);
    expect(counts.qualified).toBe(1);
    expect(counts.not_interested).toBe(0);
    expect(await inbox.listConversations(s.ctx, { filter: "all", assigned: "any", q: "hubspot", limit: 50 })).toHaveLength(1);
    expect(await inbox.listConversations(s.ctx, { filter: "all", assigned: "any", q: "zzz-nomatch", limit: 50 })).toHaveLength(0);

    const detail = await inbox.getConversation(s.ctx, conversationId);
    expect(detail.messages.map((m) => m.direction)).toEqual(["outbound", "inbound", "outbound"]);
    await inbox.markRead(s.ctx, conversationId);
    expect((await inbox.inboxCounts(s.ctx)).unread).toBe(0);

    const res = await inbox.decide(s.ctx, conversationId, { decision: "send" });
    expect("manual" in res && res.manual).toBe(false);
    const sentReply = sentMockEmails[sentMockEmails.length - 1];
    expect(sentReply.to).toBe("alice@acme.test");
    expect(sentReply.subject).toMatch(/^Re: /);
    expect(sentReply.inReplyTo).toBeTruthy();
    expect((await prisma.message.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("sent");
    const after = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(after.replyStatus).toBe("decided");
    expect(after.status).toBe("awaiting_reply");
    expect(await prisma.replyDecision.count({ where: { conversationId, decision: "send", decidedVia: "ui" } })).toBe(1);
    expect(await prisma.activityEvent.count({ where: { conversationId, action: "reply.sent" } })).toBe(1);
    await expect(inbox.decide(s.ctx, conversationId, { decision: "send", draftMessageId: draft.id })).rejects.toThrow(/already sent/);
  });

  it("supports edit-and-send, regeneration with guidance, status decisions, meetings and opt-out", async () => {
    const s = await setup();
    const { lead, conversationId } = await sendAndReply(s, { id: "b", name: "Bob Brown", email: "bob@acme.test" }, "Maybe. What does it cost?");
    const first = await prisma.message.findFirstOrThrow({ where: { conversationId, status: "awaiting_approval" } });
    mockLlmState.nextStructured = { classification: "interested", confidence: 0.8, summary: "Wants pricing", sentiment: "positive", recommendedAction: "reply", draft: "Pricing starts at $75 per seat. Want a quick walkthrough?", nextAction: "Reply with pricing", proposedTimes: [], questions: ["What does it cost?"] };
    const regenerated = await inbox.regenerateDraft(s.ctx, conversationId, "mention pricing");
    expect(regenerated?.id).not.toBe(first.id);
    expect(regenerated?.body).toContain("$75");
    expect((await prisma.message.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("rejected");
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).status).toBe("interested");

    const edited = await inbox.decide(s.ctx, conversationId, { decision: "edit_and_send", body: "Pricing starts at $75 per seat per month. Free trial available.", draftMessageId: regenerated!.id });
    expect("manual" in edited && edited.manual).toBe(false);
    expect(sentMockEmails[sentMockEmails.length - 1].text).toContain("Free trial");
    const sentMsg = await prisma.message.findUniqueOrThrow({ where: { id: regenerated!.id } });
    expect(sentMsg.status).toBe("sent");
    expect(sentMsg.editedByUserId).toBe(s.user.id);
    expect(await prisma.replyDecision.count({ where: { conversationId, decision: "edit_and_send" } })).toBe(1);

    await expect(inbox.decide(s.ctx, conversationId, { decision: "booking_link" })).rejects.toThrow(/booking link/i);
    await prisma.workspaceSettings.update({ where: { workspaceId: s.ctx.workspaceId }, data: { bookingLink: "https://cal.example.test/sam" } });
    await inbox.decide(s.ctx, conversationId, { decision: "booking_link" });
    expect(sentMockEmails[sentMockEmails.length - 1].text).toContain("https://cal.example.test/sam");
    expect(await prisma.replyDecision.count({ where: { conversationId, decision: "booking_link" } })).toBe(1);

    const meeting = await inbox.decide(s.ctx, conversationId, { decision: "meeting_booked", scheduledAt: new Date(Date.now() + 86400_000).toISOString(), durationMin: 30 });
    expect("meetingId" in meeting && meeting.meetingId).toBeTruthy();
    expect(await prisma.meeting.count({ where: { leadId: lead.id } })).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("meeting_booked");
    expect(await prisma.activityEvent.count({ where: { workspaceId: s.ctx.workspaceId, action: "meeting.booked" } })).toBe(1);
    expect((await inbox.inboxCounts(s.ctx)).meeting_requested).toBe(1);

    await inbox.decide(s.ctx, conversationId, { decision: "snooze", until: new Date(Date.now() + 3 * 86400_000).toISOString() });
    expect((await inbox.inboxCounts(s.ctx)).snoozed).toBe(1);
    await inbox.updateConversation(s.ctx, conversationId, { snoozedUntil: null, assignedUserId: s.user.id });
    const assigned = await inbox.listConversations(s.ctx, { filter: "all", assigned: "me", limit: 50 });
    expect(assigned).toHaveLength(1);

    await inbox.decide(s.ctx, conversationId, { decision: "mark_not_interested", stopSequences: true });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("not_interested");
    expect((await inbox.inboxCounts(s.ctx)).not_interested).toBe(1);

    await inbox.decide(s.ctx, conversationId, { decision: "opt_out" });
    expect(await prisma.suppressionEntry.count({ where: { workspaceId: s.ctx.workspaceId, kind: "email", value: "bob@acme.test" } })).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("unsubscribed");
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).status).toBe("archived");

    // Tenant isolation.
    const other = await makeWorkspace();
    await expect(inbox.getConversation(other.ctx, conversationId)).rejects.toThrow(/not found/i);
    await expect(inbox.decide(other.ctx, conversationId, { decision: "dismiss" })).rejects.toThrow(/not found/i);
  });

  it("auto-sends only when the workspace opted in, confidence clears the threshold and the category is allowed", async () => {
    const s = await setup();
    await prisma.workspaceSettings.update({ where: { workspaceId: s.ctx.workspaceId }, data: { aiAutoSendReplies: true, aiAutoSendMinConfidence: 0.9 } });

    // Below threshold → draft waits.
    mockLlmState.nextStructured = { classification: "interested", confidence: 0.7, summary: "Keen", sentiment: "positive", recommendedAction: "reply", draft: "Great, how about Tuesday?", nextAction: "Propose a time", proposedTimes: [], questions: [] };
    const low = await sendAndReply(s, { id: "c", name: "Cara Low", email: "cara@acme.test" }, "Sounds interesting");
    expect(await prisma.message.count({ where: { conversationId: low.conversationId, status: "awaiting_approval" } })).toBe(1);
    expect(await prisma.replyDecision.count({ where: { conversationId: low.conversationId } })).toBe(0);

    // Above threshold in an allowed category → sent automatically, audited, decided via auto.
    mockLlmState.nextStructured = { classification: "interested", confidence: 0.97, summary: "Wants a call", sentiment: "positive", recommendedAction: "reply", draft: "Great, Tuesday 10am works for me.", nextAction: "Confirm", proposedTimes: ["Tuesday 10am"], questions: [] };
    const high = await sendAndReply(s, { id: "d", name: "Dan High", email: "dan@acme.test" }, "Let's talk Tuesday 10am");
    const auto = await prisma.message.findFirstOrThrow({ where: { conversationId: high.conversationId, direction: "outbound", kind: "reply" } });
    expect(auto.status).toBe("sent");
    expect(sentMockEmails[sentMockEmails.length - 1].text).toContain("Tuesday 10am works");
    expect(await prisma.replyDecision.count({ where: { conversationId: high.conversationId, decidedVia: "auto", decision: "send" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { workspaceId: s.ctx.workspaceId, action: "reply.auto_sent" } })).toBe(1);

    // Unsubscribe classification never drafts or sends; it suppresses and archives.
    mockLlmState.nextStructured = { classification: "unsubscribe", confidence: 0.99, summary: "Asked to stop", sentiment: "negative", recommendedAction: "opt_out", draft: null, nextAction: "Nothing", proposedTimes: [], questions: [] };
    const stop = await sendAndReply(s, { id: "e", name: "Eve Stop", email: "eve@acme.test" }, "Please remove me from your list");
    expect(await prisma.message.count({ where: { conversationId: stop.conversationId, direction: "outbound", kind: "reply" } })).toBe(0);
    expect(await prisma.suppressionEntry.count({ where: { workspaceId: s.ctx.workspaceId, value: "eve@acme.test", reason: "unsubscribe" } })).toBe(1);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: stop.conversationId } })).status).toBe("archived");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: stop.lead.id } })).status).toBe("unsubscribed");
  });

  it("falls back to a manual task when the channel has no connected sender", async () => {
    const s = await setup();
    await integrations.createIntegration(s.ctx, { category: "linkedin", provider: "mock" });
    const link = await senders.createLinkedInConnectLink(s.ctx);
    const bob = await leads.upsertContactFromPerson(s.ctx, { providerRecordId: "li", fullName: "Lin Kedin", linkedinUrl: "https://www.linkedin.com/in/lin-kedin" }, { kind: "manual" });
    const r = await inbound.ingestLinkedInMessage(s.ctx.workspaceId, link.senderId!, { providerMessageId: "li-1", threadKey: "chat-9", fromLinkedinUrl: "https://linkedin.com/in/lin-kedin", text: "Thanks for connecting, what do you do?", receivedAt: new Date().toISOString() });
    expect(r.created).toBe(true);
    // Disconnect the sender so LinkedIn sending must become a manual task.
    await prisma.senderAccount.update({ where: { id: link.senderId! }, data: { status: "disconnected" } });
    const res = await inbox.decide(s.ctx, r.conversationId!, { decision: "edit_and_send", body: "We help B2B teams find buyers." });
    expect("manual" in res && res.manual).toBe(true);
    const task = await prisma.task.findFirstOrThrow({ where: { leadId: bob.lead.id, kind: "manual_linkedin_action" } });
    expect(task.instructions).toContain("find buyers");
  });
});
