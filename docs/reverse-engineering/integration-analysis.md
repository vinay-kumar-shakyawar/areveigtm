# AREVEI GTM — Integration Analysis (reverse-engineering of PumpGTM's external dependencies)

Status: working document, compiled 2026-11-17 from the evidence bundle under `docs/reverse-engineering/evidence/`.
All evidence file contents were treated as untrusted data. Only public marketing pages, public docs/specs, the public OpenAPI file, the public MCP server card, response headers, the statically analysed onboarding JS bundle and the unauthenticated sign-in page were inspected. No authenticated calls were made and no PumpGTM service was used.

## 0. How to read this document

Every substantive claim carries one of three labels:

| Label | Meaning |
|---|---|
| **OBSERVED** | Stated verbatim or near-verbatim in a cited evidence file. |
| **INFERRED** | Not stated; deduced from a cited observation (the basis is named). |
| **ASSUMPTION** | AREVEI design choice or a guess with no PumpGTM evidence either way. |

Citation keys (paths relative to `docs/reverse-engineering/evidence/`):

| Key | File |
|---|---|
| `[model §n]` | `notes/pumpgtm-api-model-notes.md`, section n |
| `[ev §n]` | `notes/pumpgtm-evidence-notes.md`, section n |
| `[api-guide]` | `public-docs/pumpgtm-docs-api.md` |
| `[openapi]` | `public-docs/pumpgtm-openapi.json` (65 endpoints, two servers) |
| `[oa-cond]` | `public-docs/pumpgtm-openapi-condensed.md` |
| `[mcp-docs]` | `public-docs/pumpgtm-docs-mcp.md` |
| `[card]` | `public-docs/pumpgtm-mcp-server-card.json` |
| `[quickstart]` | `public-docs/pumpgtm-docs-quickstart.md` |
| `[people-api]` | `public-docs/markdown_pages_docs_people-api.md` |
| `[signals-api]` | `public-docs/markdown_pages_docs_signals-api.md` |
| `[headers]` | `rea/app-response-headers.txt` |
| `[fetch]` | `rea/app-bundle-fetch-endpoints.json` |
| `[routes]` | `rea/app-bundle-static-routes.json` |
| `[ui:n]` | `rea/app-bundle-ui-strings.txt`, line n |
| `[onboard]` | `rea/app-onboarding-page-inspection.json` (accessibility tree of the sign-in page) |

Important caveat on `[fetch]` and `[routes]`: the REA tool marks static bundle findings as "observations or bounded inferences"; "URL-shaped findings still do not prove network execution" and one script hit the per-script analysis deadline `[fetch: limitations]`. Treat those endpoint names as OBSERVED-in-source, not OBSERVED-at-runtime.

## 1. Dependency map (summary)

| Category | What PumpGTM observably uses | Strongest evidence | AREVEI decision |
|---|---|---|---|
| Identity / auth | Supabase-hosted auth (CSP allows `*.supabase.co`), email + password or emailed one-time code, session hint cookie | `[headers]`, `[onboard]`, `[ui:388,408,1057]` | Own auth: Auth.js/Lucia-style DB sessions in Postgres |
| Database / realtime / storage | Supabase (`https://*.supabase.co`, `wss://*.supabase.co`, `media-src *.supabase.co`) | `[headers]` | Postgres (Prisma/Drizzle), own realtime via SSE/websocket, S3-compatible object storage |
| Billing / metering | Stripe (checkout, billing portal, Link, Klarna, Apple/Google Pay); "Energy" metered credit at $0.05 | `[headers]`, `[ui:121,951,1094]`, `[api-guide: Energy]`, `[people-api]` | Internal usage ledger first; Stripe adapter optional later |
| Analytics / telemetry | PostHog (reverse-proxied under `/ingest/`), Twitter ads pixel | `[headers]`, `[onboard]`, `[ui:1180]` | PostHog optional, behind a feature flag; no ad pixels |
| LinkedIn | Unipile-hosted auth frame (`frame-src *.unipile.com`), session-cookie / signed-in-browser / Cookie-Editor paths, residential proxy per account, warm-up, invite caps, InMail credits | `[headers]`, `[ui:287-292,712,1098]`, `[model §1.3, §10.2]`, `[ev §5]` | Authorized messaging-API adapter only (Unipile-style hosted OAuth/credential flow), no cookies, no proxies, no browser automation |
| Email | Gmail/Google Workspace OAuth, Microsoft 365 OAuth (admin consent), IMAP/SMTP app password, live send/read check, unsubscribe footer, plain-text workspace setting | `[ui:288,280,283,158,524,525,560,764]`, `[model §1.5, §3.8]`, `[ev §6]` | Google OAuth, Microsoft Graph OAuth, SMTP/IMAP, plus Resend/SES/SendGrid for transactional & webhooks |
| X | Official X API with OAuth ("Sending as you · official X API"), DMs, follower checks, ≤100 DMs/day/workspace | `[ev §7]`, `[model §5.3, §10.3]`, `[routes: /api/integrations/x/authorize]` | X API v2 OAuth 2.0 adapter |
| Instagram | Unipile custom auth (`/api/unipile/custom-auth/instagram`), `instagram_dm` step kind | `[routes]`, `[fetch]`, `[model §3.1]`, `[ui:294,911]` | Skip |
| WhatsApp | Beta, request-only via support email; `whatsapp_dm` activity action; "WhatsApp message" UI strings | `[ev §8]`, `[model §7.4]`, `[ui:875,1124,1125]` | Skip / placeholder channel enum only |
| Data providers | "lead waterfall (Apollo, Exa, PeopleDataLab, ZoomInfo, Sales Navigator)", email-provider waterfall, shared hiring index, people enrich endpoint | `[ev §4, §12]`, `[people-api]`, `[signals-api]` | Apollo, People Data Labs, Hunter, Exa, Firecrawl behind common provider interfaces |
| LLM providers | "prompts and responses may be transmitted to third-party AI providers based on your workspace configuration" | `[ev §12: privacy policy]` | Anthropic, OpenAI, Gemini, DeepSeek, OpenRouter, Bedrock adapters with structured output |
| Scheduling / booking | Cal.com embed (`app.cal.com` in script/connect/frame-src), `cal.com/namanyayg/gtm` enterprise CTA, `booking_link` reply decision | `[headers]`, `[ev §1]`, `[model §6]` | Booking-link text field per workspace/user; no embed |
| Outbound webhooks | ≤10 per workspace, 15 events, HMAC `t=,v1=` signature, retries at 1 s and 4 s | `[api-guide: Webhooks]`, `[model §8]` | Same pattern |
| MCP / agent surface | 70 tools, streamable-HTTP at `mcp.pumpgtm.com/mcp`, OAuth 2.1 (DCR + PKCE) or workspace key | `[card]`, `[mcp-docs: Connect]` | Later phase; design noted |
| n8n node | `n8n-nodes-pumpgtm` community node using the workspace key | `[api-guide: intro]` | Not in v1 |
| Partner API | `/api/partner/v1`, per-client workspaces, hosted connect links | `[openapi: servers]`, `[api-guide: Partners]` | Skip for v1 |
| Location autocomplete | Google Maps JS + `photon.komoot.io` | `[headers]` | Not needed for v1 (free-text country/city) |
| Hosting | Vercel + Next.js | `[headers: server, x-powered-by]` | Next.js on any Node host; not a product dependency |

## 2. Per-category analysis

Each section follows the same shape: (a) what PumpGTM observably uses, (b) how it is surfaced to the user, (c) rules/limits, (d) AREVEI's independent design.

### 2.1 Identity / authentication

