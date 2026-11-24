# AREVEI GTM — delivery report

Date: 2026-11-18. Scope: the MASTER BUILD PROMPT (Phases 0–8). Everything below was
built in this repository and verified with the test suites and the browser smoke
run described at the end. Claims about live third-party behaviour are marked
**unverified** where no real credentials were available.

## 1. What was built

### Completed

| Phase | Delivered |
|---|---|
| 0 Investigation | Nine evidence-backed documents in `docs/reverse-engineering/` (product overview, feature inventory, user flows, UI analysis, integrations, API observations, database design, technical architecture, roadmap) with screenshots, REA bundle analysis, public OpenAPI/MCP material. Only public surfaces were inspected. |
| 1 Foundation | Next.js 16 / React 19 / TypeScript strict / Tailwind / shadcn; Prisma + Postgres (48 models); auth (Argon2id, emailed codes, DB sessions), workspaces, invitations, roles, API keys, audit log, notifications, settings, dashboard with setup checklist, global search. |
| 2 AI & providers | Provider descriptors + registry with priority/fallback; LLM adapters (Anthropic, OpenAI, DeepSeek, OpenRouter, Gemini, Bedrock); data adapters (Apollo, PDL, Hunter, Snov, Exa, Firecrawl, built-in fetcher); encrypted credential vault; health checks; usage ledger; mock providers. |
| 3 Lead intelligence | Company profile from website with approval; ICP builder with AI extraction; people search with preview/estimate, review batches, dedupe and import; CSV import; enrichment waterfall with per-field provenance and verification; buying signals and rules; AI research with explained fit/intent/timing scores. |
| 4 Campaigns | Campaigns, revisioned sequences with approval, step kinds for email/LinkedIn/X/wait/manual, enrolment with suppression and concurrency rules, grounded AI message generation with reasoning and risks, review queue, scheduler with windows and limits, manual-task fallback. |
| 5 Channels | Email: Resend, SendGrid, SES, SMTP/IMAP, Gmail and Microsoft 365 OAuth; sending-accounts UI with test sends and SPF/DKIM/DMARC checks; unsubscribe page + one-click; inbound reply ingestion (webhooks and polling); bounce/complaint handling; LinkedIn via Unipile hosted auth only; X via official API; outbound signed webhooks with retries. |
| 6 Inbox | Unified inbox with filters, AI classification + confidence + summary + recommended action, grounded drafts, regeneration, decisions (send, edit, snooze, interested, not interested, meeting, booking link, start sequence, dismiss, opt out), assignment, opt-in high-confidence auto-send, manual-task fallback. |
| 7 Analytics & hardening | Metric definitions with denominators; analytics API and page (KPI tiles, validated-palette charts, tables, table views); route-level security tests; per-route rate-limit buckets. |
| 8 Deployment | README, architecture/API/database/integrations/security/deployment docs, Docker multi-stage image + compose, backup/restore scripts, health endpoints, this report. |

### Pending / not done

- **Live provider verification.** No real API keys, OAuth apps, Unipile DSN or X project existed in the build environment. Every adapter is implemented against public documentation and exercised through mocks; the first live call per provider should be made deliberately (test email, test connection) and may surface field-name differences, especially for Unipile payloads.
- **Docker build/run** was not executed here (no Docker). The Dockerfile and compose were written to match the Next standalone output and `package.json`.
- **pg-boss path** was wired but only the inline job backend ran in tests and the dev server.
- **Data retention job**, **bulk re-encryption on key rotation**, **shared rate-limit store**, MFA/SSO: not implemented.
- **A/B reporting per variant**, LinkedIn engagement steps (like/comment), InMail, Sales Navigator import, CRM sync, billing, MCP server, partner API, Instagram/WhatsApp: out of scope for v1 (documented in `docs/IMPLEMENTATION_STATUS.md`).

## 2. Architecture

See `docs/architecture.md`. In one paragraph: a Next.js app serves the UI and a REST API; services under `src/server/modules` own all business logic and are the only code touching Prisma; a provider registry abstracts every external capability behind descriptors with encrypted per-workspace credentials and fallback; a Postgres-backed job queue runs campaign ticks, inbox polling and webhook retries in a separate worker process; an append-only activity ledger feeds analytics and outbound webhooks.

