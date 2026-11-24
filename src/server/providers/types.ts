import type { z } from "zod";

/**
 * Provider framework contracts. Business modules depend only on these
 * interfaces; vendor SDKs live in adapters.
 */

export type ProviderCategory = "llm" | "people_data" | "company_data" | "signals" | "email" | "mailbox" | "linkedin" | "x";

export type Capability =
  | "llm.generate"
  | "llm.structured"
  | "people.search"
  | "people.enrich"
  | "email.find"
  | "email.verify"
  | "company.search"
  | "company.enrich"
  | "web.search"
  | "web.fetch"
  | "signals.hiring"
  | "signals.funding"
  | "email.send"
  | "email.inbound"
  | "mailbox.connect"
  | "linkedin.invite"
  | "linkedin.message"
  | "linkedin.inbox"
  | "linkedin.profile"
  | "x.dm"
  | "x.followers"
  | "x.profile";

export interface CredentialField {
  key: string;
  label: string;
  type: "secret" | "text" | "url" | "select";
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
}

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  default?: string | number | boolean;
  help?: string;
  options?: { value: string; label: string }[];
}

export interface HealthResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export type ProviderErrorCode = "auth" | "rate_limited" | "quota" | "invalid_request" | "not_found" | "unavailable" | "unsupported";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly provider: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly details?: unknown;
  constructor(provider: string, code: ProviderErrorCode, message: string, options?: { status?: number; details?: unknown }) {
    super(message);
    this.provider = provider;
    this.code = code;
    this.status = options?.status;
    this.details = options?.details;
    this.retryable = code === "rate_limited" || code === "unavailable";
  }
}

export interface UsageRecord {
  operation: string;
  units: number;
  unitLabel: string;
  estimatedCostCents?: number;
  metadata?: Record<string, unknown>;
}

/** Every adapter call can report usage through this sink. */
export type UsageSink = (usage: UsageRecord) => void;

export interface ProviderInstanceBase {
  readonly id: string;
  readonly category: ProviderCategory;
  testConnection(): Promise<HealthResult>;
}

// ───────────────────────────── LLM ─────────────────────────────

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmGenerateOptions {
  model?: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Free-form label recorded in usage, e.g. "icp.extract" */
  purpose?: string;
}

export interface LlmTextResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason?: string;
}

export interface LlmStructuredOptions<T> extends LlmGenerateOptions {
  schema: z.ZodType<T>;
  schemaName?: string;
  schemaDescription?: string;
}

