import type {
  EnrichmentProvider,
  LlmProvider,
  LlmStructuredOptions,
  PeopleSearchProvider,
  ProviderDescriptor,
  SignalProvider,
  UsageSink,
  WebResearchProvider,
  EmailSendProvider,
  MailboxProvider,
  LinkedInProvider,
  XProvider,
  InboundEmail,
} from "@/server/providers/types";
import { parseStructured } from "@/server/providers/llm/structured";
import { cannedByPurpose } from "@/server/providers/mock/canned";

/**
 * Deterministic mock adapters. Used by tests and by local development when
 * no real provider is configured (`provider: "mock"` integrations). They never
 * contact the network and clearly label everything they return as mock data.
 */

export const mockLlmState: { nextStructured?: unknown; nextText?: string; calls: LlmStructuredOptions<unknown>[] } = { calls: [] };

export function createMockLlm(usage: UsageSink): LlmProvider {
  return {
    id: "mock",
    category: "llm",
    defaultModel: "mock-1",
    async listModels() {
      return [{ id: "mock-1", label: "Mock model" }];
    },
    async testConnection() {
      return { ok: true, message: "Mock provider always connects", latencyMs: 1 };
    },
    async generateText(options) {
      usage({ operation: "llm.generate", units: 10, unitLabel: "tokens" });
      const last = options.messages[options.messages.length - 1]?.content ?? "";
      return { text: mockLlmState.nextText ?? `[mock] ${last.slice(0, 80)}`, model: "mock-1", usage: { inputTokens: 5, outputTokens: 5 } };
    },
    async generateStructured<T>(options: LlmStructuredOptions<T>) {
      usage({ operation: "llm.structured", units: 10, unitLabel: "tokens" });
      mockLlmState.calls.push(options as LlmStructuredOptions<unknown>);
      const canned = options.purpose ? cannedByPurpose[options.purpose] : undefined;
      const raw = JSON.stringify(mockLlmState.nextStructured ?? canned ?? {});
      mockLlmState.nextStructured = undefined;
      return { data: parseStructured("mock", options.schema, raw), raw, model: "mock-1", usage: { inputTokens: 5, outputTokens: 5 } };
    },
  };
}

export function createMockPeople(usage: UsageSink): PeopleSearchProvider & EnrichmentProvider {
  return {
    id: "mock",
    category: "people_data",
    async testConnection() {
      return { ok: true, message: "Mock provider always connects", latencyMs: 1 };
    },
    async estimateSearch() {
      return { totalEstimate: 42, estimatedCostCents: 0, creditsPerRecord: 0, note: "Mock estimate" };
    },
    async searchPeople(criteria) {
      usage({ operation: "people.search", units: criteria.limit, unitLabel: "records" });
      const start = Number(criteria.cursor ?? 0);
      const people = Array.from({ length: Math.min(criteria.limit, 10) }, (_, i) => {
        const n = start + i + 1;
        return {
          providerRecordId: `mock-person-${n}`,
          firstName: "Mock",
          lastName: `Person ${n}`,
          fullName: `Mock Person ${n}`,
          title: criteria.titles?.[0] ?? "Head of Marketing",
          email: `mock.person${n}@example.com`,
          emailStatus: "unknown" as const,
          linkedinUrl: `https://www.linkedin.com/in/mock-person-${n}`,
          location: criteria.locations?.[0] ?? "Dubai, UAE",
          country: criteria.countries?.[0] ?? "AE",
          company: { name: `Mock Company ${n}`, domain: `mock${n}.example.com`, headcount: 25 + n, industry: criteria.industries?.[0] ?? "Software" },
        };
      });
      return { people, nextCursor: start + people.length < 42 ? String(start + people.length) : undefined, totalEstimate: 42 };
    },
    async enrichPerson(input) {
      usage({ operation: "people.enrich", units: 1, unitLabel: "lookups" });
      if (input.email?.includes("notfound")) return { found: false, fields: {} };
      return {
        found: true,
        providerRecordId: "mock-enrich-1",
        fields: {
          email: { value: input.email ?? "mock.enriched@example.com", confidence: 0.9, verified: true },
          emailStatus: { value: "valid", confidence: 0.9 },
          title: { value: "VP Marketing", confidence: 0.7 },
          companyHeadcount: { value: 80, confidence: 0.6 },
        },
      };
    },
    async verifyEmail() {
      return { status: "valid", score: 95 };
    },
  };
}

