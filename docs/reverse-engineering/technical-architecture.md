# Technical architecture: AREVEI GTM

## 1. Decision summary

The project directory was empty at the start of the investigation (2026-11-17), so there is no existing codebase to preserve. We adopt the preferred stack from the build brief, as a modular monolith:

| Layer | Choice | Rationale |
|---|---|---|
| Web and API | Next.js 15 (App Router, React 19, TypeScript strict), route handlers under `src/app/api/v1/*` | Single deployable, server-side secrets, SSR dashboard. The reference also runs on Next.js (OBSERVED), which confirms the stack fits this product class. |
| UI | Tailwind CSS v4, shadcn/ui (Radix primitives), lucide icons, Recharts for charts | Reusable component system, accessible primitives. Original AREVEI identity (see `ui-analysis.md`). |
| Validation | Zod on every API input, every provider response, and every AI structured output | Rule 7 of the brief; AI outputs are untrusted until parsed. |
| Database | PostgreSQL 16, Prisma ORM, migrations committed | Relational model in `database-design.md`. |
| Queue / scheduler | Redis 7, BullMQ, a separate `worker` process (same codebase, `src/worker/index.ts`) | Background jobs: searches, enrichment, research, message generation, scheduled sends, inbound sync, webhooks, analytics rollups. |
| Auth | Own implementation: email + Argon2id password, emailed one-time code, opaque DB sessions in HttpOnly cookies, CSRF via same-site cookies + origin check on mutations | No third-party auth dependency; workspace RBAC in the service layer. |
| Secrets | `ENCRYPTION_KEY` (32 bytes, base64) for AES-256-GCM credential vault; env vars for system-level provider keys | Workspace credentials never leave the server. |
| AI | Provider abstraction `LlmProvider` with structured outputs (JSON schema / tool calling) over Anthropic, OpenAI, Gemini, DeepSeek, OpenRouter, Bedrock | Configurable per workspace with fallback order. |
| Infra | Docker Compose (`postgres`, `redis`, `web`, `worker`, `mailpit` for dev), multi-stage Dockerfile | Environment-based configuration. |
| Tests | Vitest (unit + integration against a test Postgres), Playwright (smoke) later | Rules 10–13. |

## 2. Repository layout

```
areveigtm/
  prisma/schema.prisma, prisma/migrations/, prisma/seed.ts (dev/demo only, guarded by SEED_DEMO=true)
  src/
    app/                      Next.js routes
      (auth)/sign-in, sign-up, verify
      (app)/[workspaceSlug]/  dashboard, icps, leads, signals, campaigns, inbox, analytics, integrations, settings
      api/v1/                 REST route handlers (thin: parse → auth → service → respond)
      api/webhooks/           inbound provider webhooks (signature-verified)
    server/
      auth/                   sessions, passwords, one-time codes, RBAC guards
      db/                     prisma client, tenant helpers, transactions
      vault/                  credential encryption/decryption (only module allowed to read IntegrationCredential)
      providers/              provider framework
        registry.ts           category → provider id → factory; resolves workspace config + credentials
        llm/                  LlmProvider interface + anthropic, openai, gemini, deepseek, openrouter, bedrock adapters
        people/               PeopleSearchProvider / EnrichmentProvider: apollo, pdl, hunter, snov, exa
        companies/            CompanySearchProvider / WebResearchProvider: exa, firecrawl
        signals/              SignalProvider: hiring/funding adapters (provider-backed), inference adapter (AI, flagged)
        email/                EmailProvider: resend, sendgrid, ses, smtp; mailbox adapters: google, microsoft, imap
        linkedin/             LinkedInProvider: unipile (authorized API), manual fallback
        x/                    XProvider: x_api (OAuth 2.0), manual fallback
        mock/                 deterministic mocks for every interface (used by tests and local dev)
      modules/                business logic, one folder per module, no direct provider SDK imports
        workspace, company, icp, discovery, signals, enrichment, intelligence, campaigns, sequences,
        messaging (generation + approval), execution (scheduler + channel dispatch), inbox, analytics,
        integrations, webhooks, compliance, activity, notifications
      jobs/                   BullMQ queue definitions and processors (thin wrappers around module functions)
      api/                    shared API utilities: error envelope, idempotency, pagination, rate limit
    worker/index.ts           starts processors + repeatable schedulers
    lib/                      shared utils (normalizers, dates, hashing), zod schemas shared by client and server
    components/               UI system (shadcn/ui + app components)
  tests/                      vitest suites: unit, integration (db), tenant-isolation, provider mocks
  docs/                       architecture, api, database, integrations, security, deployment, reverse-engineering
  docker-compose.yml, Dockerfile, .env.example, README.md
```

Dependency rule: `app → modules → providers/db/vault`. Modules never import a vendor SDK; routes never call Prisma directly.

## 3. Multi-tenancy and authorization

- Every request resolves `{ user, workspace, role }` from the session cookie plus the `[workspaceSlug]` path segment (UI) or from an `ApiKey` bearer token (REST). API keys are workspace-scoped with scopes (`read`, `write`, `admin`).
- Roles: `owner` (billing-equivalent, delete workspace, manage integrations and members), `admin` (manage integrations, members, campaigns), `member` (operate leads, campaigns, inbox; cannot see or edit credentials). Guards live in `src/server/auth/rbac.ts` and are unit-tested.
- Tenant scoping is enforced in `src/server/db/tenant.ts`; services receive a `Ctx { workspaceId, userId, role, requestId }` and never accept a bare workspace id from the client.
- Audit log written for every credential change, member change, approval, send, decision, export and deletion.

## 4. Provider framework ("own API keys")

