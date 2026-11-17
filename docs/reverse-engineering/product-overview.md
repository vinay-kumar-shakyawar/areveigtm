# Product overview: PumpGTM (reference) and AREVEI GTM (target)

Investigation date: 2026-11-17. Investigator tooling: REA (rea-agents 6.9.0) CLI and MCP registration for Claude Code, headless Chrome via the Chrome DevTools Protocol, curl, and static analysis of public JavaScript bundles.

## 1. Scope and evidence boundary

What was inspected:

| Surface | Method | Evidence |
|---|---|---|
| Marketing site `pumpgtm.com` (home, pricing, docs, integrations, plays, signals, people, trust, blog, skills, privacy, terms) | Markdown mirror (`/markdown/pages/*.md`, `Accept: text/markdown`), `llms.txt`, sitemap, REA `inspect-web-page` (accessibility tree), REA `capture-web-screenshot` | `evidence/public-docs/pumpgtm-llms.txt`, `evidence/notes/pumpgtm-evidence-notes.md`, `evidence/rea/marketing-home-page-inspection.json` (REA evidence `ev_1002ebcc…`), `evidence/screenshots/*.png` |
| Public developer docs (`/docs`, `/docs/api`, `/docs/mcp`, `/docs/quickstart`, `/docs/signals-api`, `/docs/people-api`) | Markdown mirror | `evidence/public-docs/pumpgtm-docs-*.md`, `evidence/notes/pumpgtm-api-model-notes.md` |
| Public OpenAPI 3.1 spec (`/openapi.json`, 65 endpoints) and MCP server card (`/.well-known/mcp.json`, 70 tools) | Download and parse | `evidence/public-docs/pumpgtm-openapi.json`, `pumpgtm-openapi-condensed.md`, `pumpgtm-mcp-server-card.json` |
| Web app `app.pumpgtm.com` unauthenticated sign-in page and its public JavaScript chunks | REA `inspect-web-page` (CDP, evidence `ev_d3de5360…`), REA `analyze-web-bundle` (fetch endpoints), REA `analyze-javascript-application` (static routes, evidence `ev_cb9991ec…`), string extraction | `evidence/rea/app-onboarding-page-inspection.json`, `app-bundle-fetch-endpoints.json`, `app-bundle-static-routes.json`, `app-bundle-ui-strings.txt`, `app-response-headers.txt` |

What was not inspected, by design: any authenticated screen, any other user's data, any PumpGTM API call with credentials, CAPTCHA or bot protection. No PumpGTM account was created. The `/mcp/tools.json` live schema and `/mcp/platforms.md` returned 404 at capture time.

Labels used throughout the reverse-engineering docs: **OBSERVED** (directly in evidence), **INFERRED** (reasoned from evidence, source stated), **ASSUMPTION** (our design choice without direct evidence).

## 2. What PumpGTM is (OBSERVED)

PumpGTM, built by Giga Next Inc. (San Francisco, YC-backed), "finds relevant buyers and runs multichannel outreach from your own LinkedIn, X, and email accounts" [`pumpgtm-llms.txt`]. The pitch is a closed loop: find people showing intent, approve them, run a multi-step sequence from the customer's own accounts, freeze on reply, draft the answer, and measure results. The whole product is also exposed to AI agents through a hosted MCP server and a REST API that share one workspace key [`pumpgtm-docs-quickstart.md`].

Core vocabulary [`notes/pumpgtm-evidence-notes.md` §2, `notes/pumpgtm-api-model-notes.md` §1]:

| Term | Meaning in PumpGTM |
|---|---|
| Workspace | Tenant. One key = one workspace. Roles owner / admin / member. Teams group workspaces. |
| Play | A source of people plus a default sequence. Types: people-search targeting, lookalike accounts, named account list, competitor engagers, LinkedIn post engagers / profile watch, X followers / post likers / buying-intent signals, webhook or HubSpot signups, uploaded lists, founder directories. |
| Sequence | Ordered steps across LinkedIn, email, X (and Instagram); `linear`, `tracks` (parallel lanes) or `graph` (branching) execution; `draft → approved/active ↔ paused`, `archived`. |
| Lead | One person in the workspace, deduplicated on LinkedIn URL, email and X handle; runs one sequence at a time; bound to one sender account. |
| Candidate / review batch | People found by a Play, waiting for a human `good_fit` / `not_a_fit` decision before enrolment. |
| Reply / decision | Inbound message freezes the lead; AI drafts an answer; a human decides `send`, `invite`, `booking_link`, `snooze`, `start_sequence`, `meeting_booked`, `dismiss`, `opt_out`. |
| Signals | Company-level reasons to reach out now: hiring (`hiring.job_observed` is the only public signal type), investor-backed, plus X intent signals (competitor followers, post engagers, asks, complaints, Reddit). |
| Energy | Metered credit for paid actions (people found: 2, X DM: 5, enrichments priced per lookup; 1 Energy = $0.05). LinkedIn actions, email sends and replies cost no Energy. |

Pricing (OBSERVED, `evidence/screenshots/pumpgtm_com_pricing.png`, `pumpgtm-llms.txt`): 7-day trial with card, Starter $75/month per LinkedIn account (reach up to 1,000 people a month), Hypergrowth $149/month (10,000 people a month), Enterprise custom, plus done-for-you services from $1,740 one-time to $5,640/month.

## 3. Technical profile of the reference (OBSERVED unless noted)