export function createMockWeb(usage: UsageSink): WebResearchProvider {
  return {
    id: "mock",
    category: "company_data",
    async testConnection() {
      return { ok: true, message: "Mock provider always connects", latencyMs: 1 };
    },
    async searchWeb(query) {
      usage({ operation: "web.search", units: 1, unitLabel: "searches" });
      return [{ url: "https://example.com/mock", title: `Mock result for ${query}`, text: `Mock page text about ${query}.` }];
    },
    async fetchPage(url) {
      usage({ operation: "web.fetch", units: 1, unitLabel: "pages" });
      return {
        url,
        title: "Mock page",
        text:
          `Mock content fetched from ${url}. Example Corp builds go-to-market software for B2B teams. ` +
          "The platform finds buyers, researches them and runs multichannel outreach from the customer's own accounts. " +
          "Customers include Acme Robotics and Globex. Pricing starts at $75 per month per seat with a free trial. " +
          "Founded in Dubai, the team serves the UAE, Saudi Arabia and the United Kingdom.",
      };
    },
  };
}

export function createMockSignals(usage: UsageSink): SignalProvider {
  return {
    id: "mock",
    category: "signals",
    async testConnection() {
      return { ok: true, message: "Mock provider always connects", latencyMs: 1 };
    },
    async listSignals(query) {
      usage({ operation: "signals.hiring", units: 1, unitLabel: "queries" });
      const domain = query.companyDomains?.[0] ?? "mock1.example.com";
      return {
        events: [
          {
            dedupeKey: `mock:hiring:${domain}:1`,
            eventType: "hiring",
            title: `Hiring: ${query.roles?.[0] ?? "Head of Growth"}`,
            occurredAt: new Date().toISOString(),
            url: `https://${domain}/careers/1`,
            company: { name: "Mock Company 1", domain, headcount: 26 },
            evidence: { jobTitle: query.roles?.[0] ?? "Head of Growth", source: "mock" },
            confidence: 0.8,
          },
        ],
      };
    },
  };
}

export const sentMockEmails: { to: string; from: string; subject: string; text: string; idempotencyKey?: string; headers?: Record<string, string>; inReplyTo?: string }[] = [];

export function createMockEmail(usage: UsageSink): EmailSendProvider {
  return {
    id: "mock",
    category: "email",
    async testConnection() {
      return { ok: true, message: "Mock provider always connects", latencyMs: 1 };
    },
    async send(email) {
      usage({ operation: "email.send", units: 1, unitLabel: "emails" });
      sentMockEmails.push({ to: email.to.email, from: email.from.email, subject: email.subject, text: email.text, idempotencyKey: email.idempotencyKey, headers: email.headers, inReplyTo: email.inReplyTo });
      return { providerMessageId: `mock-msg-${sentMockEmails.length}`, accepted: true };
    },
    async getDomainStatus() {
      return { spf: true, dkim: true, dmarc: true, verified: true };
    },
  };
}

/** Inbound emails queued for the mock mailbox; tests push here and run the inbox sync. */
export const mockInboundQueue: InboundEmail[] = [];

export function createMockMailbox(usage: UsageSink): MailboxProvider {
  const base = createMockEmail(usage);
  return {
    ...base,
    category: "mailbox",
    async fetchInbound() {
      const messages = mockInboundQueue.splice(0, mockInboundQueue.length);
      usage({ operation: "email.inbound", units: messages.length, unitLabel: "messages" });
      return { messages, nextCursor: { at: Date.now() } };
    },
  };
}

export const mockLinkedInState: { sent: { kind: "invite" | "message"; to: string; text?: string }[]; inbox: { providerMessageId: string; threadKey: string; fromLinkedinUrl?: string; text: string; receivedAt: string; direction: "inbound" | "outbound" }[] } = { sent: [], inbox: [] };