## 3. Database schema

48 Prisma models in `prisma/schema.prisma`, grouped in `docs/database.md`: identity, tenancy, knowledge (company/ICP), leads (accounts, contacts, leads, searches, enrichment, signals, scores, research), campaigns (sequences, steps, enrolments, step runs, messages, tasks), inbox (conversations, decisions, meetings), channels (senders, mailboxes, integrations, credentials, usage), webhooks, compliance (suppression, unsubscribes), ledger (activity events, jobs). Three migrations.

## 4. Environment variables

Required: `DATABASE_URL`, `APP_BASE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET`. Transactional mail: `SYSTEM_EMAIL_PROVIDER`, `SYSTEM_EMAIL_FROM`, `SMTP_*` or provider key. Optional provider fallbacks: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `AWS_*`, `APOLLO_API_KEY`, `PEOPLE_DATA_LABS_API_KEY`, `HUNTER_API_KEY`, `SNOV_*`, `EXA_API_KEY`, `FIRECRAWL_API_KEY`, `RESEND_API_KEY`, `SENDGRID_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SENDGRID_WEBHOOK_PUBLIC_KEY`, `UNIPILE_DSN`, `UNIPILE_API_KEY`. OAuth apps: `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `MICROSOFT_OAUTH_CLIENT_ID/SECRET/TENANT`, `X_CLIENT_ID/SECRET`. Behaviour: `ALLOW_SYSTEM_PROVIDER_FALLBACK`, `JOBS_BACKEND`, `LOG_LEVEL`. All documented in `.env.example`.

## 5. Provider configuration

Per workspace under Integrations (encrypted, fingerprint shown, never returned). Multiple providers per category with priority and default; `Test` checks connectivity; usage and cost are recorded per call. Channel setup steps are in `docs/integrations.md`.

## 6. Run locally

```bash
cp .env.example .env   # set ENCRYPTION_KEY and JWT_SECRET
npm install
npm run dev:db         # embedded Postgres :54329
npx prisma migrate deploy
npm run dev            # http://localhost:3000
```

Use the Mock providers for an offline walkthrough; `POST /api/v1/w/{ws}/inbox/simulate` (development only) injects a reply from a lead to exercise the inbox.

## 7. Deploy

`docker compose up --build` (web + worker + Postgres + Mailpit) or `npm run build && npm start` plus `JOBS_BACKEND=pgboss npm run worker`. TLS in front; `APP_BASE_URL` must be the public https origin. Backups with `scripts/backup.sh`; details in `docs/deployment.md`.

## 8. Test results (2026-11-18)

| Suite | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` (vitest, embedded Postgres, mock providers, no network sends) | **15 files, 73 tests passed**: unit (vault, RBAC, webhook signatures, MIME parsing) and integration (auth, workspace, tenant isolation, providers, company/ICP, leads/discovery, intelligence, campaigns, channels, inbox, analytics, security) |
| `npm run e2e` (headless Chrome over CDP against `next dev`) | **All steps passed**: sign-up → workspace → mock providers → company profile → ICP → search/review/import → research → signals → campaign create/approve/activate/enrol/run → review and approve drafts → manual task → email sender + test send + domain check → webhook endpoint + signed test delivery → simulated reply → AI triage → send draft → analytics → API key + REST check → sign out. Screenshots in `.local/e2e/`. |

No live provider credits were spent and no real message was sent during the build.

## 9. Known limitations

1. Live integrations unverified (see Pending). Treat first production sends as a controlled test.
2. In-memory rate limiter and in-process job inline mode are single-instance by design; the worker + pg-boss path is for production.
3. Discovery/approved funnel stages are cohort counts (leads created in range) while later stages are event counts; stages can appear non-monotonic.
4. LinkedIn and X limits are enforced by the scheduler from stored daily counts; provider-side limits are not read back.
5. Email HTML is not rendered (plain text by design); bodies longer than channel limits are truncated.
6. Microsoft Graph and Gmail replies are polled rather than pushed; latency up to the two-minute sync interval.
7. The analytics time series buckets by UTC day, not the workspace time zone.