**(a) Observed.**
- OBSERVED: The app CSP allows `connect-src https://*.supabase.co wss://*.supabase.co` and `media-src https://*.supabase.co` `[headers]`. INFERRED from that: Supabase is the auth/database backend (Supabase Auth, Postgres and Realtime share that host pattern). The evidence does not show which Supabase features are used.
- OBSERVED: The unauthenticated page `/onboarding` renders a region "Sign in to PumpGTM" with a "Work email" textbox, a password field with "Forgot password?", a button "Email me a sign-in code", an "or" separator and "Create account" `[onboard]`; copy says "Use your password or a one-time code." `[ui:1057]`, "Enter your sign-in code" `[ui:408]`, "We sent a one-time code to" `[ui:1099]`, "If this email is linked to an account, a sign-in code is on its way to" `[ui:557]`, "We'll email you a one-time code to choose a new password." `[ui:1109]`.
- OBSERVED: a fetch to `/api/auth/sign-in-code` exists in the bundle `[fetch: source_index 3]`.
- OBSERVED: a cookie `giga_eve_session_hint_v1` scoped to `.pumpgtm.com`, `Secure; SameSite=lax`, is cleared on the unauthenticated response `[headers]`. INFERRED: a non-sensitive "is there a session" hint for the marketing/app split domain; the real session lives elsewhere (Supabase JWT or server cookie; not observable).
- OBSERVED: roles exist — `GET /workspaces` returns `role` enum `owner | admin | member` `[model §0]`, and "Only workspace owners and admins can connect X." `[ui:718]`; `preview_workspace_setup` is "Only a workspace owner or admin's connection may use it" `[mcp-docs: preview_workspace_setup]`.
- OBSERVED: non-interactive credentials are a long-lived workspace key `eve_mcp_...` ("does not expire. Rotation is not self-serve yet") and OAuth 2.1 tokens (30-day access, 90-day refresh) `[mcp-docs: Connect]`.

**(b) Surfaced to the user.** Email + password, or an emailed one-time code; password reset via emailed code; "Create account" on the same page `[onboard]`. Workspace key copied from an "MCP" page in the left nav `[quickstart §1]`.

**(c) Rules/limits.** OBSERVED: anti-enumeration wording on code requests ("If the address is registered, a new code is on its way." `[ui:555]`). Nothing else observable.