export function createMockLinkedIn(usage: UsageSink): LinkedInProvider {
  return {
    id: "mock",
    category: "linkedin",
    async testConnection() {
      return { ok: true, message: "Mock provider always connects", latencyMs: 1 };
    },
    async listAccounts() {
      return [{ externalAccountId: "mock-li-account", displayName: "Mock LinkedIn", status: "connected" }];
    },
    async getProfile(linkedinUrl) {
      return { providerRecordId: `mock:${linkedinUrl}`, fullName: "Mock Profile", linkedinUrl };
    },
    async sendInvitation({ linkedinUrl, note }) {
      usage({ operation: "linkedin.invite", units: 1, unitLabel: "invites" });
      mockLinkedInState.sent.push({ kind: "invite", to: linkedinUrl, text: note });
      return { providerRef: `mock-invite-${mockLinkedInState.sent.length}` };
    },
    async sendMessage({ linkedinUrl, text }) {
      usage({ operation: "linkedin.message", units: 1, unitLabel: "messages" });
      mockLinkedInState.sent.push({ kind: "message", to: linkedinUrl, text });
      return { providerRef: `mock-li-msg-${mockLinkedInState.sent.length}`, threadKey: `mock-chat:${linkedinUrl}` };
    },
    async fetchInbox() {
      const messages = mockLinkedInState.inbox.splice(0, mockLinkedInState.inbox.length);
      return { messages };
    },
  };
}

export const mockXState: { dms: { to: string; text: string }[] } = { dms: [] };

export function createMockX(usage: UsageSink): XProvider {
  return {
    id: "mock",
    category: "x",
    async testConnection() {
      return { ok: true, message: "Mock provider always connects", latencyMs: 1 };
    },
    async getMe() {
      return { userId: "mock-x-me", handle: "arevei_mock" };
    },
    async resolveHandle(handle) {
      const h = handle.replace(/^@/, "");
      return h.includes("missing") ? null : { userId: `x:${h}`, handle: h, name: `Mock ${h}` };
    },
    async sendDm({ recipientUserId, text }) {
      usage({ operation: "x.dm", units: 1, unitLabel: "messages" });
      mockXState.dms.push({ to: recipientUserId, text });
      return { providerRef: `mock-dm-${mockXState.dms.length}` };
    },
    async checkFollows({ userIds }) {
      return userIds.map((userId) => ({ userId, follows: true }));
    },
  };
}

const noCreds = { credentialFields: [], configFields: [] };

export const mockDescriptors: ProviderDescriptor[] = [
  { id: "mock", category: "llm", displayName: "Mock AI (development)", description: "Deterministic responses for local development and tests. Never use in production.", capabilities: ["llm.generate", "llm.structured"], ...noCreds, create: ({ usage }) => createMockLlm(usage) },
  { id: "mock", category: "people_data", displayName: "Mock people data (development)", description: "Returns clearly labelled fake people. Never use in production.", capabilities: ["people.search", "people.enrich", "email.verify"], ...noCreds, create: ({ usage }) => createMockPeople(usage) },
  { id: "mock", category: "company_data", displayName: "Mock web research (development)", description: "Fake web pages for testing research flows.", capabilities: ["web.search", "web.fetch"], ...noCreds, create: ({ usage }) => createMockWeb(usage) },
  { id: "mock", category: "signals", displayName: "Mock signals (development)", description: "Fake hiring signals for testing.", capabilities: ["signals.hiring"], ...noCreds, create: ({ usage }) => createMockSignals(usage) },
  { id: "mock", category: "email", displayName: "Mock email (development)", description: "Captures emails instead of sending them.", capabilities: ["email.send"], ...noCreds, create: ({ usage }) => createMockEmail(usage) },
  { id: "mock", category: "mailbox", displayName: "Mock mailbox (development)", description: "Captures sent email and replays queued inbound replies.", capabilities: ["email.send", "email.inbound", "mailbox.connect"], ...noCreds, create: ({ usage }) => createMockMailbox(usage) },
  { id: "mock", category: "linkedin", displayName: "Mock LinkedIn (development)", description: "Records invitations and messages instead of sending them.", capabilities: ["linkedin.invite", "linkedin.message", "linkedin.inbox", "linkedin.profile"], ...noCreds, create: ({ usage }) => createMockLinkedIn(usage) },
  { id: "mock", category: "x", displayName: "Mock X (development)", description: "Records DMs instead of sending them.", capabilities: ["x.dm", "x.followers", "x.profile"], ...noCreds, create: ({ usage }) => createMockX(usage) },
];
