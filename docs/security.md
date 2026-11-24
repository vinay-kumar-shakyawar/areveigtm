# Security

## Principles

- Secrets live on the server only. Provider keys, OAuth tokens and webhook secrets are sealed with AES-256-GCM (`ENCRYPTION_KEY`, versioned, AAD bound to the owning row) and are never returned by any API, rendered in HTML, logged or exported. API responses expose a fingerprint only (tested).
- Nothing reaches a prospect without a human approval, except replies in workspaces that explicitly enabled auto-send above a confidence threshold; every auto-send is audited.
- No circumvention: LinkedIn and X run only through authorized provider APIs; there is no scraping, cookie import, stealth browser automation or rate-limit evasion.
- Every tenant query is scoped by `workspaceId`; integration tests cover cross-tenant access for each module.

## Authentication and sessions

- Passwords hashed with Argon2id; sign-up and password reset confirmed with emailed 6-digit codes bound by HMAC to the email and purpose.
- Sessions are opaque random tokens stored hashed (SHA-256) in `Session` with sliding expiry; the cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- API keys (`agk_…`) stored hashed with scopes; a key is bound to one workspace; `read` keys cannot mutate; credential and OAuth endpoints refuse API keys.
- Cookie-authenticated mutations must match the app origin (CSRF check).

## Authorization

Flat permission catalogue (`src/server/auth/rbac.ts`) mapped to roles owner/admin/member; services call `requirePermission`. Admin-only: integrations, senders, webhooks, API keys, members, settings, campaign activation, audit log.

## Input handling

- zod validation on every body and query; unknown providers and fields are rejected.
- Idempotency keys for creating work; optimistic concurrency with `revision` on company profiles, ICPs and sequences.
- Rate limiting per user, key and IP; strict buckets for expensive routes.

## Inbound webhooks

Each provider endpoint verifies before parsing: Svix HMAC (Resend), ECDSA (SendGrid), SNS certificate signature with a trusted-host check (SES), shared secret / HMAC token (Unipile). Unverified requests are rejected before any row is written; verified events are stored once (unique provider event id).

## Outbound webhooks

Per-endpoint secrets, HMAC-SHA256 signatures with timestamps, retries with backoff, automatic disable after repeated failures, https required in production.

## AI safety

Prompts carry grounding rules (use only provided evidence, state unknowns, cite sources). Drafts record reasoning, personalization used and risks. Inferred signals are flagged. Classification never auto-sends for unsubscribe, bounce, wrong-person or not-interested replies.

## Compliance

Unsubscribe footer link, RFC 8058 one-click `List-Unsubscribe`, suppression list consulted at enrolment and send time, bounce and complaint handling, opt-out from the inbox, audit log for every administrative action.

## Logging

pino JSON logs with redaction of every secret env var and `authorization` headers. Request ids on every response. No message bodies in logs at `info`.

## Known gaps

- Rate limiter is in-memory per instance; use one instance or add a shared store before scaling out.
- No MFA, no SSO, no IP allow-lists.
- Data retention job not implemented.
- Live provider integrations and OAuth flows have not been exercised against real accounts in this environment.