```ts
// src/server/providers/types.ts (abridged)
export type ProviderCategory = 'llm' | 'people' | 'company' | 'signals' | 'email' | 'mailbox' | 'linkedin' | 'x';

export interface ProviderDescriptor<TConfig> {
  id: string;                      // 'anthropic', 'apollo', ...
  category: ProviderCategory;
  displayName: string;
  credentialFields: CredentialField[];   // what the settings UI asks for (api_key, oauth, smtp...)
  configSchema: z.ZodType<TConfig>;      // non-secret config: model, region, caps
  capabilities: string[];                // 'people.search', 'people.enrich', 'email.send', 'linkedin.invite'...
  testConnection(creds, config): Promise<HealthResult>;
  create(creds, config, ctx): ProviderInstance;
}
```

Resolution order for a capability in a workspace: workspace integrations with `enabled=true` ordered by `priority` → system-level default from env (if `ALLOW_SYSTEM_PROVIDER_FALLBACK=true`) → `NotConfiguredError` surfaced to the UI as a "Configure a provider" empty state. Every call records a `ProviderUsage` row and wraps vendor errors into `ProviderError { code: 'auth' | 'rate_limited' | 'quota' | 'invalid_request' | 'unavailable', retryable }`. Fallback to the next provider happens only for `unavailable` and `rate_limited`, never for `auth`.

Security invariants (enforced by tests in `tests/security/credentials.test.ts`): credential ciphertext is never serialized by any API handler; settings endpoints return `{ provider, enabled, fingerprint: '…k3Qa', lastHealthCheckAt }` only; logs redact anything matching configured secrets; Next.js server components never pass credentials to client components (`server-only` import guard in vault and providers).

## 5. Execution engine

1. **Enrolment** creates `CampaignLead` (status `queued`) and the first `StepRun` (`scheduled`, `scheduledFor = now` inside the sending window).
2. **Scheduler** (repeatable BullMQ job every minute) claims due `StepRun` rows per sender account with `SELECT … FOR UPDATE SKIP LOCKED`, checks: campaign active, lead not stopped, suppression list, sender daily limits and warm-up ramp, sending window in the sender's time zone, channel identity present (email/LinkedIn/X), and step condition.
3. **Generation**: if the step uses AI, a `generate-message` job creates a `Message` in `awaiting_approval` (or `approved` when `approvalMode = approve_sequence_once` and the sequence revision is approved). Human approval moves it to `approved`.
4. **Dispatch**: `send-step` job calls the channel provider; records `Message.sent`, `ActivityEvent`, `ProviderUsage`, increments sender counters, schedules the next step (`delayDays` from the step definition; LinkedIn message after `connect` waits for the `invite.accepted` event instead of a timer). Idempotency key `campaignLeadId:stepIndex:attempt` prevents double sends on retry.
5. **Stops**: inbound reply, unsubscribe, bounce, opt-out, disqualification, invalid contact, campaign pause, or limit/safety condition sets `CampaignLead.status=stopped` with `stopReason`, cancels pending `StepRun`s, and emits `sequence.stopped`.
6. **Manual fallback**: when no authorized provider can perform an action (for example a LinkedIn step without a connected provider), the step becomes a `Task` (`manual_pending`) assigned to the lead owner with instructions; marking it done advances the sequence.

## 6. Inbound processing

- Email: provider webhooks (Resend/SendGrid/SES events: delivered, bounced, complained, replied where supported) and IMAP/Graph polling for connected mailboxes; replies matched by `In-Reply-To`/`References` → `Message.threadKey` → `Conversation`.
- LinkedIn/X: provider webhooks or polling through the authorized adapter.
- Every inbound event is stored in `WebhookEvent` first (idempotent on `externalEventId`), then processed by a job: create inbound `Message`, update `Conversation`, stop the sequence, classify with the LLM (structured output), draft a reply (`Message.draft`), notify the assignee. Auto-send only if `aiAutoSendReplies` is on, the classification confidence is above the configured threshold, and the category is in the allow-list; otherwise the draft waits for a human decision.

## 7. API design

- Base `/api/v1`, JSON only, bearer `ApiKey` or session. Error envelope `{ error: { code, message, issues? , retryable } }` with codes mirroring the observed reference model (`invalid_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `provider_error`, `not_configured`).
- Writes accept `requestId` (`^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$`); same id + same body replays the stored result, different body → `409 idempotency_conflict`.
- Versioned objects (sequences, ICPs, company profile) use `revision` + `expectedRevision` → `409 revision_conflict`.
- Lists use cursor pagination `{ items, nextCursor }`, `limit` 1–200.
- Outbound webhooks: `X-Arevei-Event`, `X-Arevei-Delivery`, `X-Arevei-Signature: t=…,v1=HMAC-SHA256(secret, t + "." + rawBody)`, 300 s tolerance, retries at +1 s, +4 s, +60 s, then `gave_up`.

## 8. Observability and operations

- Structured JSON logs (pino) with `requestId`, `workspaceId`, `jobId`; secrets redacted by key pattern.
- `/api/health` (liveness) and `/api/ready` (DB + Redis) endpoints; worker heartbeat key in Redis.
- `BackgroundJob` mirror table for UI job status; BullMQ retries with exponential backoff; dead-letter listing in Settings → System.
- Rate limiting: per-IP on auth endpoints, per-API-key on `/api/v1` (Redis sliding window).

## 9. What stays out of v1

Hosted MCP server for external AI clients, partner/agency API, billing, Instagram/WhatsApp channels, CRM pipeline, AI search/AEO, physical gifts. Each is noted in `implementation-roadmap.md` with the entity hooks already present in the schema where cheap (for example `Integration.category = 'crm'`).