| Aspect | Observation | Evidence |
|---|---|---|
| Marketing site | Next.js App Router on Vercel (`/_next/static/chunks/app/*`, `?dpl=` deployment ids) | `evidence/rea/marketing-home-page-inspection.json`, curl of `pumpgtm.com` |
| Web app | Next.js with Turbopack on Vercel (`x-powered-by: Next.js`, `server: Vercel`, `turbopack-*.js` chunk) | `evidence/rea/app-response-headers.txt`, `app-onboarding-page-inspection.json` |
| Auth and data | Supabase (CSP allows `*.supabase.co` and `wss://*.supabase.co`; media from Supabase storage); sign-in by password or emailed one-time code | `app-response-headers.txt`, `app-bundle-ui-strings.txt` ("Email me a sign-in code"), screenshot `app_pumpgtm_com_onboarding.png` |
| Billing | Stripe Checkout, Billing portal and Link | CSP `form-action` and `frame-src` |
| Product analytics | PostHog (localStorage keys `ph_phc_*`) | `app-onboarding-page-inspection.json` storage section |
| LinkedIn / Instagram connection | Unipile hosted auth iframes (`frame-src https://*.unipile.com`, internal endpoint `/api/unipile/custom-auth`) plus UI copy offering "Connect with a session cookie" and "Connect with your signed-in browser" | CSP, `app-bundle-fetch-endpoints.json`, `app-bundle-ui-strings.txt` |
| Email connection | Google OAuth, Microsoft 365 OAuth (admin consent copy), "Connect any mailbox" (IMAP/SMTP) | `app-bundle-ui-strings.txt` |
| X | Official X API with OAuth (`/api/integrations/x/authorize`) | `app-bundle-fetch-endpoints.json`, `markdown_pages_plays_x-automation.md` |
| Scheduling | Cal.com embed | CSP |
| Location autocomplete | Google Maps and photon.komoot.io | CSP |
| Internal cookie / key prefixes | `giga_eve_session_hint_v1`, keys `eve_mcp_…`, legacy `X-Eve-*` headers (internal codename "eve") | headers, docs |
| LinkedIn execution (INFERRED from marketing claims) | Dedicated server per account behind a residential proxy, slow warm-up, hard caps | `blog is-linkedin-automation-safe…` via `notes/pumpgtm-evidence-notes.md` §5 |

## 4. Product shape summary (OBSERVED / INFERRED)

Onboarding (INFERRED from bundle strings and fetch endpoints in `evidence/rea/app-bundle-*`): sign in → company website → AI-drafted company profile (`/api/onboarding/company-profile`) → setup answers (`setup-answer`, `setup-review`) → lead source choice (uploaded list, competitors' customers, competitors' engagers, company list, event contacts, network leads, "we build it") → lead sample → sequence proposal → "Approve messages" → connect LinkedIn / email / X → trial checkout → activation. Copy repeats one reassurance: "Nothing sends until you approve the messages."

App routes (OBSERVED in bundle, logged-in screens INFERRED): `/overview`, `/leads`, `/plays/new`, `/accounts/email`, `/connect/linkedin`, `/connect/email`, `/team`, `/billing`, `/mcp` and `/install-mcp`, `/signals` and `/signals/social-listening` (docs), `/x`, `/gifts/designs/new`, `/onboarding/*`. An inbox with a "Needs you" filter is described on the home page.

Developer surface (OBSERVED): 65 REST endpoints under `/api/v1` and `/api/partner/v1`, 70 MCP tools, 15 signed webhook events, idempotent writes via `requestId`, optimistic concurrency via `revision` / `expectedRevision`, cursor pagination, an append-only activity ledger with roughly 100 action names.

## 5. AREVEI GTM: what we are building

AREVEI GTM is an independent AI-powered GTM platform with functional parity on the core loop and clean-room implementation on our own stack and keys. It is not a clone of PumpGTM's UI, brand or infrastructure.

Kept (functional equivalents): workspace onboarding with AI company profile; ICP builder with structured criteria; provider-independent lead discovery with review-before-enrol; buying-signal model with real/inferred distinction; enrichment with field-level provenance; AI lead research and transparent scoring; campaign + sequence builder with multi-channel steps, approval states and revision safety; AI outreach drafting with anti-fabrication rules; email execution with our own mailboxes/providers; LinkedIn and X through authorized providers only; unified inbox with AI-drafted replies and human decisions; analytics with defined denominators; signed outbound webhooks; idempotent REST API.

Changed on purpose:

| PumpGTM behaviour | AREVEI decision | Reason |
|---|---|---|
| LinkedIn via session cookie / signed-in browser, residential proxies | Authorized provider adapters only (Unipile-style hosted auth, LinkedIn official APIs where available). Unsupported actions become **manual tasks** in the UI. | Instruction §MODULE I; platform terms. |
| Energy credit currency | Internal usage ledger per provider (units and estimated cost), with optional plan caps. No resale credit. | We bring our own keys; cost transparency matters more than a currency. |
| Supabase auth / Stripe billing | Own auth (email + password with Argon2, emailed one-time code, DB sessions). Billing out of scope for v1. | Fewer external dependencies; own infrastructure. |
| Hosted MCP server for third-party AI clients | Deferred to a later phase; REST API first. | Core product first. |
| AI search / AEO tools, CRM pipeline, gifts/cakes, partner API, Instagram, WhatsApp | Out of scope for v1 (documented, not built). | Not part of the stated objective. |
| Analytics in Pacific time | Workspace time zone, stored in `WorkspaceSettings`. | Multi-region customers. |

## 6. Unknowns carried forward

See `feature-inventory.md` and `api-observations.md` for the full lists. The most consequential: reply classification taxonomy is not published (we define our own: `interested`, `question`, `not_now`, `not_interested`, `out_of_office`, `wrong_person`, `unsubscribe`, `other`); exact company-profile and setup-answer JSON keys are not published (we define them in `src/modules/company/schemas.ts`); working-hours configuration is marketing-only (we model sending windows explicitly per sender account); the logged-in dashboard layout was never seen (our information architecture is an ASSUMPTION documented in `ui-analysis.md`).