export interface LlmStructuredResult<T> {
  data: T;
  raw: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider extends ProviderInstanceBase {
  readonly category: "llm";
  readonly defaultModel: string;
  listModels(): Promise<{ id: string; label: string }[]>;
  generateText(options: LlmGenerateOptions): Promise<LlmTextResult>;
  generateStructured<T>(options: LlmStructuredOptions<T>): Promise<LlmStructuredResult<T>>;
}

// ───────────────────────────── People / company data ─────────────────────────────

export interface PeopleSearchCriteria {
  titles?: string[];
  excludeTitles?: string[];
  seniorities?: string[];
  functions?: string[];
  industries?: string[];
  locations?: string[];
  countries?: string[];
  companyNames?: string[];
  companyDomains?: string[];
  excludeCompanyDomains?: string[];
  companySizeMin?: number;
  companySizeMax?: number;
  technologies?: string[];
  keywords?: string[];
  /** Free-text semantic description for providers that support it. */
  semanticQuery?: string;
  limit: number;
  cursor?: string;
}

export interface PersonRecord {
  providerRecordId: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  title?: string;
  seniority?: string;
  function?: string;
  headline?: string;
  email?: string;
  emailStatus?: "valid" | "risky" | "invalid" | "catch_all" | "unknown";
  phone?: string;
  linkedinUrl?: string;
  xHandle?: string;
  location?: string;
  country?: string;
  company?: CompanyRecord;
  sourceUrl?: string;
  /** Provider-specific extras we keep for provenance (minimized). */
  raw?: Record<string, unknown>;
}

export interface CompanyRecord {
  providerRecordId?: string;
  name: string;
  domain?: string;
  website?: string;
  linkedinUrl?: string;
  industry?: string;
  headcount?: number;
  headcountRange?: string;
  location?: string;
  country?: string;
  description?: string;
  technologies?: string[];
  fundingStage?: string;
  lastFundingAt?: string;
  totalFundingUsd?: number;
  investors?: string[];
  raw?: Record<string, unknown>;
}

export interface PeopleSearchResult {
  people: PersonRecord[];
  nextCursor?: string;
  /** Total matches when the provider reports it. */
  totalEstimate?: number;
}

export interface SearchEstimate {
  totalEstimate?: number;
  estimatedCostCents?: number;
  creditsPerRecord?: number;
  note?: string;
}

export interface PeopleSearchProvider extends ProviderInstanceBase {
  readonly category: "people_data";
  estimateSearch?(criteria: PeopleSearchCriteria): Promise<SearchEstimate>;
  searchPeople(criteria: PeopleSearchCriteria): Promise<PeopleSearchResult>;
}

export interface EnrichmentInput {
  email?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  companyDomain?: string;
  companyName?: string;
}

export interface EnrichmentField<T = unknown> {
  value: T;
  confidence: number; // 0..1
  verified?: boolean;
  sourceUrl?: string;
}

export interface EnrichmentResult {
  found: boolean;
  providerRecordId?: string;
  fields: Partial<{
    email: EnrichmentField<string>;
    emailStatus: EnrichmentField<"valid" | "risky" | "invalid" | "catch_all" | "unknown">;
    phone: EnrichmentField<string>;
    title: EnrichmentField<string>;
    linkedinUrl: EnrichmentField<string>;
    xHandle: EnrichmentField<string>;
    location: EnrichmentField<string>;
    country: EnrichmentField<string>;
    headline: EnrichmentField<string>;
    companyName: EnrichmentField<string>;
    companyDomain: EnrichmentField<string>;
    companyHeadcount: EnrichmentField<number>;
    companyIndustry: EnrichmentField<string>;
    companyDescription: EnrichmentField<string>;
    companyTechnologies: EnrichmentField<string[]>;
  }>;
}

export interface EnrichmentProvider extends ProviderInstanceBase {
  readonly category: "people_data";
  enrichPerson(input: EnrichmentInput): Promise<EnrichmentResult>;
  findEmail?(input: { firstName: string; lastName: string; companyDomain: string }): Promise<EnrichmentResult>;
  verifyEmail?(email: string): Promise<{ status: "valid" | "risky" | "invalid" | "catch_all" | "unknown"; score?: number }>;
}

export interface CompanySearchCriteria {
  names?: string[];
  domains?: string[];
  industries?: string[];
  countries?: string[];
  sizeMin?: number;
  sizeMax?: number;
  technologies?: string[];
  keywords?: string[];
  semanticQuery?: string;
  limit: number;
  cursor?: string;
}

export interface CompanyDataProvider extends ProviderInstanceBase {
  readonly category: "company_data" | "people_data";
  searchCompanies?(criteria: CompanySearchCriteria): Promise<{ companies: CompanyRecord[]; nextCursor?: string; totalEstimate?: number }>;
  enrichCompany?(input: { domain?: string; name?: string }): Promise<CompanyRecord | null>;
}

export interface WebPage {
  url: string;
  title?: string;
  text: string;
  publishedAt?: string;
}

export interface WebResearchProvider extends ProviderInstanceBase {
  readonly category: "company_data";
  searchWeb?(query: string, options?: { limit?: number; includeDomains?: string[]; recentDays?: number }): Promise<WebPage[]>;
  fetchPage?(url: string): Promise<WebPage>;
}

// ───────────────────────────── Signals ─────────────────────────────

export interface SignalQuery {
  companyDomains?: string[];
  roles?: string[];
  sinceDays?: number;
  limit: number;
  cursor?: string;
}

export interface SignalEvent {
  dedupeKey: string;
  eventType: "hiring" | "funding" | "leadership_change" | "expansion" | "technology_adopted";
  title: string;
  occurredAt: string;
  url?: string;
  company: { name: string; domain?: string; headcount?: number };
  evidence: Record<string, unknown>;
  confidence: number;
}

export interface SignalProvider extends ProviderInstanceBase {
  readonly category: "signals" | "company_data" | "people_data";
  listSignals(query: SignalQuery): Promise<{ events: SignalEvent[]; nextCursor?: string }>;
}

// ───────────────────────────── Email sending ─────────────────────────────

export interface OutboundEmail {
  from: { email: string; name?: string };
  to: { email: string; name?: string };
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  /** Our own idempotency key; providers that support it use it. */
  idempotencyKey?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface EmailSendResult {
  providerMessageId: string;
  accepted: boolean;
  rawStatus?: string;
}

export interface EmailSendProvider extends ProviderInstanceBase {
  readonly category: "email" | "mailbox";
  send(email: OutboundEmail): Promise<EmailSendResult>;
  /** Domain authentication status when the provider exposes it. */
  getDomainStatus?(domain: string): Promise<{ spf?: boolean; dkim?: boolean; dmarc?: boolean; verified: boolean; details?: unknown }>;
}

export interface InboundEmail {
  providerMessageId: string;
  threadKey?: string;
  inReplyTo?: string;
  references?: string[];
  from: { email: string; name?: string };
  to: string[];
  subject?: string;
  text: string;
  html?: string;
  receivedAt: string;
}

export interface MailboxProvider extends EmailSendProvider {
  readonly category: "mailbox";
  fetchInbound(cursor?: unknown): Promise<{ messages: InboundEmail[]; nextCursor?: unknown }>;
}

// ───────────────────────────── LinkedIn / X ─────────────────────────────

export interface LinkedInProvider extends ProviderInstanceBase {
  readonly category: "linkedin";
  listAccounts(): Promise<{ externalAccountId: string; displayName: string; status: "connected" | "disconnected" | "limited" }[]>;
  getProfile(linkedinUrl: string): Promise<PersonRecord | null>;
  sendInvitation(input: { accountId: string; linkedinUrl: string; note?: string }): Promise<{ providerRef: string }>;
  sendMessage(input: { accountId: string; linkedinUrl: string; text: string }): Promise<{ providerRef: string; threadKey?: string }>;
  fetchInbox(input: { accountId: string; cursor?: unknown }): Promise<{ messages: { providerMessageId: string; threadKey: string; fromLinkedinUrl?: string; text: string; receivedAt: string; direction: "inbound" | "outbound" }[]; nextCursor?: unknown }>;
}

export interface XProvider extends ProviderInstanceBase {
  readonly category: "x";
  getMe(): Promise<{ userId: string; handle: string }>;
  resolveHandle(handle: string): Promise<{ userId: string; handle: string; name?: string } | null>;
  sendDm(input: { recipientUserId: string; text: string }): Promise<{ providerRef: string }>;
  checkFollows(input: { userIds: string[] }): Promise<{ userId: string; follows: boolean | null }[]>;
}

export type AnyProviderInstance =
  | LlmProvider
  | PeopleSearchProvider
  | EnrichmentProvider
  | CompanyDataProvider
  | WebResearchProvider
  | SignalProvider
  | EmailSendProvider
  | MailboxProvider
  | LinkedInProvider
  | XProvider;

export interface ProviderDescriptor<TCreds = Record<string, string>, TConfig = Record<string, unknown>> {
  id: string;
  category: ProviderCategory;
  displayName: string;
  description: string;
  docsUrl?: string;
  capabilities: Capability[];
  credentialFields: CredentialField[];
  configFields: ConfigField[];
  /** Name of the env var(s) that provide a system-level default, if any. */
  systemEnvKeys?: string[];
  credentialsFromEnv?(env: Record<string, string | undefined>): TCreds | null;
  create(args: { credentials: TCreds; config: TConfig; usage: UsageSink; integrationId?: string | null }): AnyProviderInstance;
}
