# Architecture

## Stack

- **Next.js 16 (App Router, Turbopack)**, React 19, TypeScript strict, Tailwind 4, shadcn/ui (Base UI).
- **PostgreSQL 16** via **Prisma 6**. Embedded Postgres for development and tests; any Postgres in production.
- **pg-boss** job queue on the same database (`JOBS_BACKEND=pgboss`), inline execution in development/tests.
- **pino** structured logging with secret redaction.
- No Redis required. No external services beyond the providers each workspace configures.

## Layout

```
src/
  app/                      routes (pages + API handlers)
    (auth)/                 sign-in, sign-up, verify, forgot-password
    w/[workspaceSlug]/      the product: dashboard, company, icps, leads, signals, campaigns, inbox, analytics, integrations, settings
    api/v1/                 REST API (session cookie or API key)
    api/webhooks/           inbound provider webhooks (signature-verified, no session)
    api/oauth/              Gmail / Microsoft 365 / X connect flows
    api/unsubscribe/, u/    one-click and landing-page unsubscribe
  server/
    auth/                   passwords (Argon2id), emailed codes, sessions, RBAC, workspace context
    api/                    handler wrapper, error envelope, rate limit, idempotency, pagination
    vault/                  AES-256-GCM sealing with key versions and AAD
    providers/              provider descriptors + adapters (llm, people, company, signals, email, mailbox, linkedin, x, mock)
    ai/                     aiStructured/aiText facade with fallback and provenance
    modules/                business logic, one folder per domain (company, icp, leads, discovery, enrichment, signals,
                            intelligence, campaigns, sequences, messaging, execution, channels, senders, inbound, inbox,
                            webhooks, analytics, integrations, workspace, api-keys, audit)
    jobs/                   defineJob / enqueue / worker bootstrap
  worker/                   long-running worker: campaign ticks, inbox polling, webhook retries
prisma/                     schema (48 models) and migrations
tests/                      vitest unit + integration (embedded Postgres), mocks for every provider
scripts/                    dev-db, e2e smoke, backup/restore
docs/                       this folder
```

## Request path

1. `apiHandler` resolves the actor: session cookie (`arevei_session`, opaque token hashed in DB) or `Authorization: Bearer agk_…` API key (SHA-256 hashed, scoped read/write/admin).
2. Tenant resolution from the `[workspace]` route segment (slug or id); API keys can only reach their own workspace.
3. Rate limit (per user/key/IP; strict routes get their own bucket), CSRF origin check for cookie sessions, zod validation of body and query.
4. The service function receives a `Ctx { workspaceId, userId, role, actorType, requestId }` and enforces permissions with `requirePermission`.
5. Errors become `{ error: { code, message, retryable, issues?, details? } }` with `x-request-id`.

Every service query is filtered by `workspaceId`; the integration tests include cross-tenant cases for each module.

## Provider framework

A **descriptor** declares id, category, capabilities, credential/config fields, optional env fallback and a `create()` factory. The **registry** resolves instances for a capability in priority order (workspace integrations, then env fallback when `ALLOW_SYSTEM_PROVIDER_FALLBACK=true`). `withFallback` retries the next provider on retryable errors and records health. Every call writes a `ProviderUsage` row (operation, units, estimated cost, lead/campaign attribution). Credentials are opened only inside the registry, immediately before a call.

Capabilities: `llm.generate`, `llm.structured`, `people.search`, `people.enrich`, `email.find`, `email.verify`, `company.search`, `web.search`, `web.fetch`, `signals.*`, `email.send`, `email.inbound`, `mailbox.connect`, `linkedin.invite|message|inbox|profile`, `x.dm|followers|profile`.

## Campaign execution

`execution.tick(ctx)` claims due `StepRun`s and, per step: checks stop conditions (reply, opt-out, status), evaluates conditions, enforces the sending window (workspace or sender time zone) and daily limits, generates the message if needed, applies the approval gate (`review_each_message` or `approve_sequence_once`), dispatches through the channel module, and schedules the next step. Steps that no authorized integration can perform become **manual tasks**; completing one advances the sequence. The worker enqueues a tick per workspace every minute; the UI can run it on demand.

## Inbound and inbox

Replies arrive by provider webhook (Resend, SendGrid, SES via SNS, Unipile) or by polling (`inbox.sync` every two minutes for IMAP, Gmail, Microsoft Graph and LinkedIn inboxes). `inbound.ingestInboundEmail/ingestLinkedInMessage` match the thread, open a conversation, stop sequences, and enqueue `inbox.process`, which classifies the reply and drafts a response. Decisions (`send`, `edit_and_send`, `snooze`, `mark_*`, `meeting_booked`, `booking_link`, `start_sequence`, `dismiss`, `opt_out`) are recorded as `ReplyDecision` rows.

## Events and analytics

Every meaningful action appends an `ActivityEvent` (`message.sent`, `reply.received`, `meeting.booked`, `email.bounced`, `unsubscribe`, …) with lead/campaign/conversation/sender attribution. Analytics are computed from these rows with SQL; see `docs/analytics/metrics.md`. Outbound webhooks (`WebhookSubscription` + `WebhookDelivery`) fan the same events out to customer endpoints with HMAC signatures and retries.

## Jobs

| Job | Trigger | Purpose |
|---|---|---|
| `campaign.tick` / `campaign.tick-all` | worker cron `* * * * *`, UI button | run due steps |
| `search.run` | user | execute a people search |
| `lead.enrich`, `lead.research`, `signals.sync` | user / rules | enrichment, AI research, signal ingestion |
| `inbox.sync` / `inbox.sync-all` | worker cron `*/2 * * * *`, UI button | poll mailboxes and LinkedIn inboxes |
| `inbox.process` | on inbound reply | classify + draft |
| `webhook.deliver` / `webhook.flush` | on event, worker cron `* * * * *` | deliver and retry outbound webhooks |

Handlers are idempotent; `BackgroundJob` rows record status for the UI.
