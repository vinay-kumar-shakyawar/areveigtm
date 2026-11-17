# Implementation roadmap: AREVEI GTM

Status tracking lives in `docs/IMPLEMENTATION_STATUS.md`. This roadmap maps the build brief's phases to concrete deliverables, acceptance checks and the evidence that informed each one.

## Phase 0 — Investigation (complete 2026-11-17)

Delivered: REA installed and registered for Claude Code (plan reviewed, applied, `rea doctor` healthy; `evidence/rea/rea-setup-dryrun-plan.json`, `rea-doctor.json`); PumpGTM public surfaces, developer docs, OpenAPI and MCP catalog captured; app sign-in page and public bundle analysed with REA; nine reverse-engineering documents; evidence folder.

Known limits: no authenticated screens; MCP tool input schemas not public (`/mcp/tools.json` 404); REA static analysis of the largest bundle chunk hit its 1 GiB heap budget (limitation recorded in `app-bundle-static-routes.json`), so route coverage is partial.

## Phase 1 — Foundation

| Deliverable | Acceptance check |
|---|---|
| Next.js 15 + TS strict + Tailwind v4 + shadcn/ui scaffold; Prisma schema from `database-design.md`; Docker Compose (postgres, redis, mailpit) | `pnpm typecheck`, `pnpm lint`, `prisma migrate dev` succeed; `docker compose up` boots |
| Auth: register, sign in (password or emailed code), verify email, sessions, password reset | Vitest integration tests for each flow; cookies HttpOnly/SameSite=Lax |
| Workspaces: create, switch, invite members, roles, settings (time zone, sending window) | Tenant-isolation test suite passes |
| UI system: app shell (sidebar, workspace switcher, global search, notifications, profile menu), tables, filters, drawers, modals, empty/loading/error primitives | Storybook-free: a `/dev/ui` gallery page renders every primitive |
| Dashboard with real counters (zero-state) | Counts come from DB queries, no dummy data |

## Phase 2 — AI and provider framework

| Deliverable | Acceptance check |
|---|---|
| Provider registry, descriptors, `ProviderUsage` ledger, `ProviderError` mapping | Unit tests with mock adapters |
| LLM adapters: Anthropic, OpenAI, Gemini, DeepSeek, OpenRouter, Bedrock; structured output helper | Mocked HTTP tests per adapter; live "Test connection" button works with a real key (manual) |
| Credential vault (AES-256-GCM, key versioning), Integrations settings UI (add key, test, enable/disable, set default, priority, usage) | Security tests: ciphertext never returned; audit rows written |
| People/company/signal/email/linkedin/x adapter interfaces + mock implementations | Interface contract tests run against every adapter |

## Phase 3 — Lead intelligence

| Deliverable | Acceptance check |
|---|---|
| Company profile onboarding: website fetch (Firecrawl/Exa or built-in fetcher) → AI draft → edit → approve | Draft stored separately until approved; evidence URLs kept |
| ICP builder: plain language → structured `IcpCriteriaV1` via LLM; CRUD, duplicate, activate | Zod schema tests; UI round-trip |
| Lead search: criteria → provider preview (count/cost where available) → run → review batch → decisions → import with dedup | Mock provider tests; dedup tests on LinkedIn/email/X keys; "no match" rendered honestly |
| Enrichment with provenance and fallback waterfall | Never overwrites verified fields (test) |
| Buying signal model + signal rules + provider adapters (hiring via people/company providers; AI inference flagged `isInferred`) | Observed vs inferred visibly separated in UI |
| Lead research + scoring (ICP fit, intent, quality) with explanations | Scores reproducible with `promptVersion`; explanation rendered |

## Phase 4 — Campaigns

| Deliverable | Acceptance check |
|---|---|
| Campaign CRUD (objective, ICP, audience, channels, schedule, limits, exclusions, approval mode) | API + UI tests |
| Sequence builder: step list editor (linear/tracks first; graph later), templates, revision + approval, "save as new sequence" when leads progressed | Revision conflict tests; approval invalidation on edit |
| AI message generation per step per lead (context assembly from profile, ICP, research, signals, history) with anti-fabrication prompt rules; regenerate/edit/approve | Generated messages validated against schema; approval required before send (test) |
| Scheduler + execution engine with stop rules, limits, windows, manual-task fallback | Dry-run mode sends nothing (mock email provider captures) |

## Phase 5 — Channel integrations

| Deliverable | Acceptance check |
|---|---|
| Email: Resend, SendGrid, SES, SMTP adapters; Google/Microsoft OAuth mailbox connect (IMAP/Graph inbound); domain SPF/DKIM/DMARC checks; unsubscribe link + List-Unsubscribe; bounce/complaint webhooks | Webhook signature tests; unsubscribe flow stops sequences |
| LinkedIn through authorized provider adapter (Unipile-style): connect, health, invites, messages, inbox sync, limits/warm-up; manual-task fallback | Mocked provider tests; live verification pending credentials |
| X API v2 adapter: OAuth connect, DM send, follower checks, pacing | Mocked tests; live verification pending |
| Channel execution tracking in `ActivityEvent` | Analytics derive from events |

## Phase 6 — Inbox and replies

| Deliverable | Acceptance check |
|---|---|
| Conversation storage, inbound matching, unified inbox UI with filters (All, Unread, Awaiting, Qualified, Interested, Not interested, Meeting requested, Archived), assignment | UI + API tests |
| Reply classification + AI draft + recommended next action; decisions enum; auto-send only with explicit workspace opt-in | Auto-send disabled by default (test) |

## Phase 7 — Analytics and hardening

| Deliverable | Acceptance check |
|---|---|
| Metric definitions doc; dashboard (prospects, qualified, enriched, campaigns, drafted/approved/sent, delivery rate, reply rate, positive reply rate, interested, qualified conversations, meetings; by channel/campaign/ICP/signal/source) with time-series charts | Every metric computed from `ActivityEvent`/`Message` with a documented denominator |
| Permission tests, security checks (headers, CSRF, rate limits, secret redaction), integration tests, logging | CI script `pnpm test` green |

## Phase 8 — Deployment

| Deliverable | Acceptance check |
|---|---|
| Dockerfile (web + worker), compose for prod-like run, `.env.example`, migrations on start, backup script (pg_dump cron), health checks, deployment docs | Fresh clone → `docker compose up` → app usable |

## Later (not in acceptance criteria)

Hosted MCP server exposing AREVEI tools to Claude/ChatGPT clients; partner API; billing; Instagram/WhatsApp; CRM pipeline; graph execution model UI; AI search/AEO.
