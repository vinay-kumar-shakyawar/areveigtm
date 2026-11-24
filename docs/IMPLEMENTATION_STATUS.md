# Implementation status

Legend: ✅ implemented and verified (tests or manual run) · 🟡 implemented, live verification pending (needs real credentials) · ⬜ not started · ❌ out of scope for v1

Last updated: 2026-11-17

## Phase 0 — Investigation ✅

- REA installed (`npx rea-agents@latest setup --client claude_code`, dry-run reviewed, applied; `rea doctor` healthy). Runs under a cached Node 24 because the system Node 22.17 is below REA's minimum.
- PumpGTM public site, developer docs, OpenAPI (65 endpoints), MCP server card (70 tools), sign-in page and public bundle inspected. Evidence in `docs/reverse-engineering/evidence/`.
- Nine documents in `docs/reverse-engineering/`.

## Phase 1 — Foundation ✅

| Item | Status | Verification |
|---|---|---|
| Next.js 16 + TypeScript strict + Tailwind v4 + shadcn/ui (Base UI) scaffold | ✅ | `npm run typecheck`, `npm run lint` |
| Prisma schema (46 models) + initial migration | ✅ | `prisma migrate dev` on embedded Postgres 17 |
| Docker Compose (postgres, mailpit, web, worker) + Dockerfile | 🟡 | Docker not available on the build machine; compose file not executed |
| Embedded Postgres for local dev/tests (`npm run dev:db`) | ✅ | used by tests |
| Auth: register, password sign-in, emailed one-time code, verify email, password reset, sessions (opaque, HttpOnly, sliding) | ✅ | `tests/integration/auth.test.ts`, browser smoke |
| Workspaces: create, list, switch, settings (time zone, sending window, limits, AI auto-send flag), soft delete | ✅ | `tests/integration/workspace.test.ts` |
| Members: invite by email, accept, roles owner/admin/member, transfer ownership, remove | ✅ | tests |
| RBAC permission catalogue | ✅ | `tests/unit/rbac.test.ts` |
| Audit log + activity ledger + notifications helpers | ✅ | tests (audit rows asserted) |
| API keys (hashed, scoped, revocable) + bearer auth on `/api/v1` | ✅ | browser smoke uses a key against the API |
| App shell: sidebar, workspace switcher, global search (⌘K), notification center, user menu, mobile sheet | ✅ | browser smoke |
| Dashboard with real counters and setup checklist | ✅ | browser smoke |
| Settings pages: general, members, API keys, profile, audit log | ✅ | browser smoke |
| Health (`/api/health`) and readiness (`/api/ready`) | ✅ | curl |
| Proxy redirect for unauthenticated app routes | ✅ | curl |

## Phase 2 — AI and provider framework ✅

| Item | Status | Verification |
|---|---|---|
| Provider contracts (`src/server/providers/types.ts`) and registry with workspace credentials, priority/default ordering, env fallback, usage ledger, retryable fallback | ✅ | `tests/integration/providers.test.ts` |
| Credential vault (AES-256-GCM, versioned key, AAD bound to integration id) | ✅ | `tests/unit/vault.test.ts` |
| LLM adapters: Anthropic (structured outputs via `output_config.format`), OpenAI / DeepSeek / OpenRouter (one OpenAI-compatible adapter), Gemini (REST), AWS Bedrock (Converse) | 🟡 | typed and unit-tested through mocks; live calls need keys |
| Data adapters: Apollo, People Data Labs, Hunter, Snov.io, Exa, Firecrawl, built-in page fetcher | 🟡 | request shapes follow public docs; live verification pending keys |
| Mock adapters (LLM, people, web, signals, email) for dev/tests | ✅ | tests |
| Integrations settings UI: add/edit/test/enable/disable/default/remove, usage tab | ✅ | browser smoke |
| Integrations REST API | ✅ | browser smoke via API key |

## Phase 3 — Lead intelligence ✅

| Item | Status | Verification |
|---|---|---|
| Company profile: website fetch → grounded AI draft with evidence → apply → approve; edits invalidate approval; revision concurrency | ✅ | `tests/integration/company-icp.test.ts`, browser smoke |
| ICP builder: plain language → structured `IcpCriteriaV1` (Zod), rationale + ambiguities, CRUD, duplicate, activate/archive, default | ✅ | tests, browser smoke |
| Lead search: ICP → provider criteria, preview estimate, run (job), review batch with match reasons and duplicate flags, decisions, import once | ✅ | `tests/integration/leads-discovery.test.ts`, browser smoke |
| Canonical contacts: one per workspace per LinkedIn slug / email / X handle; merges never overwrite; accounts by domain; `LeadSource` per origin | ✅ | tests |
| CSV import with column mapping, duplicate/invalid counts; CSV export | ✅ | tests, UI |
| Lead list with filters and cursor pagination; lead profile with provenance, scores, research, signals, activity, pipeline controls | ✅ | browser smoke |
| Enrichment waterfall with field-level provenance; verified values are never replaced automatically; human verify/invalidate | ✅ | `tests/integration/intelligence.test.ts` |
| Buying signals: provider sync (hiring via Exa/mock), manual signals, dedupe, observed vs inferred, rules (notify / flag lead / suggest campaign) firing once | ✅ | tests, browser smoke |
| AI lead research: who/what/why, challenges, signals, evidence, angle, channel, opener, value prop, next action; three explained scores with factors; inferred signals stored flagged | ✅ | tests, browser smoke |
| Job abstraction (inline in dev/test, pg-boss in production) + worker entry (`npm run worker`) | 🟡 | inline path tested; pg-boss path not executed here (no Postgres outside embedded) |