**(d) AREVEI design.**
- ASSUMPTION: We do not use Supabase. We run our own auth with Auth.js (or Lucia-style primitives) backed by Postgres tables `users`, `sessions`, `verification_tokens`, `workspace_members(role)`. Sessions are opaque random IDs stored server-side (hashed) with sliding expiry; cookie `HttpOnly; Secure; SameSite=Lax`.
- Email + password (argon2id) and emailed 6-digit OTP (10-minute TTL, 5 attempts, rate-limited per email and IP). Same anti-enumeration copy pattern as observed.
- Roles: `owner | admin | member` (adopted from `[model §0]`). Channel connections and billing are owner/admin-only, mirroring `[ui:718]`.
- API keys: per-workspace keys with prefix `arv_ws_`, stored as SHA-256 hash, shown once, self-serve rotation from day one (PumpGTM's rotation is support-only, which we treat as a gap to improve on).

```ts
// packages/auth/src/types.ts
export type Role = "owner" | "admin" | "member";

export interface SessionStore {
  create(userId: string, meta: { ip?: string; ua?: string }): Promise<{ id: string; expiresAt: Date }>;
  get(id: string): Promise<{ userId: string; expiresAt: Date } | null>;
  touch(id: string): Promise<void>;          // sliding expiry
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface OtpService {
  issue(email: string, purpose: "sign_in" | "reset_password"): Promise<void>; // always 200, never reveals existence
  verify(email: string, code: string, purpose: "sign_in" | "reset_password"): Promise<{ userId: string } | null>;
}

export interface ApiKeyService {
  mint(workspaceId: string, label: string): Promise<{ id: string; secretOnce: string }>; // prefix arv_ws_
  resolve(bearer: string): Promise<{ workspaceId: string; keyId: string } | null>;
  rotate(keyId: string): Promise<{ secretOnce: string }>;
  revoke(keyId: string): Promise<void>;
}
```

### 2.2 Database, realtime and object storage

**(a) Observed.** OBSERVED: Supabase hosts in CSP for HTTPS, WebSocket and media `[headers]`. INFERRED: Postgres via Supabase, Supabase Realtime for live updates, Supabase Storage for media (`media-src` suggests video/audio such as the onboarding `pumpgtm-intro.mp4` or per-lead files). OBSERVED: per-lead file uploads use a one-time `uploadUrl` with `method: "PUT"` and `Content-Type: application/octet-stream`, tickets expire in 2 h, max 50,000,000 bytes `[model §3.7]`. INFERRED: a pre-signed object-store URL.

**(b) Surfaced.** Not directly. Upload tickets through REST/MCP `set_lead_input` `[model §3.7]`; "Nothing is compressed" `[mcp-docs: set_lead_input]`.

**(c) Rules/limits.** OBSERVED file limits: LinkedIn message ≤5 files and 15 MB total; email one file ≤18 MB (1.5 MB from Microsoft mailboxes); X DM image ≤5 MB, GIF ≤15 MB, MP4 ≤50 MB and 140 s `[model §3.7]`, `[ui:1336]`.

**(d) AREVEI design.**
- ASSUMPTION: Postgres 16 with Drizzle (or Prisma); row-level tenancy enforced in the application layer by always scoping queries on `workspace_id`, plus a Postgres RLS policy as defence in depth.
- Realtime: server-sent events from our own API (`GET /api/v1/events/stream`) backed by Postgres `LISTEN/NOTIFY` or a Redis stream; no third-party realtime service.
- Object storage: S3-compatible adapter (AWS S3, Cloudflare R2, MinIO locally) with pre-signed PUT uploads that mirror the observed ticket shape (`uploadUrl`, `method`, `headers`, `expiresAt`, `maxBytes`).

```ts
// packages/storage/src/types.ts
export interface ObjectStorageAdapter {
  presignUpload(input: {
    workspaceId: string; key: string; contentType: string; maxBytes: number; ttlSeconds: number;
  }): Promise<{ uploadUrl: string; method: "PUT"; headers: Record<string, string>; expiresAt: string }>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  presignDownload(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
```

### 2.3 Billing and metering

**(a) Observed.**
- OBSERVED: Stripe is in every CSP directive that matters: `js.stripe.com`, `checkout.stripe.com`, `api.stripe.com`, `hooks.stripe.com`, `link.com`; `form-action` allows `checkout.stripe.com`, `billing.stripe.com`, `invoice.stripe.com`; `permissions-policy: payment=(self "https://checkout.stripe.com" "https://js.stripe.com")` `[headers]`. Bundle warns about `@stripe/stripe-js@` version `[ui:60,92]`.
- OBSERVED internal endpoints `/api/billing/checkout`, `/api/billing/checkout/failure`, `/api/billing/setup`, `/api/billing/resume`, `/api/billing/exit-offer` `[fetch]`, `[routes]`.
- OBSERVED copy: "Add a card to continue. Stripe shows the exact recurring price and billing interval before you confirm, and billing begins after the trial unless you cancel." `[ui:121]`; "We place a temporary $1 card hold and release it immediately." `[ui:1094]`; "Stripe shows the methods eligible for your location and device, including cards, Link, Apple Pay, Google Pay, and options such as Klarna where supported." `[ui:951]`; "Execution resumes only after PumpGTM receives verified Stripe state. A checkout redirect alone never restarts outreach." `[ui:439]`.
- OBSERVED Energy: 1 Energy = $0.05 (`centsPerEnergy` on `GET /energy`); plans include 1,500 (Starter) or 4,000 (Hypergrowth) per seat per month; packs "$10 for 75" (MCP docs) vs "$10 for 100" (REST guide) — the two sources disagree `[model §10.4]`; `set_auto_top_up` authorises recurring card charges when balance < 50 `[card: set_auto_top_up]`, `[model §10.4]`; `GET /energy` returns `{ enabled, used, remaining, periodStart, costs, centsPerEnergy }` `[oa-cond: GET /energy]`; 402 `energy_exhausted` refuses paid actions and "nothing runs" `[api-guide: Energy]`.
- OBSERVED reserve-then-settle: "Each paid provider lookup reserves Energy before it runs, then settles against the provider cost recorded in the rate book. People-data lookups are priced at twice that cost, rounded up to the next 0.1 Energy" `[people-api]`.
- OBSERVED: "LinkedIn actions, email sends, sequences, replies and webhooks cost no Energy." `[api-guide: Energy]`
- OBSERVED pricing: Starter "$75 /month per LinkedIn account", 7-day trial with card `[ev §1]`.

**(b) Surfaced.** Stripe Checkout redirect during onboarding; billing page with Energy balance (`/billing#energy`); "Top up Energy" `[ui:1025]`; "Buy domain & inboxes" button `[ui:199]` (INFERRED: an inbox/domain purchase upsell, vendor not identifiable; "Sending inboxes and domains are not included in the service fee." `[ev §1]`).

**(c) Rules/limits.** Energy cost table in `api-observations.md §7`. Partners: 50 free leads then 403 `billing_required`; `monthlyLeadCap` → 403 `user_lead_cap_reached` `[model §10.4]`.

**(d) AREVEI design.**
- ASSUMPTION: v1 ships an internal **usage ledger**, not Stripe. Every metered action writes an immutable `usage_events` row (`workspace_id, kind, units, unit_cost_cents, provider, provider_cost_cents, reservation_id, status: reserved|settled|released, request_id`). A `workspace_balances` table holds allowance, used and remaining per period. The reserve → settle/release pattern is adopted from `[people-api]` because it is the only safe way to bill third-party lookups whose cost is known late.
- Credits are called "credits" (not "Energy"). 1 credit = $0.05 internally for parity in planning; price list is a config table, not code.
- Refusal semantics adopted: a paid action that would exceed balance returns 402 `credits_exhausted` and performs nothing.
- Stripe adapter is optional and later: Checkout for subscriptions/packs, webhook `checkout.session.completed` → ledger top-up. We adopt the observed rule that "a checkout redirect alone never restarts" anything; only the verified webhook does `[ui:439]`.

```ts
// packages/billing/src/types.ts
export interface UsageLedger {
  reserve(i: { workspaceId: string; kind: string; units: number; requestId?: string }): Promise<{ reservationId: string } | { error: "credits_exhausted"; needed: number; remaining: number }>;
  settle(reservationId: string, actual: { units: number; providerCostCents?: number }): Promise<void>;
  release(reservationId: string): Promise<void>;
  balance(workspaceId: string): Promise<{ enabled: boolean; allowance: number; used: number; remaining: number; periodStart: string; centsPerCredit: number; costs: Record<string, number> }>;
}

export interface PaymentProviderAdapter {               // optional, Stripe first
  readonly id: "stripe";
  createCheckout(i: { workspaceId: string; sku: string; successUrl: string; cancelUrl: string }): Promise<{ url: string }>;
  verifyWebhook(rawBody: Buffer, signatureHeader: string): Promise<{ type: string; data: unknown } | null>;
  portalUrl(workspaceId: string): Promise<string>;
}
```

### 2.4 Analytics / telemetry

**(a) Observed.** OBSERVED: CSP allows `us.i.posthog.com`, `us-assets.i.posthog.com`, `*.posthog.com` (HTTPS and WSS) `[headers]`; the sign-in page loads `https://app.pumpgtm.com/ingest/static/1.438.13/posthog-recorder.js` `[onboard]` — INFERRED: PostHog with session recording, reverse-proxied under `/ingest/`. Bundle strings "You have already initialized PostHog!", feature-flag overrides and "Remote config unavailable. Not loading surveys." `[ui:1180,10-11,820]` — INFERRED: PostHog feature flags and surveys are used. OBSERVED: `static.ads-twitter.com` and `analytics.twitter.com` in CSP `[headers]` — INFERRED: X/Twitter ads conversion pixel. Attribution cookies `giga_attribution`, `giga_attribution_history` carrying UTM data `[headers]`.

**(b) Surfaced.** Not surfaced; privacy policy mentions a US-default visitor identification pixel with a "Privacy choices" control `[ev §12]`.

**(d) AREVEI design.** ASSUMPTION: product analytics are optional. A `TelemetryAdapter` with a `noop` default and a PostHog implementation behind `TELEMETRY_PROVIDER=posthog`; no session recording by default; no ad pixels; no third-party visitor identification. First-party UTM capture is kept as a simple cookie → `workspace.attribution` JSON on signup.

```ts
export interface TelemetryAdapter {
  identify(userId: string, traits: Record<string, string | number | boolean>): void;
  track(event: string, props?: Record<string, unknown>, ctx?: { userId?: string; workspaceId?: string }): void;
  flag(key: string, ctx: { userId?: string; workspaceId?: string }): Promise<boolean | string | undefined>;
  shutdown(): Promise<void>;
}
```

### 2.5 LinkedIn

**(a) Observed.**
- OBSERVED: `frame-src https://*.unipile.com` in the app CSP `[headers]`; internal endpoints `/api/unipile/custom-auth` and `/api/unipile/custom-auth/instagram` `[routes]`. INFERRED: Unipile (a multi-channel messaging API vendor) is the "LinkedIn connection provider" named in PumpGTM's own blog ("a secure login page run by our LinkedIn connection provider" `[ev §5]`), embedded as a hosted-auth iframe, plus a "custom auth" server-side path.
- OBSERVED connection paths in UI copy: "Connect with the LinkedIn session you already use" `[ui:291]`, "Connect with a session cookie" `[ui:289]`, "Connect with Cookie-Editor instead" `[ui:287]`, "Connect with your signed-in browser instead" `[ui:292]`, "Paste session cookie" `[ui:745]`, "Only LinkedIn session cookie li_at and optional premium cookie li_a are forwarded. The full export is never sent or saved." `[ui:712]`, Chrome Web Store instructions for the Cookie-Editor extension `[ui:972-977,693]`, "LinkedIn didn't accept that email and password." `[ui:625]`, "Sign in to the same account you are reconnecting. For Sales Navigator access, use the Sales Navigator tab." `[ui:912]`, "If you sign in to LinkedIn with Google or Apple, you may not have a LinkedIn password." `[ui:559]`. INFERRED: three credential-capture paths exist — email/password through the provider, pasted `li_at`/`li_a` cookies, and a browser-assisted session capture.
- OBSERVED: "We send from your account through a residential proxy near you, only during working hours, with a warm-up ramp and daily caps, and every action is spaced at irregular intervals." `[ui:1098]`; `proxyCountry` on `GET /linkedin/accounts` ("last recorded two-letter proxy country") `[api-guide: LinkedIn senders]`; marketing: "simulate mouse movements and clicks" `[ev §5]`. INFERRED: browser-session automation over a residential proxy, not an official LinkedIn API.
- OBSERVED limits: daily invite cap 1–30 (default 30), six-day warm-up ramp 5/7/10/15/16/20 (73 total), `effectiveDailyCapToday = min(ramp, cap)`, `mode warmup|outreach`, 409 `warmup_in_progress` unless `acknowledgeEarlyGraduation`, ≤100 profile views/day, ≤100 messages/likes/other actions/day shared, hours 8am–6pm account time zone, 5–30 s random waits, invite decline → holds with retries at 24/48/72 h (`linkedin.limited attempt 1..3`), no connection notes by default `[model §10.2]`, `[ev §5]`.
- OBSERVED InMail: `GET /linkedin/accounts/{accountId}/inmail-credits` → `credits { premium, recruiter, salesNavigator }` (null = no balance supplied, never zero); `inmailEnabled` workspace flag; 429 with `Retry-After`; 502 `inmail_credits_unavailable` `[api-guide: LinkedIn senders]`, `[model §1.3]`. "Requires LinkedIn InMail access and available credits." `[ui:827]`; InMail "uses a graph and needs a subject and messageTmpl, with no connection request" `[api-guide: Sequences]`.
- OBSERVED step kinds on LinkedIn: `connect`, `message`, `engage` (`follow`, `unfollow`, `view_profile`, `like_last_post`, `endorse_first_skill`, `comment_last_post` — every comment waits for approval) `[model §3.1]`; thread read `GET /leads/{id}/thread` (cursor expires 30 min) `[model §10.1]`.
- OBSERVED Sales Navigator list import (`sales_navigator` method, `GET /leads/imports/{batchId}` state machine `processing → waiting → finalizing → completed|failed`) `[model §2.8]`; "Export from the Sales Navigator tab where you are signed in so that session is included." `[ui:5]`.

**(b) Surfaced.** An "Accounts" page with LinkedIn/email senders; connection panel showing "LinkedIn connected · Sending as you · Residential IP · San Francisco", warm-up chart and "Requests sent 30 / day" `[ev §13]`; "Warm-up data unavailable" state `[ui:1073]`; "All LinkedIn accounts included in your plan are connected. Disconnect one, or contact us to add accounts to your plan." `[ui:145]`.

**(c) Rules.** See (a). Also "Do not run two automation tools on one account" and a restriction playbook (pause, lower cap, restart warm-up) `[ev §5, §12]`.

**(d) AREVEI design — explicitly different.**
- We will **not** replicate: session-cookie (`li_at`/`li_a`) capture, Cookie-Editor instructions, "signed-in browser" capture, email/password relay to LinkedIn, residential or "undetectable" proxies, simulated mouse movement, or any browser-session automation of linkedin.com. These are unauthorized under LinkedIn's terms and carry account-restriction risk for users.
- Authorized alternative: a `LinkedInProvider` adapter whose only concrete v1 implementation targets an authorized multi-channel messaging API vendor's hosted-auth flow (Unipile-style hosted auth link, or an equivalent vendor), where the vendor — not AREVEI — holds the LinkedIn session and exposes documented REST endpoints for profile lookup, invitations, messaging, thread reads and account status webhooks. AREVEI stores only the vendor `accountId` and the vendor API key (workspace-scoped, encrypted). If no vendor is configured, the LinkedIn channel is disabled and the UI says so.
- Pacing is still ours: we keep a per-sender `daily_invite_cap` (1–30, default 20 — ASSUMPTION, more conservative than the observed 30), a warm-up ramp table (copying the observed 5/7/10/15/16/20 shape as a default, configurable), working-hours windows per sender time zone, jittered scheduling, and a hold-with-backoff on provider rate-limit errors (24/48/72 h, three attempts, then `disconnected_needs_attention`). None of this touches LinkedIn directly; the vendor's API is the only writer.
- InMail: exposed as `inmail_credits()` on the adapter; null-propagating (never assume zero), mirroring `[api-guide]`.
- Sales Navigator list import: not in v1; CSV import only.

```ts
// packages/channels/linkedin/src/provider.ts
export interface LinkedInProvider {
  readonly vendor: "unipile" | "other";
  startHostedConnect(i: { workspaceId: string; senderLabel: string; returnUrl: string }): Promise<{ url: string; linkId: string; expiresAt: string }>;
  pollConnect(linkId: string): Promise<{ status: "pending" | "connected" | "expired" | "revoked"; accountId?: string }>;
  accountStatus(accountId: string): Promise<{ status: "connected" | "disconnected" | "needs_reauth"; displayName: string; timezone?: string }>;
  resolveProfile(accountId: string, linkedinUrl: string): Promise<{ providerId: string; firstDegree: boolean; headline?: string } | null>;
  sendInvitation(accountId: string, providerId: string, note?: string): Promise<{ externalId: string }>;
  sendMessage(accountId: string, providerId: string, text: string, attachments?: { key: string }[]): Promise<{ externalId: string }>;
  readThread(accountId: string, providerId: string, cursor?: string): Promise<{ messages: ThreadMessage[]; nextCursor: string | null }>;
  inmailCredits(accountId: string): Promise<{ premium: number | null; recruiter: number | null; salesNavigator: number | null; checkedAt: string }>;
  disconnect(accountId: string): Promise<void>;
  parseWebhook(raw: Buffer, headers: Record<string, string>): Promise<ChannelEvent[]>; // message.received, account.disconnected, invitation.accepted
}
```

### 2.6 Email

**(a) Observed.**
- OBSERVED connection methods: "Connect with Google" `[ui:288]` with "Allow PumpGTM in Google Workspace" admin steps `[ui:147,558,1186,1187]` and a "Google Workspace setup prompt" that drives an AI assistant through admin settings `[ui:518,1184]`; "Connect a Microsoft mailbox" / "Sign in with Microsoft" `[ui:280,913]` with "Need admin approval" help and "Microsoft's admin instructions" `[ui:649,650,654,991]`; "Connect any mailbox" `[ui:283]` with "IMAP and SMTP" `[ui:551]`, "App password" / "An app password if your provider offers one, otherwise the mailbox password." `[ui:158,154]`, "Open App passwords", "Open 2-Step Verification" `[ui:720,719]`.
- OBSERVED live check: "PumpGTM checks it can send and read replies before saving anything." `[ev §6]`; failure copy "Google signed you in, but Gmail refused reading replies. Your Workspace admin may have turned off IMAP for this mailbox." and "...Gmail refused sending. Your Workspace admin may have turned off SMTP for this mailbox." `[ui:524,525]`. INFERRED: even with Google OAuth, PumpGTM uses IMAP (XOAUTH2) for reading and SMTP for sending rather than the Gmail REST API. OBSERVED: "Microsoft signed you in, but that account has no Outlook mailbox PumpGTM can use." `[ui:653]`; "Accept every permission on Microsoft's screen so PumpGTM can send and see replies." `[ui:116]`.
- OBSERVED internal endpoints `/api/onboarding/email-sender`, `/api/email/mailboxes`, app route `/accounts/email` `[fetch]`, `[routes]`.
- OBSERVED sending rules: "Every email is plain text from your address, replies come back to you, follow-ups stay in one thread, and each message carries a one-click unsubscribe. Daily mailbox limits control the sending pace." `[ev §6]`; `unsubscribeFooter` off by default; List-Unsubscribe headers sent unless workspace `plainTextEmail` is on, which "removes headers, HTML formatting and tracking" `[model §3.8]`; UI "Plain-text email · workspace setting" `[ui:764]` and the footer text "If you'd rather not hear from me again, unsubscribe here:" `[ui:560]`; sending window "Mon to Fri · 8:00 AM to 6:00 PM · America/Los_Angeles", per-mailbox "38 / 40 today" `[ev §6]`; legacy campaigns `dailyLimit` 1–5000 `[model §1.5]`.
- OBSERVED detection: activity actions include `email_sent`, `email_replied`, `email_auto_reply`, `email_bounced`, `email_unsubscribed`, `email_click`, `email_found`, `email_skipped` `[model §7.4]`. INFERRED: bounce and auto-reply detection exist; mechanism (IMAP polling vs provider push) is not documented `[ev §14]`.
- OBSERVED: missing email → "PumpGTM skips the email steps for that lead" `[ev §6]`; email file limit 18 MB, 1.5 MB from Microsoft mailboxes `[ui:1336]`.
- OBSERVED: "Buy domain & inboxes" `[ui:199]` — vendor unknown.

**(b) Surfaced.** Accounts page → "Connect email" / "Connect mailbox" with three cards (Gmail/Google Workspace, Microsoft, Any provider) `[ui:284-285,512,142]`; per-sequence `sequence_email_settings` (inboxes, schedule, daily limit, footer) `[model §1.5]`.

**(c) Rules/limits.** Per-mailbox daily limits and windows; one thread per prospect; unsubscribe link or List-Unsubscribe headers; reply stops the person's sequence across channels `[ev §6]`.

**(d) AREVEI design.**
- Three mailbox adapters behind one `MailboxProvider` interface: `google` (OAuth 2.0 with `gmail.send` + `gmail.readonly` scopes using the Gmail REST API — ASSUMPTION: REST instead of IMAP/SMTP so Workspace admins who disable IMAP/SMTP are not a blocker), `microsoft` (Microsoft Graph OAuth 2.0 with `Mail.Send` + `Mail.Read`, admin-consent URL surfaced when AADSTS65001-style errors occur), and `smtp_imap` (app password; SMTP for send, IMAP IDLE/poll for read).
- Transactional and optional high-volume outbound: `TransactionalEmailProvider` with `resend`, `ses`, `sendgrid` implementations and signed inbound webhooks for `delivered`, `bounced`, `complained`. Used for AREVEI system mail (OTP, invites, alerts); may optionally be used as an outbound channel for workspaces that prefer a dedicated sending domain.
- Live check adopted: after connect, send a self-addressed probe, then read it back; store `health: ok | send_failed | read_failed` with the provider error text, mirroring the observed failure copy.
- Compliance defaults adopted and tightened: `List-Unsubscribe` + `List-Unsubscribe-Post` headers always on; visible footer default **on** (PumpGTM defaults it off); plain-text mode per workspace; per-mailbox daily cap default 30 (ASSUMPTION), window per mailbox time zone; thread follow-ups via `In-Reply-To`/`References`.
- Bounce/reply detection: provider-specific (Gmail history API, Graph delta queries, IMAP UID polling) normalised into `ChannelEvent` kinds `email.replied`, `email.bounced`, `email.auto_reply`, `email.unsubscribed`.

```ts
// packages/channels/email/src/provider.ts
export interface MailboxProvider {
  readonly kind: "google" | "microsoft" | "smtp_imap";
  beginConnect(i: { workspaceId: string; returnUrl: string }): Promise<{ url: string } | { form: "smtp_imap" }>;
  completeConnect(i: { workspaceId: string; code?: string; smtp?: SmtpImapCreds }): Promise<{ mailboxId: string; address: string }>;
  healthCheck(mailboxId: string): Promise<{ send: "ok" | "failed"; read: "ok" | "failed"; detail?: string }>;
  send(mailboxId: string, m: { to: string; subject?: string; text: string; html?: string; inReplyTo?: string; headers?: Record<string, string>; attachment?: { key: string } }): Promise<{ messageId: string; threadId?: string }>;
  pollInbound(mailboxId: string, cursor?: string): Promise<{ events: ChannelEvent[]; nextCursor: string }>;
  revoke(mailboxId: string): Promise<void>;
}

export interface TransactionalEmailProvider {
  readonly id: "resend" | "ses" | "sendgrid";
  send(m: { from: string; to: string; subject: string; text: string; html?: string; headers?: Record<string, string> }): Promise<{ providerMessageId: string }>;
  parseWebhook(raw: Buffer, headers: Record<string, string>): Promise<Array<{ providerMessageId: string; type: "delivered" | "bounced" | "complained" | "opened" }>>;
}
```

### 2.7 X (Twitter)

**(a) Observed.** OBSERVED: "You click Connect X and X itself asks you to allow PumpGTM to read your posts, likes and followers and send DMs as you... You can revoke it from your X settings at any time."; panel "Sending as you · official X API" `[ev §7]`; app route `/api/integrations/x/authorize` `[routes]`; "Only workspace owners and admins can connect X." `[ui:718]`. INFERRED: X API v2 with OAuth 2.0 user context (scopes along the lines of `tweet.read users.read follows.read like.read dm.read dm.write`).
- OBSERVED capabilities over REST: `GET /x/accounts` (numeric `userId` string + handle), `POST /x/users/resolve`, `POST /x/eligibility` (follower check, ≤100 leads, `followsAccount true|false|null`), `POST /leads/enrich` (email/LinkedIn → X identity, ≤20), `POST /x/actions` (`follow|like|repost`; MCP `x_account` adds `unfollow`), `GET /x/readiness`, `POST /x/watches` (`followers|every_post|post`), X lead stop `[model §1.4, §5]`.
- OBSERVED pacing: "A few DMs every few minutes with a random gap, never more than 100 a day per workspace."; thread check skips anyone previously spoken to; "Accounts with an empty bio or under 20 followers are skipped"; DMs-closed accounts marked and left alone; up to five DMs per sequence, follow-ups 1–30 days apart `[ev §7]`, `[model §5.3]`.
- OBSERVED contradiction: marketing says "It does not post, like, reply, follow or unfollow on your behalf" while REST `POST /x/actions`, the `x_engage` step kind (`follow`/`unfollow`) and `x_account` exist `[ev §7]`, `[model §3.1]`. INFERRED: the product does expose follow/like/repost actions, but each is user-initiated or part of an approved sequence, and marketing refers to the absence of mass auto-follow.
- OBSERVED Energy: DM with history check 5; DM without / X reply 0.6; follow/unfollow/like/repost 1; liker/follower collected 1 `[model §10.4]`; `x_chat_passcode_required` for encrypted X Chat `[model §6]`.

**(b) Surfaced.** `/x` page with "Connect X", activity list, per-post likers/repliers, new-follower welcome `[ev §13]`.

**(d) AREVEI design.** `XProvider` on X API v2 with OAuth 2.0 PKCE (user context), refresh tokens stored encrypted per workspace. v1 scope: resolve handle → id, followers check (`GET /2/users/:id/following` paged with a bounded snapshot, returning `true | false | null` as observed), DM send (`POST /2/dm_conversations/with/:participant_id/messages`), DM events read for reply detection, and recent-post engagement reads (likers, repliers) for "post engagers" plays. Rate control: workspace-level token bucket at ≤100 DMs/day (adopted), jittered dispatch, honour X 429 headers. No follow/like/repost automation in v1 at all (we go further than PumpGTM here); the adapter interface reserves `engage()` but the v1 implementation throws `not_supported`.

```ts
// packages/channels/x/src/provider.ts
export interface XProvider {
  authorizeUrl(i: { workspaceId: string; state: string; codeChallenge: string; returnUrl: string }): string;
  exchangeCode(i: { code: string; codeVerifier: string }): Promise<{ accountId: string; userId: string; handle: string; expiresAt: string }>;
  refresh(accountId: string): Promise<void>;
  resolveUser(accountId: string, username: string): Promise<{ userId: string; username: string; name: string; followers: number; bio: string } | null>;
  followsAccount(accountId: string, targetUserId: string): Promise<{ follows: boolean | null; checkedAt: string; evidence: string }>;
  sendDm(accountId: string, targetUserId: string, text: string, media?: { key: string }): Promise<{ externalId: string }>;
  pollDmEvents(accountId: string, cursor?: string): Promise<{ events: ChannelEvent[]; nextCursor: string }>;
  postEngagers(accountId: string, postId: string, kinds: Array<"liked" | "replied">): Promise<Array<{ userId: string; username: string; kind: string }>>;
  engage(accountId: string, action: "follow" | "unfollow" | "like" | "repost", target: string): Promise<never>; // v1: throws not_supported
}
```

### 2.8 Instagram

OBSERVED: `/api/unipile/custom-auth/instagram` `[routes]`, "Connect your Instagram" / "Sign in to connect the Instagram account you want to use." `[ui:294,911]`, step kind `instagram_dm` which "run[s] only in their own linear sequence" `[model §3.1]`, activity actions `instagram_dm`, `instagram_comment`, `instagram_unlock` `[model §7.4]`, analytics channel enum includes `instagram` `[model §7.1]`. INFERRED: Instagram DMs run through the same vendor's credential-based custom auth (username/password relayed), not an official Meta API.
AREVEI: **skip**. Channel enum reserves `instagram` for forward compatibility; no adapter, no UI.

### 2.9 WhatsApp

OBSERVED: "WhatsApp is joining PumpGTM in beta. Request access" by email; "built around connecting your existing WhatsApp account"; "not generally available for self-serve connection or sending" `[ev §8]`; UI strings "WhatsApp message", "WhatsApp follow-up", "Send a WhatsApp message or follow-up" `[ui:1124,1125,875]`; activity action `whatsapp_dm`; analytics channel `whatsapp` `[model §7.1, §7.4]`. INFERRED: personal/Business-app account linking through the messaging vendor, not the WhatsApp Business Platform (Cloud API).
AREVEI: **skip / placeholder**. Channel enum reserves `whatsapp`; if ever added, only via the official WhatsApp Business Platform with opt-in templates.

### 2.10 Data providers (people, companies, signals, enrichment)

**(a) Observed.**
- OBSERVED: ICP skill text: "lead waterfall (Apollo, Exa, PeopleDataLab, ZoomInfo, Sales Navigator), checks the profiles are active, and lets you approve"; "2B+ contact data"; "The first release uses our existing profile lookup and email-provider waterfall." `[ev §4, §12]`. INFERRED: multiple commercial data vendors queried in sequence, with LinkedIn-derived verification ("linkedinVerified", "recentActivityAt" on candidates `[model §1.12]`).
- OBSERVED `POST /people/enrich` contract: exactly one of `email` or `linkedin`; `find: ["x","work_email"]`; output `person { name, title, headline, location, company{name,domain}, linkedin, x{handle,url,evidence}, workEmail{address,matchesCompanyDomain}, connections[] }`, `missing{field: not_found|energy_exhausted|unavailable}`, `energyUsed`; "not idempotent"; "Responses are private and are not cached by the API." `[people-api]`. MCP adds `find_work_email`, `find_phone_number` (~10 Energy when found), `search_known_people` (≤20 matches from "permitted shared professional evidence"), `get_lead_profile` `[card]`, `[model §10.4]`.
- OBSERVED targeting schema (`hardFilters`): titles, functions enum (12 values), seniorities enum (10 values), countries, company names/domains/LinkedIn URLs/industries/types/investors/hiring roles, headcount min/max, hiring recency; MCP-only `searchMethod auto|connected_account|professional_database` and fundraising fields `[model §4.1]`. OBSERVED: `candidateCount` 5–100; 2 Energy per person found; "a company where nobody matches costs nothing" `[model §4.2]`.
- OBSERVED Signals API: catalog `GET /signals`; only `hiring.job_observed` available; `POST /signals/events` with `roles` (≤10, all-words-in-title match, "No semantic or acronym expansion"), `companyDomains` (≤20), headcount bounds, `start recent|now`, signed workspace-bound cursor expiring in 7 days (410), `nextPollMs`, `billing.energyCharged: 0` in preview, `source: shared_hiring_index`, "Collection is demand-driven" `[signals-api]`. Coming-soon types: Reddit conversations, fundraising, LinkedIn posts, decision-maker changes, headcount growth `[ev §3]`.
- OBSERVED curated datasets: YC founders (11,517), a16z speedrun founders (478), early-stage investors (520); MCP `find_people.list` keys `yc_founders_2026_09`, `a16z_speedrun_founders_2026_10` `[ev §4]`, `[model §4.1]`.
- OBSERVED: GitHub stargazers, lookalike accounts, competitor engagers, target accounts Play types `[model §1.6]`; competitor research reads "public case studies" from a website `[card: research_competitor]`.

**(b) Surfaced.** Play builder fields ("Who do you want to find?", "Company is hiring for", "Job posted within", "Backed by"), targeting summary before confirmation, review batch of candidates with `matchReason`/`evidence` `[ev §3, §13]`, `[model §1.12]`.

**(c) Rules.** Max 3 counted size checks per day (`check_campaign`) `[model §4.2]`; reserve-then-settle billing; no auto-retry of paid lookups `[people-api]`; suppressed identities return 404 `person_unavailable` `[people-api]`.

**(d) AREVEI design.** Four narrow provider interfaces plus a waterfall orchestrator. Candidate vendors with official APIs (ASSUMPTION on exact endpoints; each adapter documents the vendor API it wraps):

| Interface | Vendor adapters (v1) | Notes |
|---|---|---|
| `PeopleSearchProvider` | Apollo (`/v1/mixed_people/search`), People Data Labs (Person Search) | Our targeting schema is translated per vendor; unsupported filters are reported back as `unsupportedFilters[]`, not silently dropped. |
| `CompanySearchProvider` | Apollo (organizations search), PDL (Company Search), Exa (semantic web search for lookalikes) | Lookalike accounts via Exa `findSimilar`. |
| `EnrichmentProvider` | PDL (Person Enrich), Apollo (people/match), Hunter (Email Finder + Verifier) | Waterfall order configurable per workspace; stop at first confident hit; `matchesCompanyDomain` check adopted from `[people-api]`. |
| `SignalProvider` | Firecrawl (careers-page crawl → `hiring.job_observed`), Exa (news search → `funding.announced`), Apollo (job postings where available) | Event IDs are deterministic hashes of `(source, companyDomain, jobId|url)` so replays dedupe, adopting the "one immutable event ID per source/job pair" rule `[signals-api]`. |

Common conventions: every call returns `{ data, provider, costCents, cached }`; the orchestrator reserves credits before the first vendor call and settles with the sum of actual costs; results are cached per workspace for 30 days keyed by normalised input (PumpGTM says it does not cache enrich responses; we do, server-side, to avoid double charging — ASSUMPTION). Sales Navigator and ZoomInfo are not adapters in v1 (no self-serve official API for the former; enterprise contract for the latter).

```ts
// packages/data/src/providers.ts
export interface ProviderResult<T> { data: T; provider: string; costCents: number; cached: boolean; unsupportedFilters?: string[] }

export interface PeopleSearchProvider {
  readonly id: "apollo" | "pdl";
  searchPeople(q: Targeting, page: { limit: number; cursor?: string }): Promise<ProviderResult<{ people: PersonCandidate[]; nextCursor: string | null }>>;
  countPeople(q: Targeting): Promise<ProviderResult<{ count: number; isEstimate: boolean }>>;
}
export interface CompanySearchProvider {
  readonly id: "apollo" | "pdl" | "exa";
  searchCompanies(q: CompanyFilters, page: { limit: number; cursor?: string }): Promise<ProviderResult<{ companies: CompanyCandidate[]; nextCursor: string | null }>>;
  lookalikes(seedDomain: string, limit: number): Promise<ProviderResult<CompanyCandidate[]>>;
}
export interface EnrichmentProvider {
  readonly id: "pdl" | "apollo" | "hunter";
  enrichPerson(i: { email?: string; linkedinUrl?: string; find: Array<"work_email" | "phone" | "x"> }): Promise<ProviderResult<EnrichedPerson | null>>;
  verifyEmail?(email: string): Promise<ProviderResult<{ status: "valid" | "invalid" | "risky" | "unknown" }>>;
}
export interface SignalProvider {
  readonly id: "firecrawl" | "exa" | "apollo";
  readonly signalTypes: Array<"hiring.job_observed" | "funding.announced">;
  pollEvents(i: { type: string; filters: SignalFilters; cursor?: string; limit: number }): Promise<ProviderResult<{ events: SignalEvent[]; nextCursor: string | null; nextPollMs: number }>>;
}
```

### 2.11 LLM providers

**(a) Observed.** OBSERVED: privacy policy: "prompts and responses may be transmitted to third-party AI providers based on your workspace configuration"; operator is "not affiliated with... any AI model provider" `[ev §12]`. OBSERVED uses of AI in product: reply classification + drafted answers (`reply.received.draft`, `classification`), `write_cold_email` writing rules, `review_x_play_candidates` criteria "judge", intent `score`/`tier`, `preview_workspace_setup` reviewer, AI search (AEO) checks against ChatGPT/Gemini/Perplexity/Google AI, `suggest_ai_search_questions` "One model call" `[card]`, `[model §5.3, §6, §9]`. No vendor names appear anywhere in the evidence for the generation side; `[ev §14]` lists reply classification taxonomy as unknown.

**(d) AREVEI design.** `LlmProvider` adapters: `anthropic`, `openai`, `gemini`, `deepseek`, `openrouter`, `bedrock`. Every product call goes through one `generateStructured(schema)` entry point (JSON schema in, validated object out, with a retry-on-invalid loop) so classification, drafting, scoring and ICP inference never depend on free-text parsing. Per-workspace model routing table (`task → provider/model`) with a global default; per-workspace daily token budget tracked in the usage ledger. Prompts and outputs are logged with PII redaction only when the workspace opts in. Provider keys may be platform-level (ours) or workspace-level BYO keys (encrypted).

```ts
// packages/llm/src/provider.ts
export interface LlmProvider {
  readonly id: "anthropic" | "openai" | "gemini" | "deepseek" | "openrouter" | "bedrock";
  generateText(i: { model: string; system?: string; messages: LlmMessage[]; maxTokens: number; temperature?: number }): Promise<{ text: string; usage: TokenUsage }>;
  generateStructured<T>(i: { model: string; system?: string; messages: LlmMessage[]; schema: JsonSchema; maxTokens: number }): Promise<{ object: T; usage: TokenUsage; raw: string }>;
  embed?(i: { model: string; inputs: string[] }): Promise<{ vectors: number[][]; usage: TokenUsage }>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}
export interface LlmRouter {
  forTask(workspaceId: string, task: "classify_reply" | "draft_reply" | "write_step" | "score_fit" | "infer_icp" | "judge_candidate"): Promise<{ provider: LlmProvider; model: string }>;
}
```

### 2.12 Scheduling / booking

OBSERVED: `app.cal.com` in `script-src`, `connect-src` and `frame-src` `[headers]`; enterprise CTA links to `cal.com/namanyayg/gtm` `[ev §1]`; "Opening calendar…" `[ui:731]`; reply decision `booking_link` ("contact the prospect at once") `[model §6]`; Google Calendar read-only connection for call reminders `[ev §6, §12]`; activity actions `meeting_invited`, `meeting_booked`, `meeting_no_show`, `meeting_synced` `[model §7.4]`; analytics `coverage.meetings = "partial"` `[model §7.1]`. INFERRED: the Cal.com embed is PumpGTM's own sales booking, while customers' booking links are plain URLs inserted into drafts.
AREVEI: a `booking_url` text field per user and per workspace (fallback), validated as https; the `booking_link` reply decision inserts it. No calendar OAuth in v1; `meeting_booked` is recorded manually or via webhook from the user's booking tool (ASSUMPTION).

### 2.13 Outbound webhooks

OBSERVED (full detail in `api-observations.md §6`): `POST /webhooks { url, events[1..15] }` → `secret` shown once; ≤10 enabled per workspace (409 `webhook_limit_reached`); registration not idempotent; `POST /webhooks/{id}/test` → 202 `ping`; HTTPS on 443, public address, no IP literals/credentials/redirects; envelope `{ id, event, createdAt, data }`; headers `X-PumpGTM-Event`, `X-PumpGTM-Delivery`, `X-PumpGTM-Signature: t=<unix>,v1=<hex>` with `v1 = HMAC-SHA256(secret, t + "." + rawBody)`, 300 s tolerance; 2xx within 10 s; retried twice at 1 s and 4 s on timeout/network/429/5xx; "no replay queue yet" `[api-guide: Webhooks]`, `[model §8]`.
AREVEI: adopt the same scheme with header names `X-Arevei-Event`, `X-Arevei-Delivery`, `X-Arevei-Signature` and the identical `t=,v1=` HMAC construction so existing receiver code ports trivially. Differences (ASSUMPTION): retry schedule 1 s, 4 s, 30 s, 5 min, 1 h (5 attempts) with a dead-letter list visible in the UI and a `POST /webhooks/{id}/redeliver` endpoint; registration **is** idempotent on `(workspace, url, sorted events)`; SSRF guard resolves DNS at send time and rejects private ranges.

```ts
// packages/webhooks/src/types.ts
export interface WebhookDispatcher {
  enqueue(e: { workspaceId: string; event: WebhookEventName; data: unknown; idempotencyKey: string }): Promise<{ deliveryId: string }>;
  sign(secret: string, t: number, rawBody: Buffer): string;      // "t=<t>,v1=<hex>"
  verify(secret: string, header: string, rawBody: Buffer, toleranceSec?: number): boolean;
  redeliver(deliveryId: string): Promise<void>;
}
```

### 2.14 MCP / agent surface

OBSERVED: server card `name: com.pumpgtm/mcp`, `version 2.0.0`, `protocolVersion 2025-06-18`, transport streamable-http at `https://mcp.pumpgtm.com/mcp`, `authentication { required: true, schemes: ["oauth2"], authorizationServer: "https://app.pumpgtm.com" }`, `capabilities.tools.listChanged: false`, 70 tools each with `readOnlyHint/destructiveHint/idempotentHint/openWorldHint` `[card]`. OBSERVED: OAuth 2.1 with dynamic client registration and PKCE, metadata at `/.well-known/oauth-authorization-server`, access 30 d / refresh 90 d; or workspace key bearer; custom bearer clients use `https://app.pumpgtm.com/api/v1/mcp`; "up to 38 tools, depending on the workspace's features"; result envelope = one text block of JSON mirrored in `structuredContent` with a `next` hint; errors `isError` + `{ status, retryable, changed, message, details }`; six `gigacatalyst://lead-search/*` resources and one prompt; experimental `events/list` + `events/poll` for signals `[mcp-docs: Connect, How results come back]`, `[ev §3]`. OBSERVED: every write tool takes a `requestId`; sensitive writes are flagged so clients ask the user `[mcp-docs: Tool permissions]`; internal `/api/onboarding/mcp-credential` endpoint and deep links that open Claude/Codex/Cursor with a setup prompt `[fetch]`, `[ui:706-709]`.
AREVEI: later phase. Design notes to carry forward: (1) the MCP server is a thin layer over the same service functions as REST, so REST ships first; (2) same auth model: workspace key bearer or OAuth 2.1 + PKCE with DCR via our own authorization server; (3) tool hints and a `next` suggestion in every result; (4) feature-gated tool lists; (5) the classification table (read / write / sensitive write) is kept as metadata on each service function and generated into both OpenAPI `x-arevei-side-effect` and MCP annotations.

### 2.15 n8n node

OBSERVED: "Install the n8n-nodes-pumpgtm community node from Settings > Community nodes, paste your workspace key into a PumpGTM API credential, and use it in workflows or as an AI Agent tool" with a GitHub source link `[api-guide: intro]`. AREVEI: not in v1. Once the REST surface is stable, an n8n community node is a mechanical wrapper over the OpenAPI document.

### 2.16 Partner API

OBSERVED: second server `https://app.pumpgtm.com/api/partner/v1` `[openapi: servers]`; `POST /signup`, `GET/PATCH /account` (brand name, redirect URLs, `enterprise.linkedinConnect`/`outreach` flags), `GET/POST /users`, `GET/PATCH/DELETE /users/{externalUserId}`, LinkedIn accounts and hosted connect links per end user (single use, 7-day default expiry, popup not iframe, poll every 3 s), `X-PumpGTM-User` header to act on a client workspace, 50 free leads then `billing_required`, `monthlyLeadCap` `[api-guide: Partners]`, `[model §1.30-1.32, §2.9]`. AREVEI: skip for v1; the tenancy model (workspace per client, delegated header) is compatible with adding it later.

## 3. Cross-cutting adapter conventions

| Concern | AREVEI rule (ASSUMPTION unless cited) |
|---|---|
| Base interface | Every adapter implements `ProviderAdapter { id; kind; healthCheck(); capabilities(); }` and is registered in a `ProviderRegistry` keyed by `(kind, id)`. |
| Credential storage | `integration_credentials(workspace_id, provider_id, kind, ciphertext, key_version, created_by, rotated_at, status)`; AES-256-GCM envelope encryption with a per-environment KEK (`AREVEI_KEK`), DEK per row; decrypt only inside server-side worker/API processes; never returned by any API (PumpGTM states "API keys... encrypted at rest using AES-256" `[ev §12]`, which we match). |
| Health check | `healthCheck()` runs on connect, hourly in a worker, and on demand from the UI; stores `status: ok | degraded | failed`, `checked_at`, `detail`; the observed "live check before saving" for email `[ev §6]` is generalised to every channel adapter. |
| Usage tracking | Every vendor call emits `provider_calls(workspace_id, provider_id, op, cost_cents, latency_ms, ok, request_id)`; metered ops go through `UsageLedger.reserve/settle`. |
| Fallback | Waterfall config per workspace: ordered provider list per interface; adapter errors are classified `retryable | not_retryable | quota`; on `quota` the orchestrator skips to the next provider and raises an `attention` item, mirroring PumpGTM's `get_workspace.attention` list `[model §0]`. |
| Idempotency | Adapter write calls accept an `idempotencyKey` derived from `(workspace, requestId, step)`; paid lookups are never auto-retried `[people-api]`. |
| No stealth | No adapter may hold end-user passwords or cookies for a third-party consumer service; connection is OAuth or vendor-hosted auth only. |

```ts
// packages/providers/src/base.ts
export interface ProviderAdapter {
  readonly id: string;
  readonly kind: "linkedin" | "mailbox" | "transactional_email" | "x" | "people_search" | "company_search" | "enrichment" | "signal" | "llm" | "payment" | "telemetry" | "storage";
  capabilities(): Promise<Record<string, boolean>>;
  healthCheck(ctx: { workspaceId?: string }): Promise<{ status: "ok" | "degraded" | "failed"; detail?: string; checkedAt: string }>;
}
export interface CredentialVault {
  put(i: { workspaceId: string; providerId: string; secret: Record<string, string>; createdBy: string }): Promise<{ credentialId: string }>;
  get(credentialId: string): Promise<Record<string, string>>;     // server-side only; audited
  rotate(credentialId: string, secret: Record<string, string>): Promise<void>;
  revoke(credentialId: string): Promise<void>;
}
```

## 4. Environment variable matrix

Platform-level keys live in env; workspace-level credentials live in the encrypted vault (never env). `req` = required for the feature to be enabled.

| Variable | Scope | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | platform, req | all | Postgres connection string |
| `REDIS_URL` | platform | queues, realtime fan-out | optional in dev (in-process fallback) |
| `AREVEI_KEK` | platform, req | CredentialVault | base64 32-byte key; rotate via `key_version` |
| `AUTH_SECRET` | platform, req | session/cookie signing | |
| `APP_URL` | platform, req | OAuth redirect URIs, webhook test links | |
| `OTP_EMAIL_FROM` | platform, req | OtpService via TransactionalEmailProvider | |
| `TRANSACTIONAL_EMAIL_PROVIDER` | platform | `resend|ses|sendgrid` | default `resend` |
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` | platform | Resend adapter | |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | platform | SES, Bedrock, S3 | |
| `SENDGRID_API_KEY` / `SENDGRID_WEBHOOK_PUBLIC_KEY` | platform | SendGrid adapter | |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | platform, req | ObjectStorageAdapter | R2/MinIO compatible |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | platform | Gmail mailbox adapter | Workspace admin allow-listing surfaced in UI |
| `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` / `MICROSOFT_TENANT` | platform | Microsoft Graph mailbox adapter | `MICROSOFT_TENANT=common` |
| `X_OAUTH_CLIENT_ID` / `X_OAUTH_CLIENT_SECRET` | platform | XProvider | OAuth 2.0 PKCE user context |
| `LINKEDIN_VENDOR` | platform | LinkedInProvider selection | `unipile|none`; `none` disables the channel |
| `UNIPILE_DSN` / `UNIPILE_API_KEY` / `UNIPILE_WEBHOOK_SECRET` | platform (or workspace vault) | Unipile-style adapter | per-workspace override allowed |
| `APOLLO_API_KEY` | platform or workspace vault | PeopleSearch/CompanySearch/Enrichment | |
| `PDL_API_KEY` | platform or workspace vault | PeopleSearch/CompanySearch/Enrichment | |
| `HUNTER_API_KEY` | platform or workspace vault | Enrichment (email find/verify) | |
| `EXA_API_KEY` | platform or workspace vault | CompanySearch lookalikes, SignalProvider | |
| `FIRECRAWL_API_KEY` | platform or workspace vault | SignalProvider (careers crawl), website profile | |
| `LLM_DEFAULT_PROVIDER` / `LLM_DEFAULT_MODEL` | platform, req | LlmRouter | |
| `ANTHROPIC_API_KEY` | platform or workspace vault | LlmProvider anthropic | |
| `OPENAI_API_KEY` | platform or workspace vault | LlmProvider openai | |
| `GEMINI_API_KEY` | platform or workspace vault | LlmProvider gemini | |
| `DEEPSEEK_API_KEY` | platform or workspace vault | LlmProvider deepseek | |
| `OPENROUTER_API_KEY` | platform or workspace vault | LlmProvider openrouter | |
| `BEDROCK_REGION` | platform | LlmProvider bedrock (uses AWS creds above) | |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLISHABLE_KEY` | platform | PaymentProviderAdapter | optional, later |
| `TELEMETRY_PROVIDER` | platform | `none|posthog` | default `none` |
| `POSTHOG_KEY` / `POSTHOG_HOST` | platform | TelemetryAdapter posthog | |
| `WEBHOOK_SIGNING_TOLERANCE_SEC` | platform | WebhookDispatcher | default 300, as observed `[api-guide]` |
| `CHANNEL_X_DAILY_DM_CAP` | platform | X dispatcher | default 100 per workspace, as observed `[ev §7]` |
| `CHANNEL_LINKEDIN_DEFAULT_INVITE_CAP` | platform | LinkedIn pacing | default 20 (ASSUMPTION; observed PumpGTM default 30) |

## 5. Techniques we will not replicate (and what we do instead)

| PumpGTM technique (OBSERVED) | Evidence | AREVEI alternative |
|---|---|---|
| LinkedIn session-cookie connection (`li_at`, `li_a`), Cookie-Editor export, "signed-in browser" capture | `[ui:287-292,712,972-977]` | Vendor-hosted authorized auth only; no cookies ever stored |
| LinkedIn email/password relay through the connection provider | `[ui:625]`, `[ev §5]` | Same as above |
| Residential / "undetectable" proxies per account; `proxyCountry` | `[ui:1098]`, `[api-guide]`, `[ev §5]` | None. The vendor API is the only network path |
| Simulated mouse movement / browser-session automation | `[ev §5]` | None |
| Instagram credential-based custom auth | `[routes]` | Channel skipped |
| WhatsApp personal-account linking | `[ev §8]` | Channel skipped |
| Visitor-identification pixel sending IP/browser data to a data partner | `[ev §12]` | Not implemented |
| Session recording by default | `[onboard]` | Off; telemetry optional |

## 6. Open questions carried into design

1. Whether a Unipile-style vendor's hosted auth is acceptable to our users' compliance teams; fallback is LinkedIn channel disabled (manual "copy this message" tasks only).
2. Email reply detection cadence: Gmail push (Pub/Sub watch) vs polling — start with polling every 2 minutes per mailbox (ASSUMPTION).
3. Reply classification taxonomy is unknown in the evidence `[ev §14]`; we define our own: `interested | not_now | not_interested | question | out_of_office | wrong_person | unsubscribe | bounce`.
4. Energy pack price conflict ($10/75 vs $10/100) `[model §10.4]` is irrelevant to us but shows price lists must be data, not copy.