## Phase 4 — Campaigns ✅

| Item | Status | Verification |
|---|---|---|
| Campaign CRUD: objective, ICP, channels, approval mode, daily limits, exclusions, schedule; status machine draft → active ↔ paused → completed/archived; activation requires an approved sequence | ✅ | `tests/integration/campaigns.test.ts`, browser smoke |
| Sequences: step kinds (LinkedIn connect/message/InMail/engage, email, X DM/engage, wait, manual task), validation rules, revision + approval of the exact reviewed revision, edits invalidate approval, sent steps immutable ("save as new sequence"), default templates | ✅ | tests, browser smoke |
| Enrolment: one per campaign per lead, skips suppressed / opted-out / excluded / concurrently active people, first step scheduled | ✅ | tests |
| AI message generation per person and step with grounded context (company profile, ICP, research, observed signals, thread history), channel limits, anti-fabrication rules, template variables, A/B variants; reasoning and risks stored with each draft | ✅ | tests (mock LLM), browser smoke |
| Review queue: approve, edit, regenerate with guidance, reject, approve all | ✅ | tests, browser smoke |
| Execution engine: per-minute tick (worker) or on demand, stop rules (reply, opt-out, status, bounce), conditions, sending windows in workspace time zone, daily limits per channel/sender, idempotent sends, next-step scheduling, completion | ✅ | tests |
| Channel dispatch: email through the sender's provider with unsubscribe footer and List-Unsubscribe headers; LinkedIn and X through authorized adapters or **manual tasks** when no connected sender exists; task completion advances the sequence | ✅ | tests, browser smoke (manual-task path) |

## Phase 5 — Channels ✅ (live provider verification pending keys)

| Item | Status | Verification |
|---|---|---|
| Email send adapters: Resend, SendGrid, Amazon SES (SDK v2), any SMTP mailbox; Gmail (Gmail API) and Microsoft 365 (Graph) via OAuth 2.0 with server-side token refresh persisted to the vault | ✅ code; ⏳ live | `tests/integration/channels.test.ts` (mock mailbox end to end); real providers need keys |
| Sending accounts UI (Integrations → Sending accounts): add email sender from an integration, connect Gmail / Microsoft buttons, send a real test email (explicit action, rate limited), SPF/DKIM/DMARC/MX check with provider status, daily limits, pause, delete; per-integration delivery webhook URLs shown | ✅ | browser smoke (`14-senders`, `15-domain-auth`) |
| Compliance: unsubscribe footer link `/u/<token>`, RFC 8058 one-click `List-Unsubscribe` + `List-Unsubscribe-Post`, HMAC-bound tokens, suppression list, lead → unsubscribed, enrolments stopped | ✅ | tests |
| Inbound replies: IMAP / Gmail / Graph polling (`inbox.sync` every 2 min on the worker, or "Sync now"), thread matching by In-Reply-To / References / thread key / known contact, conversation creation, sequence stop on reply, idempotent on provider message id, own-message and stranger filtering | ✅ | tests |
| Delivery events: Resend (Svix signature), SendGrid (ECDSA signature), SES via SNS (certificate signature, subscription confirmation); delivered / bounced / complained / unsubscribed mapped to messages, suppression, contact email status | ✅ code; ⏳ live | `tests/unit/signatures.test.ts` verifies each scheme with generated keys |
| LinkedIn through Unipile only: hosted auth link (members link their own account), account sync, invitation + message + inbox adapters, warm-up caps 5/7/10/15/16/20 and 30/day ceiling, webhook registration with shared-secret header | ✅ code; ⏳ live | mock LinkedIn provider in tests; endpoint shapes from Unipile docs, not yet exercised live |
| X through the official API v2: OAuth 2.0 PKCE connect, handle resolution, DMs, follower check | ✅ code; ⏳ live | mock X provider in tests |
| Outbound webhooks: per-endpoint secrets shown once, `X-Arevei-Signature: t=,v1=` HMAC-SHA256, events catalogue, retries 1s/4s/60s… up to 10 attempts, auto-disable after 50 consecutive failures, delivery log, test event, secret rotation | ✅ | tests (local HTTP receiver verifies signature and backoff), browser smoke (`16-webhook-secret`) |
| Channel execution tracking: `message.sent` / `message.delivered` / `email.bounced` / `reply.received` / `unsubscribe` activity events with sender attribution; sender "sent today" counters | ✅ | tests |

**Not done / honest limits:** no live sends have been made (no provider keys in this environment); Gmail/Microsoft/X OAuth flows are implemented but unverified against the real consent screens; Unipile payload field names follow its public docs and need one live account to confirm; the worker's pg-boss scheduling for `inbox.sync-all` and `webhook.flush` is wired but was only exercised through the inline backend.

## Phase 6 — Inbox ✅

| Item | Status | Verification |
|---|---|---|
| Conversation storage and matching: one conversation per lead per channel, prior campaign messages attached to the thread, inbound replies matched by In-Reply-To / References / thread key / known contact | ✅ | `tests/integration/inbox.test.ts`, `channels.test.ts` |
| AI triage per reply: classification (interested, question, not now, not interested, out of office, wrong person, unsubscribe, bounce, other) with confidence, summary, sentiment, recommended action, proposed times and questions; stored on the inbound message with provider/model/prompt version | ✅ | tests (mock LLM; canned + overridden outputs) |
| Grounded reply drafts using company facts, research and thread history; signature appended; regeneration with reviewer guidance supersedes the previous draft | ✅ | tests |
| Hard outcomes without human input: unsubscribe → suppression + sequences stopped + archived; bounce → suppression; interested/question → lead qualified; not interested → lead status | ✅ | tests |
| Auto-send only when the workspace enabled it, confidence ≥ threshold (default 0.9) and the category is interested/question/not now; every auto-send audited and recorded as an `auto` decision | ✅ | tests (below/above threshold, unsubscribe never sends) |
| Unified inbox UI: filters (All, Unread, Awaiting response, Interested, Qualified, Meeting requested, Not interested, Snoozed, Archived) with counts, search, thread view, triage card, editable draft, Send / Regenerate, Interested / Not interested / Meeting booked / Send booking link / Start sequence / Snooze / Archive / Opt out, assignment, unread tracking, deep links from notifications | ✅ | browser smoke (`17-inbox`, `18-inbox-sent`) |
| Decisions recorded (`ReplyDecision`), meetings created, webhooks (`lead.status_changed`, `meeting.booked`, `message.sent`), manual task fallback when the channel has no connected sender | ✅ | tests |
| Dev-only `POST /inbox/simulate` to inject a reply from a known lead (disabled in production) | ✅ | browser smoke |

## Phase 7 — Analytics and hardening ✅

| Item | Status | Verification |
|---|---|---|
| Metric definitions with explicit numerators/denominators (`docs/analytics/metrics.md`); every ratio in the API carries `numerator`, `denominator`, `definition` | ✅ | `tests/integration/analytics.test.ts` |
| Analytics service over stored events: headline KPIs (contacted, reply rate, positive reply rate, meetings, bounce/unsubscribe rate, median time to reply, AI drafts sent unedited, auto-sent replies), funnel, reply classification mix, channel table, daily time series, campaign and sender tables, provider usage/cost | ✅ | tests, `GET /api/v1/w/{ws}/analytics` |
| Analytics page: date presets + campaign filter in one row, KPI tiles, 3-series line (validated categorical slots, legend, crosshair tooltip), single-hue funnel and classification bars, channel column chart, tables, table view toggle for every chart, light/dark palettes contrast-checked with the dataviz validator | ✅ | browser smoke (`19-analytics`) |
| Security tests at the route layer: unauthenticated / unknown bearer / revoked key → 401, cross-workspace key → 403, read-only key mutation → 403, session-only endpoints refuse keys, member role blocked from admin endpoints, CSRF origin check, no credential material in API payloads, webhook signature rejection, unsubscribe token rejection, rate limiting | ✅ | `tests/integration/security.test.ts` |
| Rate limiting per user/key/IP with per-route buckets for strict limits; structured pino logging with secret redaction; zod validation on every input | ✅ | tests |

## Phase 8 — Deployment ✅

| Item | Status | Verification |
|---|---|---|
| `README.md`: what it is, run locally in 5 commands, test, deploy | ✅ | — |
| `docs/architecture.md`, `docs/api.md`, `docs/database.md`, `docs/integrations.md`, `docs/security.md`, `docs/deployment.md`, `docs/analytics/metrics.md` | ✅ | — |
| Docker: multi-stage image (`web` standalone + `worker`), `docker-compose.yml` with Postgres + Mailpit, migrations on start, container health check | ✅ code; ⏳ not run here (no Docker on this machine) |
| Backups: `scripts/backup.sh` (pg_dump custom format, retention) and `scripts/restore.sh`; strategy in `docs/deployment.md` | ✅ | scripts are shell wrappers around pg_dump/pg_restore; exercised only by reading |
| Health endpoints: `/api/health` (liveness) and `/api/ready` (database round-trip) | ✅ | browser smoke uses `/api/health` |
| Final report with completed/pending features, schema, env vars, provider config, run/deploy, test results, limitations: `docs/FINAL_REPORT.md` | ✅ | — |

## Out of scope for v1 ❌

Hosted MCP server for third-party AI clients, partner/agency API, billing, Instagram, WhatsApp, CRM pipeline, AI search/AEO, physical gifts, Sales Navigator list import, InMail.
