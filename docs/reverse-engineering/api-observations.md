# AREVEI GTM — API Observations (PumpGTM public REST API and MCP catalog)

Status: working document, compiled 2026-11-17 from `docs/reverse-engineering/evidence/`. Companion to `integration-analysis.md`, which holds the citation key table, the OBSERVED / INFERRED / ASSUMPTION labelling rules and the dependency analysis. Same keys are used here (`[model §n]`, `[ev §n]`, `[api-guide]`, `[openapi]`, `[oa-cond]`, `[mcp-docs]`, `[card]`, `[quickstart]`, `[people-api]`, `[signals-api]`, `[headers]`, `[fetch]`, `[routes]`, `[ui:n]`).

Scope: everything below was read from public documentation, the public `openapi.json`, the public `.well-known/mcp.json` server card and static analysis of the public onboarding bundle. No authenticated request was made, so request/response behaviour is OBSERVED-as-documented, never OBSERVED-at-runtime. Fields marked `*` are required in the schema; "untyped" means `additionalProperties: true` with only prose `[model: Conventions]`.

## 1. Platform facts

| Topic | Observation | Label / source |
|---|---|---|
| Spec | OpenAPI 3.1, title "PumpGTM API", version `1.1.0`, 65 operations (80 path+method pairs counted across both servers in the enumeration), single security scheme `WorkspaceKey` | OBSERVED `[openapi: info, security]` |
| Base URLs | Workspace API `https://app.pumpgtm.com/api/v1`; Partner API `https://app.pumpgtm.com/api/partner/v1` | OBSERVED `[openapi: servers]`, `[api-guide: Authentication]` |
| Auth | `Authorization: Bearer eve_mcp_...` workspace key; same key for REST and MCP; "does not expire. Rotation is not self-serve yet" | OBSERVED `[api-guide]`, `[mcp-docs: Connect]` |
| Key scope | "A workspace key acts on its own workspace."; "The key's database row fixes the workspace." | OBSERVED `[api-guide]`, `[mcp-docs]` |
| Team delegation | `X-PumpGTM-Client: <workspaceId>` lets a Team owner key act on an authorized workspace listed by `GET /workspaces`; "the header never grants access to another tenant" | OBSERVED `[api-guide]`, `[oa-cond: every endpoint]` |
| Partner delegation | `X-PumpGTM-User: <externalUserId>` lets a partner key act on one client workspace; never together with `X-PumpGTM-Client` (400 `invalid_request`) | OBSERVED `[api-guide: Partners]` |
| Legacy headers | `X-Eve-Client`, `X-Eve-User` "still work and mean the same thing" | OBSERVED `[api-guide]` |
| Numeric IDs | "Keep numeric X user IDs as strings so they do not lose precision."; pattern `^[1-9][0-9]{0,19}$` | OBSERVED `[api-guide]`, `[model §1.4]` |
| Markdown mirror | Every docs page is available as Markdown (`/markdown/pages/docs/*.md`, `Accept: text/markdown`); agent index at `/llms.txt` | OBSERVED `[quickstart §5]` |
| Hosting | Vercel, Next.js (`server: Vercel`, `x-powered-by: Next.js`) | OBSERVED `[headers]` |
| Content type | JSON bodies; multipart not used — per-lead files go through a presigned PUT | OBSERVED `[model §3.7]` |

### 1.1 Versioning policy

OBSERVED `[api-guide: Versioning]`: the path carries the major version (`/api/v1`); "new fields may be added, existing ones are not removed or renamed"; breaking changes ship under a new major path; "Anything scheduled for removal answers with `Deprecation: true` and a `Sunset` header at least 90 days ahead." A retired endpoint (`POST /integrations/hubspot`) answers 410 `[model §11]`, `[openapi: tags Plays]`. MCP: tools scheduled for removal say so in their description for ≥90 days before leaving `tools/list` `[mcp-docs: Versioning]`.

### 1.2 Idempotency

OBSERVED `[api-guide: Retries and idempotency]`, `[model §10.5]`:
- `requestId` matches `^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$` (8–120 chars).
- Optional on most writes; **required** on manual-review imports (`POST /plays/{id}/import`), people-search runs (`run: true`, `POST /people/searches/{playId}/run`) and on every MCP write.
- Same `requestId` + same body → stored result replayed (`reused: true` / `replayed: true`), same ids.
- Same `requestId` + different body → 409 and "changes nothing" (`idempotency_conflict`, `sequence_create_request_conflict`, `sequence_edit_request_conflict`).
- Without one, a retry is a new request.
- Variants: lead moves use a client-generated `operationId` UUID with the same conflict rule; undo-remove uses `removalIds` (retry "harmless"); scheduled replies use an `Idempotency-Key` header (required with `sendAt`). Webhook registration is explicitly **not** idempotent `[api-guide: Webhooks]`. Webhook-Play intake dedupes on `eventId` (`reused` on replay) `[model §2.15]`.
- Paid people-data lookups are "not idempotent... Do not automatically retry" `[people-api]`.

### 1.3 Optimistic concurrency

OBSERVED `[model §1.8, §10.5]`: integer `revision` (≥1) on sequences, Plays, setup (`setupRevision`), CRM (`expected_revision`, 0 creates). Writers send `expectedRevision`; a stale value → 409 (`sequence_revision_conflict`, `draft_changed`, `version_conflict`) and "A 409 means nothing was overwritten" `[api-guide: Sequences]`. `PUT /sequences/{id}` returns `change { previousRevision, revision, currentRevision, ..., approvalInvalidated }` `[model §1.7]`. `POST /plays/{id}/enroll` needs both `expectedRevision` (Play) and `sequenceRevision` `[api-guide: Advanced]`. Scheduled replies use `expectedVersion` `[model §2.12]`.

### 1.4 Pagination

OBSERVED `[model §10.6]`, `[api-guide]`: cursor pagination with `nextCursor` → pass as `after` (candidates, Play leads, X review) or `cursor` (threads, LinkedIn accounts, scheduled replies); stop when null; some lists add `hasMore`. Offset pagination only in CRM (`offset` 0–10000, `nextOffset`) and `personalFiles` (`page` 0–400). Signals use an opaque signed cursor bound to workspace+filters, 7-day expiry (410), plus `hasMore`, `truncated`, `nextPollMs` `[signals-api]`. Limit ranges: leads ≤500; threads 1–100 (default 50; cursor expires 30 min); LinkedIn accounts 1–100 (default 50); review pages ≤200 rows; replies 1–200 (default 50); signals 1–100 (default 50); activity MCP 1–500 (default 100) `[model §10.1]`.

### 1.5 Error model

OBSERVED `[api-guide: Retries and idempotency]`, `[model §11]`, `[people-api]`, `[signals-api]`:

| Status | Shape / code | Meaning | Client action |
|---|---|---|---|
| 400 | `{ error: "invalid_request", issues }`; also `invalid_cursor`, `user_header_required`, `invalid_external_user_id`, `invalid_monthly_lead_cap`, `nothing_to_update`, `invalid_body`, `invalid_expires_in_minutes` (+`field`) | Validation failed | Fix the request |
| 401 | `unauthorized` | Missing, unknown, revoked or expired key | Check / rotate key |
| 402 | `energy_exhausted` | Not enough Energy; nothing ran | Add Energy or lower count |
| 403 | `enterprise_required`, `partner_key_required`, `user_disabled`, `x_channel_disabled`, `scheduling_not_enabled`, `billing_required`, `user_lead_cap_reached`, `energy_required`, tenant mismatch | No access to workspace / feature / channel | Check key, delegation header, capabilities |
| 404 | `{ error: "not_found", resource }` (`sequence`, `lead`, `import`, `play`, `review`); `user_not_found`, `account_not_found`, `connect_link_not_found`, `person_unavailable` | Not in this workspace (or suppressed identity) | Check id and workspace |
| 409 | `{ error, message }` customer-safe code; "nothing changed" | State conflict (full catalogue in `[model §11]`: approval, revision, idempotency, warm-up, webhook limit, lead_input_* family, lead_delete_blocked with `retryAfterSeconds`) | Read current state, decide; "Do not blindly repeat with a new requestId" |
| 410 | — | Retired endpoint; expired signals cursor | Restart / migrate |
| 413 | `request_too_large` | Body > 4 KB (people enrich) / 8 KB (signals, webhook-Play) | Shrink body |
| 429 | `rate_limited` + `Retry-After` | Rate limited (InMail balance check documented) | Respect `Retry-After` |
| 500 | `internal_error` | — | Retry reads with backoff + jitter |
| 502 | `thread_unavailable`, `inmail_credits_unavailable` | Upstream provider failed | Retry later |
| 503 | `sequence_move_unconfirmed`, `lead_delete_unavailable`, `disconnect_failed`, `people_data_unavailable`, X resolve `status: unknown` | Unconfirmed outcome | Re-read the same object / retry same id; "an error is not an empty result" |

Non-standard shapes OBSERVED: `PATCH /sequences/{id}/status` → 400 `{ error: "status must be one of active, paused, draft" }`, 404 `{ error: "sequence not found" }`, 409 `{ ok: false, error }` `[model §11]`. Partial success on 200 is normal for eligibility (`null` results), undo-remove and move (inspect `results[]`) `[model §11]`. MCP errors: `isError: true` + `{ status, retryable, changed, message, details }`; `resource_not_found` `[mcp-docs: How results come back]`.

## 2. Endpoint catalogue (OBSERVED from `[openapi]` operation list; fields from `[oa-cond]` and `[model]`)

Paths are relative to `/api/v1` unless the tag is Partner (relative to `/api/partner/v1`). Every `/api/v1` operation also accepts the optional `X-PumpGTM-Client` / `X-PumpGTM-User` headers `[oa-cond]`.

### 2.1 Plays

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| POST | `/plays/{id}/leads` | Add people to a Play | `requestId?`, `leads[1..500] { person*, company, title, linkedinUrl, email, xUsername }` | added/skipped counts, lead ids | Each lead needs ≥1 identity; duplicates skipped; a paused sequence holds them `[api-guide: Add people]` |
| GET | `/plays/{id}/leads` | List a Play's leads | `after`, `limit` | `leads[] { id, name, linkedinUrl, email, xUserId, username, sequenceId, stage, createdAt }`, `nextCursor` | ≤200 rows/page `[model §1.11]` |
| POST | `/plays/{id}/webhook` | Receive a signup event in a Webhook Play | `expectedRevision*`, `eventId*`, `name`, `email`, `company`, `title`, `linkedinUrl`, `xUsername`, `dryRun` (default true) | `status` (`validated` / `review` / `queued`), `batchId`, `candidateId`, `reused`, `contacted` | Body ≤8192 bytes; `eventId` dedupes `[model §2.15, §10.1]` |
| POST | `/x/watches` | Create an X Play | `source* followers\|every_post\|post`, `postUrl` (for `post`), `message` (≤2000) XOR `sequenceId`, `name`, `as` | 201 `{ id, source, postId, sequenceId, status, as, peopleSeen, waitingForReview, createdAt }` | "X defaults to review before enrollment" `[model §5.2]` |
| GET | `/x/watches` | List X Plays with funnels | — | watches[] + `funnel` (untyped) | Used to find Play ids `[api-guide]` |
| POST | `/integrations/hubspot` | Retired HubSpot signup endpoint | — | 410 | Replaced by Webhook Play `[model §11]` |

### 2.2 Sequences

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| GET | `/sequences` | List sequences | — | `sequences[] { id, name, status, revision, approvedAt, approvedRevision, executionBlockReason, executionModel linear\|tracks\|graph, leadCount, channels[], steps[] (compact) }` | `[model §1.7]` |
| POST | `/sequences` | Create a complete sequence | `requestId?`, `name* (1–160)`, `steps*[1..20/30]`, `executionModel?`, `xThreadCheck?` | 201 `{ sequence, reviewUrl, live }` | Live on return with a workspace/partner key; nothing sent until people are added `[api-guide: Sequences]`; step schema in `[model §1.9, §3.1]` |
| GET | `/sequences/{id}` | Read one sequence with revision | — | full sequence | Read before PUT |
| PUT | `/sequences/{id}` | Replace steps as a new revision | `expectedRevision*`, `steps*`, `name?`, `executionModel?`, `xThreadCheck?`, `requestId?` | `update { ok, replayed, sequence, live, change {...} }`, `reviewUrl` | 409 `sequence_edit_would_repeat`, `sequence_has_progress`; edit rules `[model §3.4]` |
| PATCH | `/sequences/{id}/status` | Pause / resume / reopen | `status* active\|paused\|draft` | `{ ok, sequenceId, previousStatus, status }` | 409 `sequence_approval_required`, `archived_sequence_is_read_only` `[model §2.1]` |

### 2.3 Leads

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| POST | `/sequences/{id}/leads` | Add people to a sequence | method `contacts` (1–500) \| `manual` (LinkedIn URLs, `customFields`) \| `csv` (≤500 rows, ≤100 cols, ≤200,000 chars) \| `sales_navigator` (`listUrl`); `accountId`, `invitePriority` 0–1000, `expectedRevision?`, `requestId?` | added/duplicate counts, `batchId` for imports | 409 `linkedin_not_connected`; adding to a draft approves it `[api-guide]`, `[model §1.11, §10.1]` |
| GET | `/leads/imports/{batchId}` | Sales Navigator import status | — | `status processing\|waiting\|finalizing\|completed\|failed`, `errorCode` | Sync methods return 404 here `[model §2.8]` |
| GET | `/leads` | List leads across channels | `stage`, `engaged=1`, `sinceDays`, `booked=1`, `q`, `limit (≤500)` | `count`, `returned`, `leads[] { id, person, removal }` | Stage vocabulary `queued, invited, connected, messaged, replied, meeting_booked` (differs from MCP enum) `[model §2.2, §12]` |
| GET | `/leads/{id}` | Read one lead | — | identity, account, sequence, stage, milestones, reply sentiment, last error, removal | Mostly untyped `[model §12]` |
| GET | `/leads/{id}/thread` | Read a lead's LinkedIn conversation | `cursor`, `limit 1–100` | messages, `nextCursor` | Cursor expires 30 min; 502 `thread_unavailable` `[model §10.1, §11]` |
| DELETE | `/leads/{id}` | Permanently delete an unused removed lead | none | `{ deleted }` | REST-only; needs a current removal and no history; 409 `lead_delete_blocked` + `retryAfterSeconds`; 503 `lead_delete_unavailable` `[api-guide: Delete]` |
| POST | `/leads/{id}/input` | Supply per-person values for a held step | `values {1–5}`, `files { key → uploadTicket }` | `stored { ..., complete, stillMissing, willSendOn }` | `lead_input_*` 409 family `[model §3.7, §11]` |
| POST | `/leads/{id}/input/upload` | One-time upload link | `key`, `fileName (1–200)`, `size (1–50,000,000)` | `{ uploadUrl, method: "PUT", headers, uploadTicket, expiresAt (2 h), maxBytes, appUrl }` | PUT bytes as `application/octet-stream` `[model §3.7]` |
| POST | `/leads/move/preview` | Preview moving untouched people | `leadIds (≤500)`, `sequenceId` | eligibility per lead | Archived sequences refused `[model §2.1]` |
| POST | `/leads/move` | Schedule a move after 5 s | `leadIds*`, `sequenceId*`, `operationId* (UUID)` | `{ operationId, status pending\|running\|completed\|cancelled\|failed, executeAfter, serverNow, movedCount, blockedCount, results[] { leadId, status moved\|blocked, reason } }` | 503 `sequence_move_unconfirmed` `[model §2.7]` |
| GET | `/leads/move` | Read a move operation | `operationId` | same shape | Poll |
| POST | `/leads/move/cancel` | Cancel a pending move | `operationId` | status | Only while `pending` and before `executeAfter` `[model §2.7]` |
| POST | `/leads/remove` | Remove leads / cancel import / block companies | `target*` + `leadIds (1–500)` \| `batchId` \| `companies (1–100)` | `removal { ok, selectedCount, removedBeforeContact, automationStoppedAfterContact, ... }`, `removals[] { leadId, removalId, undoAfter }` | Companies go on a do-not-contact list `[oa-cond: POST /leads/remove]` |
| POST | `/leads/undo-remove` | Undo specific removals | `removalIds*` | `restoration { restoredCount, alreadyRestoredCount, blockedCount, results[] }` | Retry harmless; "up to ten minutes to settle" `[model §2.14]` |
| POST | `/x/users/resolve` | Handle → numeric X id | `username*` | `{ status, user { xUserId, username, name, checkedAt, evidence }, provider, sendsMessages }` | 503 `status unknown` `[model §1.4]` |
| POST | `/x/eligibility` | Do leads follow the account? | `account*`, `leads*[≤100] { reference, xUsername \| xUserId }` | `results[] { reference, followsAccount true\|false\|null, checkedAt, reason, evidence }` | Numeric ids: bounded snapshot (absence → null) `[model §5.3]` |
| POST | `/leads/enrich` | Email / LinkedIn → X identity | ≤20 items | matches | Bridges identities; paid `[model §10.1]` |
| POST | `/x/actions` | Follow / like / repost as the account | `action* follow\|like\|repost`, `target*`, `as` | `{ action, as, username, postId, done }` | One activity row + one Energy charge each `[model §1.4, §7.4]` |
| GET | `/x/leads/{id}` | X lead saved progress | — | `{ stage, automationStopped, currentStep, nextActionAt, followedAt, followedBackAt, messagedAt, repliedAt, optedOutAt, deliveryGuaranteed: false }` | `[model §2.3]` |
| POST | `/x/leads/{id}/stop` | Stop future automation | — | ok | Cross-channel stop; history kept `[api-guide: X]` |

### 2.4 Replies

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| GET | `/replies` | Pending replies ("Needs you") | `limit` | `replies[]` (untyped; MCP item fields in `[model §1.14]`) | LinkedIn, email and X `[oa-cond]` |
| POST | `/replies/{id}/decide` | Decide a pending reply | `decision* send\|invite\|booking_link\|snooze\|start_sequence\|meeting_booked\|dismiss\|opt_out`, `text?` (send), `days?` (snooze), `by?` (default "api"), `sendAt?` + `Idempotency-Key` header | 200 `{ ok }` or 202 `{ ok, scheduledReply }` | Same text re-sent → `alreadyDecided`; `opt_out` permanent `[model §6]` |
| GET | `/scheduled-replies` | List scheduled replies | `status`, `channel`, `leadId`, `cursor`, `limit` | `{ id, replyId, leadId, channel, status scheduled\|sending\|sent\|held\|cancelled\|failed\|delivery_unknown, sendAt, version, text }` | Partner-only feature (403 `scheduling_not_enabled`) `[model §1.15, §2.12]` |
| GET | `/scheduled-replies/{id}` | Read one | — | same | |
| PATCH | `/scheduled-replies/{id}` | Edit or reapprove | `text`, `sendAt`, `reapprove: true`, `expectedVersion` | updated | 409 `version_conflict`, `reapproval_required`, `conversation_changed`, `reply_not_editable` |
| POST | `/scheduled-replies/{id}/cancel` | Cancel before dispatch | — | status | Idempotent; 409 once sending/sent |
| GET | `/leads/{id}/reply-decisions` | X reply version without a draft | — | `{ leadId, channel, replyVersion, allowedDecisions[] }` | |
| POST | `/leads/{id}/reply-decisions` | Schedule a reply to a draft-less X conversation | `channel*`, `decision*`, `text*`, `sendAt*`, `replyVersion*`, `by?` + `Idempotency-Key*` | 202 | |

### 2.5 Results

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| GET | `/analytics` | Outreach analytics by Play, Sequence, channel | `range 7d\|30d\|90d` (default 30d), `scope workspace\|team` | `{ range, scope, timezone: "America/Los_Angeles", period, totals, daily[], plays[], messages[], channels[] (linkedin,email,x,instagram,whatsapp), team?, rankings, methodology { responseDays: 14, minimumRankingSample: 30, ... }, coverage { clicks: "unavailable", meetings: "partial", unmatchedSendEvents } }` | "Unknown or repeated query parameters are refused"; replyRate null without a full 14-day window `[model §7.1]` |
| GET | `/progress` | LinkedIn pace and outcomes | `sinceDays` (default 7) | funnel (invited, accepted, messaged, replied, meetings), queue depth, per-account invite budget (untyped) | Saved observations, not a live probe `[model §7.2]` |
| GET | `/reports/funnel` | Funnel by sequence or account | `group_by sequence\|account` | `{ groupBy, excludedWarmupAccounts[], total, groups[] { id, name, funnel }, experimentArms }` | `[model §7.3]` |
| GET | `/activity` | Append-only activity ledger | `action` (comma list), `outcome ok\|failed\|skipped`, `sinceDays`, `limit` | rows (untyped), `count` | Action enum of ~100 values in `[model §7.4]`; "polling supplements best-effort webhook delivery" |

### 2.6 Webhooks

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| GET | `/webhooks` | List enabled subscriptions | — | `webhooks[] { id, url, events, createdAt }`, `events[]` (catalog) | No secrets returned |
| POST | `/webhooks` | Subscribe to signed events | `url* (≤2000)`, `events*[1..15]` | 201 `{ id, url, events, secret }` | Secret shown once; ≤10 → 409 `webhook_limit_reached`; not idempotent `[model §8]` |
| POST | `/webhooks/{id}/test` | Schedule a signed ping | — | 202 `{ ok, id, event: "ping" }` | 202 = scheduled, not delivered |
| DELETE | `/webhooks/{id}` | Disable | — | `{ ok, id }` | |

### 2.7 People search (and people data / signals, same tag)

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| POST | `/people/searches` | Create/revise a people-search Play, optionally run | `targeting* { schemaVersion: 1, name*, candidateCount* 5–100, semanticQuery, defaultSequenceId, hardFilters* {...} }`, `playId?`, `expectedRevision?`, `run?`, `requestId` (required when `run`) | 200 prepared `{ play {id, revision}, plan, ambiguities, companyResolution, readyToRun, reviewUrl, searched: false }` or 201 `{ play, batch, candidates[], searched: true, contacted: false }` | 409 `targeting_needs_clarification`, `draft_changed`; 2 Energy per person `[model §4.1, §4.2]` |
| POST | `/people/searches/{playId}/run` | Run an existing Play | `requestId*`, `sequenceId?` | 201 as above | |
| GET | `/people/reviews/{batchId}` | Read a review batch | — | `batch { id, status draft\|sample_ready\|approved\|imported\|rejected, proposedCount, approvedCount, importedCount }`, `target`, `candidates[] { id, person, title, company, linkedinUrl, location, matchReason, evidence, linkedinVerified, recentActivityAt, decision }` | `[model §1.12, §1.13]` |
| POST | `/people/reviews/{batchId}/decisions` | Record decisions, optionally enroll | `decisions*[1..100] { candidateId*, decision* good_fit\|not_a_fit, sequenceId?, feedbackReason, feedbackNote }`, `sequenceId?`, `finish?`, `requestId?` | `batch`, `candidates[]`, `summary { approvedCount, rejectedCount, addedCount, duplicatesSkipped, alreadyInvitedCount }`, `addedLeadIds` | `finish: true` requires all decided (409 `all_candidates_require_a_decision`) |
| GET | `/signals` | Signals catalog | — | `[{ name, title, status, description, delivery }]` | Only `hiring.job_observed` is `available` `[signals-api]` |
| POST | `/signals/events` | Read hiring events | `name*`, `filters { roles[≤10], companyDomains[≤20], minHeadcount, maxHeadcount }`, `start recent\|now`, `cursor`, `limit 1–100` | `events[] { eventId, name, timestamp, data { company, job, source, observedAt, providerIndexedAt, publishedAt }, cursor }`, `cursor`, `hasMore`, `truncated`, `nextPollMs`, `billing.energyCharged`, `coverage` | Read-only POST; body ≤8 KB; cursor 7-day expiry → 410 `[signals-api]` |
| POST | `/people/enrich` | Enrich one person | exactly one of `email` / `linkedin (≤1500)`, `find[] x\|work_email` | `{ id, person {...} \| null, missing { field: not_found\|energy_exhausted\|unavailable }, energyUsed }` | Body ≤4 KB; not idempotent; not cached `[people-api]` |

### 2.8 Account

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| GET | `/workspaces` | Accessible workspaces | (no delegation header) | `workspaces[] { id, name, role owner\|admin\|member }` | Call first with a Team key `[model §0]` |
| GET | `/x/accounts` | Connected X identities | — | `accounts[] { userId (string), handle }` | |
| GET | `/x/readiness` | Account, billing, Energy state | — | `{ workspaceId, asOf, accounts, billing, energy (each { state complete\|partial\|unavailable, observedAt, data, issues[] }), providerHealthChecked: false, deliveryGuaranteed: false, note }` | Does not contact X `[model §1.4]` |
| GET | `/energy` | This period's Energy | — | `{ enabled, used, remaining, periodStart, costs, centsPerEnergy }`; `{ enabled: false }` when not metered | Not a reservation `[oa-cond: GET /energy]` |
| GET | `/linkedin/accounts` | LinkedIn senders | `limit 1–100`, `cursor`, `status connected\|disconnected` | `accounts[] { id, displayName, status, pictureUrl, connectedAt, timezone, proxyCountry }`, `inmailEnabled`, `nextCursor`, `hasMore` | `[api-guide: LinkedIn senders]` |
| GET | `/linkedin/accounts/{accountId}/inmail-credits` | Live InMail balance | — | `{ accountId, checkedAt, credits { premium, recruiter, salesNavigator } }` | null ≠ zero; 409 `account_unavailable`; 429 + `Retry-After`; 502 |
| GET | `/linkedin/accounts/{accountId}/sending-limits` | Daily cap and warm-up | — | `{ dailyInviteCap 1–30, mode warmup\|outreach, warmup { startedAt, isWarming, daysRemaining, ramp[] }, effectiveDailyCapToday, invitesSentToday, remainingToday, workspaceDailyInviteCapTotal, limits }` | `[model §1.3, §10.2]` |
| PATCH | `/linkedin/accounts/{accountId}/sending-limits` | Set cap or mode | `dailyInviteCap`, `mode`, `acknowledgeEarlyGraduation` | same | 409 `warmup_in_progress` |

### 2.9 Manual review (X Plays)

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| GET | `/x/plays` | X Plays and revisions | — | `plays[] { id, name, status, revision, sequenceId, accountUserId, reviewApiEnabled, autopilot }` | |
| GET | `/plays/{id}/candidates` | Page through review candidates | `filter all\|unreviewed\|good_fit\|not_a_good_fit`, `after`, `limit ≤200` | `candidates[] { id, xUserId, username, name, status proposed\|approved\|imported\|rejected, review }`, `counts`, `play`, `sequence`, `reviewUrl`, `nextCursor` | |
| GET / POST | `/plays/{id}/candidates/lookup` | Find existing candidate(s) by X identity | `xUserId` / `xUsername` (batch on POST) | `{ exists, candidate, enrolledInPlay, currentFollowerStatus, existingLeads[] }` | |
| POST | `/plays/{id}/import` | Import external X ids for review | `requestId*`, `xUserIds[1..100]` unique | per-id `imported \| existing_candidate` | Atomic; `requestId` scoped to workspace+Play |
| POST | `/plays/{id}/enroll` | Approve candidates into the sequence | `expectedRevision*`, `sequenceId*`, `sequenceRevision*`, `candidateIds*[1..200]` | per-id `enrolled \| existing_lead \| already_reviewed \| rejected` | Requires `reviewApiEnabled`, non-autopilot `[model §5.3]` |

### 2.10 Partner (`/api/partner/v1`)

| Method | Path | Purpose | Key request fields | Key response fields | Notes |
|---|---|---|---|---|---|
| POST | `/signup` | Create a partner account | `email*`, `company*`, `website`, `acceptedPolicies*` | 201 `{ apiKey (once), mcpUrlTemplate, freeLeads, accountUrl, usersUrl, docsUrl }` | No browser step |
| GET / PATCH | `/account` | Partner account, capabilities, usage / set brand, redirect URLs, REST policy | `brandName (1–60)`, success/failure URLs | `enterprise { linkedinConnect, outreach }`, `billing.status metered\|billing_required\|free` | 403 `enterprise_required` until enabled |
| GET / POST | `/users` | List / create end-user workspaces | `externalUserId* (≤120, [A-Za-z0-9_.:@-])`, `name`, `monthlyLeadCap` | `{ externalUserId, status active\|disabled, mcpUrl: https://mcp.pumpgtm.com/mcp/u/{externalUserId}, rest, outreach enabled\|disabled }`; 201 created / 200 existing | Idempotent create |
| GET / PATCH / DELETE | `/users/{externalUserId}` | Read / cap or reactivate / disable | `monthlyLeadCap`, `status` | user | DELETE pauses sequences; requests then 403 `user_disabled` |
| GET | `/users/{externalUserId}/linkedin/accounts` | End user's LinkedIn accounts | — | `accounts[] { id, externalUserId, status connected\|disconnected\|pending\|failed, ... }` | |
| DELETE | `/users/{externalUserId}/linkedin/accounts/{accountId}` | Disconnect one | — | ok | 503 `disconnect_failed` |
| POST / GET | `/users/{externalUserId}/linkedin/connect-links` | Mint / list hosted connect links | `expiresInMinutes 10–43200` (default 7 days) | `{ id, url, status pending\|connected\|expired\|revoked, expiresAt }` | Single use; open in a popup, never an iframe; ≤10 open per user; poll every 3 s |
| GET / DELETE | `/users/{externalUserId}/linkedin/connect-links/{linkId}` | Poll / revoke | — | status | Revoke only while `pending` (409 `connect_link_not_pending`) |

## 3. MCP tool catalogue (70 names OBSERVED in `[card]`; one-line purposes paraphrased from the card descriptions and `[mcp-docs]`)

Server facts: `com.pumpgtm/mcp` v2.0.0, protocol 2025-06-18, streamable-HTTP at `https://mcp.pumpgtm.com/mcp`, OAuth2 required with authorization server `https://app.pumpgtm.com` (OAuth 2.1, DCR + PKCE, 30-day access / 90-day refresh) or workspace-key bearer at `https://app.pumpgtm.com/api/v1/mcp`; `tools.listChanged: false`; every tool takes optional `workspaceId`; "up to 38 tools, depending on the workspace's features" load for one client; result = one JSON text block mirrored in `structuredContent` with a `next` hint `[card]`, `[mcp-docs: Connect, How results come back]`. Discrepancy OBSERVED: card lists 70, the docs page says 69 generated on 2026-11-10 plus `get_linkedin_inmail_credits` in prose `[model §12]`.

Class column is from the permissions table `[mcp-docs: Tool permissions]`: R = read, W = write (records only), SW = sensitive write (contacts a third party, acts in public or spends money).

### 3.1 Workspace / setup

| Tool | Class | Purpose |
|---|---|---|
| `get_workspace` | R | Start here: readiness, connected senders, running Plays/sequences, attention items, `next` step; views `summary, activity, x_posts, suggested_plays, search_methods, playbook, play_library, case_studies` |
| `preview_workspace_setup` | R | Draft company profile + setup answers, reviewed server-side; returns `reviewToken` (owner/admin only) |
| `save_workspace_setup` | W | Save the exact reviewed payload with its `reviewToken`; returns setup revision |
| `plan_campaigns` | R | List standard campaigns buildable from setup answers (channels, needs, already built) |
| `build_campaigns` | W | Build chosen campaigns as Plays with draft messages; `expectedRevision` = setup revision |
| `check_campaign` | R | Size-check a proposed campaign (≤3 counted checks/day, no Energy, saves nothing) |
| `get_webhook_play_setup` | R | Setup instructions for HubSpot form or generic Webhook Plays |

### 3.2 People search / review

| Tool | Class | Purpose |
|---|---|---|
| `find_people` | SW | Create/revise a Play from targeting, a list, a template or an account list; `confirmed: true` runs it (background `operationId`) |
| `get_people_search` | R | Poll a search by `operationId` or read a saved Play |
| `review_people` | SW | Read a review batch or record `good_fit`/`not_a_fit` decisions; good fits enter the sequence |
| `search_known_people` | R | Search previously observed professional profiles (≤20) |
| `get_lead_profile` | R | Source-dated identities, employment history, activity and relationship observations for a lead |
| `research_competitor` | SW | Paid background research of a competitor's customers from its public case studies |
| `reach_universe` | SW | Take account-universe people into an email campaign or LinkedIn sequence |
| `add_to_sequence` | SW | Add universe people to a sequence (templates `inmail, linkedin, email, x, linkedin_email, linkedin_email_parallel, all_channels, branching_flow`) |

### 3.3 Sequences

| Tool | Class | Purpose |
|---|---|---|
| `list_sequences` | R | Sequences with executionModel, steps, approval state, status, enrolled counts |
| `save_sequence_draft` | SW | Create or edit a sequence draft (LinkedIn, email, X steps); flagged sensitive because the saved sequence can be live |
| `set_sequence_status` | SW | `approved` (with `expectedRevision`), `active`, `paused`, `draft`; also legacy email campaigns |
| `sequence_email_settings` | W | Read or set a sequence's inboxes, schedule, daily limit, `unsubscribeFooter`; reports `plainTextEmail` |
| `write_cold_email` | R | Writing rules, three-follow-up plan, connection-note rule |
| `get_cold_message_examples` | R | Random sample of liked public posts about cold messaging |

### 3.4 Leads

| Tool | Class | Purpose |
|---|---|---|
| `list_leads` | R | Leads with `stage` (cumulative) and `stageExact`, filters, waiting-for-input and per-person file state |
| `add_leads` | SW | Add LinkedIn URLs, CSV, Sales Navigator list or contacts to one approved sequence |
| `remove_leads` | W | Stop leads by id, by `batchId`, or block companies (do-not-contact) |
| `undo_remove_leads` | SW | Restore exact `removalIds` |
| `set_lead_input` | SW | Store a per-person value or file that releases a held `customer_input` step |
| `preview_move_leads` | R | Eligibility for moving ≤500 untouched leads |
| `move_leads` | W | Schedule the move after a 5-second window (`operationId`) |
| `get_lead_move` | R | Read a move operation |
| `cancel_lead_move` | W | Cancel inside the 5-second window |
| `get_lead_thread` | R | Read a lead's LinkedIn conversation using the original sender |

### 3.5 Replies

| Tool | Class | Purpose |
|---|---|---|
| `list_pending_replies` | R | Replies frozen for review (linkedin, instagram, x) with drafts and `allowedDecisions` |
| `decide_reply` | SW | Apply one decision: `send, invite, booking_link, snooze, start_sequence, meeting_booked, dismiss, opt_out` |

### 3.6 X Plays and X account

| Tool | Class | Purpose |
|---|---|---|
| `reach_post_engagers` | SW | LinkedIn or X post URL (or own followers / every post) + message or sequence → Play |
| `x_account` | SW | Follow, unfollow, like or repost as the connected X account |
| `list_x_plays` | R | X Plays with revision, audience summary, review URLs |
| `create_x_play` | W | Buying-intent Play from one signal (`competitor_followers, competitor_post_engagers, asks, complaints, reddit`) |
| `edit_x_play` | W | Change name, audience rules, signal fields or sequence (`expectedRevision`) |
| `set_x_play_status` | SW | Pause/resume or toggle `autopilot` |
| `get_x_play_review` | R | Batch of candidates with `intent.score`/`tier`, signals and judge notes |
| `review_x_play_candidates` | SW | Record fit decisions for ≤200 candidates; good fits enrolled |

### 3.7 Signals

| Tool | Class | Purpose |
|---|---|---|
| `list_signal_types` | R | Signals catalog (only `available` types callable) |
| `list_signal_events` | R | Hiring observations from the shared index (same args as REST); experimental `events/poll` also exists |

### 3.8 People data (uses Energy)

| Tool | Class | Purpose |
|---|---|---|
| `enrich_person` | SW | One person by email or LinkedIn URL; optional X and work email |
| `find_work_email` | SW | Verified work email from a LinkedIn URL |
| `find_phone_number` | SW | Mobile number from LinkedIn URL or email (~10 Energy when found) |

### 3.9 Analytics / Energy

| Tool | Class | Purpose |
|---|---|---|
| `get_analytics` | R | Same report as `GET /analytics` |
| `energy` | R | Balance, per-action costs, month use, renewal; `estimate` planned work |
| `buy_energy` | SW | Payment link for Energy packs (1–100 packs) after the customer agrees |
| `set_auto_top_up` | SW | Toggle automatic top-up ($10/75 when balance < 50) |

### 3.10 CRM (feature-gated)

| Tool | Class | Purpose |
|---|---|---|
| `get_pipeline` | R | Opportunities with company, stage, value, forecast, totals per currency |
| `get_company` | R | Customer 360: company, success plan, contacts, opportunities, timeline |
| `save_company` | W | Create (`expected_revision=0`) or revise a CRM company |
| `save_opportunity` | W | Create or revise a deal |
| `add_company_contact` | W | Link a person (optionally an existing lead) to a company |
| `record_customer_signal` | W | Append `note, meeting, reply, product_engagement, risk, milestone` to a company timeline |

### 3.11 AI search / AEO (feature-gated)

| Tool | Class | Purpose |
|---|---|---|
| `get_ai_search_overview` | R | How often AI answer engines name the company for tracked buyer questions |
| `get_ai_search_topics` | R | Up to 5 pages the company could write to get named |
| `get_ai_search_question` | R | One tracked question with its latest answer per engine |
| `get_ai_search_answer` | R | One engine answer in full (≤20,000 chars) with citations |
| `start_website_scan` | W | Start AEO from the website (sitemap + main pages) |
| `suggest_ai_search_questions` | W | Suggest ~12 buyer questions and likely competitors (one model call) |
| `add_ai_search_questions` | W | Track questions (≤50 total) |
| `remove_ai_search_question` | W | Stop tracking one question |
| `update_ai_search_settings` | W | Engines, competitors, brand aliases/domains, cadence, `dailyLimitUsd` 0–1000 |
| `run_ai_search_check` | SW | Ask engines now (Energy per answer) |
| `stop_ai_search_checks` | W | Pause scheduled checks and cancel pending answers |
| `start_content_audit` | W | Audit own content for AI answerability (≤30 pages) |
| `get_content_audit` | R | Latest audit progress and page scores |

### 3.12 Misc

| Tool | Class | Purpose |
|---|---|---|
| `get_linkedin_inmail_credits` | R | Live InMail balance for one sender UUID |

Count check: 7 + 8 + 6 + 10 + 2 + 8 + 2 + 3 + 4 + 6 + 13 + 1 = 70.

Not on MCP (OBSERVED `[mcp-docs: Not on this server yet]`): partner/client workspace management and webhook management are REST-only.

## 4. Webhook event catalogue and signature scheme

OBSERVED `[api-guide: Webhooks]`, `[model §8]`:

| Event | When | `data` |
|---|---|---|
| `reply.received` | Prospect replied; sequence froze | `replyId, lead, classification, theirMessage, draft` (X: `channel: "x"`, `classification`/`draft` null) |
| `lead.invited` | Connection request sent | `lead` |
| `lead.accepted` | Connection accepted | `lead` |
| `lead.messaged` | LinkedIn message/follow-up or X DM sent | `lead` (+ `channel: "x"`) |
| `lead.emailed` | Email step sent | `lead` |
| `lead.meeting_booked` | Meeting recorded | `lead` |
| `x.followed` | Someone followed a connected X account | `account, follower, outcome staged\|filtered\|no_sink` |
| `x.intent_detected` | X Play scored buying intent | `play, person, score, tier, reasons, signals, fit` |
| `x.competitor_follower` | Person follows a named competitor | `play, person, signal` |
| `linkedin.connected` | LinkedIn account connected (incl. partner connect link) | `account {id, displayName}, connectLink {externalUserId, ...}` |
| `linkedin.disconnected` | Account disconnected | `account` (+ `source provider\|dashboard\|api`) |
| `linkedin.limited` | Invite hold after a decline | `account, reason: invite_limit, heldSince, retryAt, attempt 1..3` |
| `linkedin.resumed` | Hold lifted | `account, resumedAt, warmupRestarted: false` |
| `linkedin.watched_post` | Watched profile posted | `profile, post` |
| `ping` | Test endpoint called | `webhookId, message` |

`lead` = `{ id, person, company, title, email, linkedinUrl, account, sequenceId, stage }`.

Delivery: JSON POST `{ id, event, createdAt, data }`; headers `X-PumpGTM-Event`, `X-PumpGTM-Delivery` (event id, constant across attempts; dedupe on it), `X-PumpGTM-Signature: t=<unix seconds>,v1=<64 hex>` where `v1 = HMAC-SHA256(secret, t + "." + rawBody)`; reject when `|now - t| > 300 s`; verify with a constant-time compare on the raw bytes before JSON parsing (Node and Python examples given). Receiver: HTTPS on 443, public IPv4 DNS, no IP literals / credentials / fragments / redirects; respond 2xx within 10 s. Retries: timeout, network error, 429 or 5xx → retried twice at 1 s and 4 s with the same delivery id; other non-2xx ends delivery; "no replay queue yet", reconcile by polling `/leads` and `/activity`. Limits: ≤10 enabled hooks per workspace, 1–15 events each, URL ≤2000 chars.

## 5. Observed internal app endpoints (not public API)

OBSERVED in the statically analysed onboarding bundle `[fetch]` and route constants `[routes]`. These are first-party Next.js route handlers under `app.pumpgtm.com/api/...`, distinct from `/api/v1`. Static presence does not prove runtime use `[fetch: limitations]`; purposes are INFERRED from names and nearby UI copy.

| Endpoint | Inferred purpose | Source |
|---|---|---|
| `/api/auth/sign-in-code` | Email one-time sign-in code | `[fetch]`, `[ui:388,408]` |
| `/api/onboarding/company`, `/api/onboarding/company-profile`, `/api/company-profile` | Save / read the company profile during onboarding | `[fetch]` |
| `/api/onboarding/setup-review`, `/api/onboarding/setup-campaign`, `/api/onboarding/sequence`, `/api/onboarding/sequence-proposal` | Setup review (cf. MCP `preview_workspace_setup`), campaign and sequence proposals | `[fetch]`, `[routes]` |
| `/api/onboarding/lead-sample`, `/api/onboarding/lead-source`, `/api/onboarding/network-leads` | Sample leads for a chosen audience, lead source selection, "people your connections know" | `[fetch]`, `[ui:1092,1096]` |
| `/api/onboarding/connections` | Connected channel status during onboarding | `[fetch]` (4 call sites) |
| `/api/onboarding/email-sender`, `/api/email/mailboxes` | Mailbox connection and listing | `[fetch]` |
| `/api/onboarding/mcp-credential` | Issue / show the workspace key for AI clients | `[fetch]`, `[ui:508]` |
| `/api/onboarding/activation/start`, `/api/onboarding/play/enroll` | Start the trial activation; enroll the curated "YC investor" play | `[fetch]`, `[ui:1094,1171]` |
| `/api/onboarding/context/claim`, `/api/onboarding/gigacatalyst/claim`, `/api/onboarding/gigacatalyst/handoff/claim` | Claim a preview/handoff context (the MCP server's internal name appears to be "gigacatalyst", cf. `gigacatalyst://` resources) | `[routes]`, `[mcp-docs: Resources]` |
| `/api/billing/checkout`, `/api/billing/checkout/failure`, `/api/billing/setup`, `/api/billing/resume`, `/api/billing/exit-offer` | Stripe checkout session, failure handling, billing setup, resume after pause, exit-offer discount | `[fetch]`, `[routes]`, `[ui:505]` |
| `/api/campaign/leads`, `/api/campaign/sequence`, `/api/campaign/parse-pdf` | Campaign builder: leads, sequence, PDF parsing (INFERRED: upload a deck/one-pager to seed messaging) | `[fetch]`, `[routes]` |
| `/api/unipile/custom-auth`, `/api/unipile/custom-auth/instagram` | Vendor custom-auth bridge for LinkedIn and Instagram | `[routes]` |
| `/api/integrations/x/authorize` | Start the X OAuth flow | `[routes]` |
| `/api/sequences/attachments` | Step-level attachment upload (not in public API; `[model §3.10]` notes no public upload endpoint) | `[fetch]` |
| `/api/gifts/recipients`, app route `/gifts/designs/new` | Physical gifting ("cakes") feature | `[fetch]`, `[ui:202]`, `[ev §14]` |
| `/api/notifications/preferences` | Notification settings | `[fetch]` |
| `/api/broadcast` | Unknown; name suggests cross-tab or realtime broadcast | `[routes]` |
| App pages: `/onboarding`, `/onboarding/verify-email`, `/onboarding/done-for-you`, `/overview`, `/leads`, `/plays/new`, `/billing`, `/install-mcp`, `/accounts/email` | Primary app navigation | `[routes]` |

## 6. Energy price table (OBSERVED; two sources disagree on pack price)

| Action | Energy | Source |
|---|---|---|
| Person found by people search and returned to review | 2 | `[api-guide: Energy]`, `[model §10.4]` |
| Liker or follower staged from an X Play | 1 | same |
| X DM including thread check | 5 | same |
| X DM from a sequence with thread check off / X reply | 0.6 | same |
| X follow, unfollow, like or repost | 1 each | same |
| People-data enrichment | per lookup: 2× provider cost rounded up to 0.1; profile ≈1, X lookup ≈0.2, mobile ≈10 when found; no-match usually free | `[people-api]`, `[model §10.4]` |
| Signals index reads | 0 (developer preview) | `[signals-api]` |
| LinkedIn actions, email sends, sequences, replies, webhooks | 0 | `[api-guide: Energy]` |
| Unit price | 1 Energy = $0.05 (`centsPerEnergy`) | `[people-api]`, `[oa-cond: GET /energy]` |
| Plan allowance | 1,500 (Starter) / 4,000 (Hypergrowth) per seat per month | `[mcp-docs: How results come back]` |
| Packs | "$10 for 100 Energy" `[api-guide]` vs "$10 for 75" `[card: set_auto_top_up]`, `[model §10.4]` — unresolved | |
| Auto top-up | $10 pack when balance < 50; Energy lasts 12 months | `[model §10.4]` |
| Partner metering | 50 free leads, then 403 `billing_required`; 2 per person from the partner pool; `monthlyLeadCap` → 403 `user_lead_cap_reached` | `[api-guide: Partners]` |

## 7. AREVEI API design decisions

All items in this section are ASSUMPTION (our design), with the PumpGTM observation we are borrowing from cited where relevant.

### 7.1 What we adopt

| Pattern | Adopted form | Borrowed from |
|---|---|---|
| Idempotency | `requestId` body field, same regex `^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$`; required on every write that spends credits or contacts a person; same id + same body → replay with `replayed: true`; same id + different body → 409 `idempotency_conflict`; stored 7 days | `[api-guide: Retries]` |
| Concurrency | integer `revision` on campaigns, sequences, ICPs and searches; writes send `expectedRevision`; stale → 409 `revision_conflict` with `currentRevision` in the body | `[model §1.8]` |
| Pagination | cursor only: `?limit=&after=` → `{ items, nextCursor }`; no offset endpoints; cursors are opaque, workspace-bound and expire after 24 h (410 `cursor_expired`) | `[model §10.6]`, `[signals-api]` |
| Signed webhooks | `t=,v1=` HMAC-SHA256 over `t + "." + rawBody`, 300 s tolerance, dedupe on delivery id; events listed in `integration-analysis.md §2.13` | `[api-guide: Webhooks]` |
| Error envelope | `{ error: <code>, message, issues?, resource?, retryAfterSeconds?, currentRevision? }` with the same status semantics table as §1.5; 409 always means "nothing changed" | `[api-guide: Retries]` |
| Versioning | `/api/v1` path major; additive-only within v1; `Deprecation: true` + `Sunset` ≥90 days | `[api-guide: Versioning]` |
| Tenancy headers | bearer workspace key only in v1; `X-Arevei-Workspace` reserved for team delegation later; never both delegation headers | `[api-guide: Authentication]` |
| Side-effect metadata | every operation tagged `x-arevei-side-effect: read \| write \| sensitive_write` in OpenAPI, reused later for MCP hints | `[mcp-docs: Tool permissions]` |
| Approval gate | nothing is sent by an API call itself; sends happen in a paced worker once a sequence is `active` and the person is enrolled | `[mcp-docs: How results come back]` |
| Reserve-then-settle metering | paid provider calls reserve credits first and settle after; `creditsUsed` on every paid response | `[people-api]` |

### 7.2 Proposed v1 REST surface (`/api/v1`)

| Resource | Endpoints | Notes |
|---|---|---|
| Workspaces | `GET /workspaces`, `GET /workspaces/{id}`, `PATCH /workspaces/{id}` (name, timezone, booking_url, plain_text_email, unsubscribe_footer), `GET /workspaces/{id}/members`, `POST /workspaces/{id}/members`, `DELETE /workspaces/{id}/members/{userId}`, `GET /workspaces/{id}/api-keys`, `POST /workspaces/{id}/api-keys`, `POST /workspaces/{id}/api-keys/{keyId}/rotate`, `DELETE /workspaces/{id}/api-keys/{keyId}` | Roles `owner\|admin\|member` |
| ICPs | `GET/POST /icps`, `GET/PUT/DELETE /icps/{id}`, `POST /icps/infer` (from website or customer list → draft ICP via LLM) | Targeting schema modelled on `[model §4.1]` hard filters |
| Leads | `GET /leads`, `POST /leads` (contacts / csv, ≤500), `GET /leads/{id}`, `PATCH /leads/{id}`, `POST /leads/remove`, `POST /leads/undo-remove`, `DELETE /leads/{id}` (only removed + no history), `POST /leads/{id}/enrich`, `GET /leads/{id}/timeline` | Stage enum `queued, resolving, invited, accepted, messaged, followed_up, replied, meeting_booked, failed, skipped, opted_out` (MCP vocabulary `[model §2.2]` plus `meeting_booked`, `opted_out`) |
| Searches | `POST /searches` (`run: false` prepares, `run: true` spends credits; `requestId` required when running), `GET /searches/{id}`, `POST /searches/{id}/run`, `POST /searches/{id}/count`, `GET /searches/{id}/candidates`, `POST /searches/{id}/decisions` (`good_fit\|not_a_fit`, `finish`) | Mirrors `[model §4.2, §4.3]` |
| Signals | `GET /signals/types`, `POST /signals/events` (read-only POST with filters + cursor), `GET/POST /signals/watches`, `DELETE /signals/watches/{id}` | Types `hiring.job_observed`, `funding.announced` in v1 |
| Campaigns | `GET/POST /campaigns`, `GET/PATCH /campaigns/{id}`, `POST /campaigns/{id}/leads` (≤500), `GET /campaigns/{id}/leads`, `POST /campaigns/{id}/webhook` (inbound signup intake with `eventId` + `dryRun`), `PATCH /campaigns/{id}/status` | "Campaign" = PumpGTM "Play" |
| Sequences | `GET/POST /sequences`, `GET/PUT /sequences/{id}` (`expectedRevision`), `PATCH /sequences/{id}/status` (`draft\|active\|paused\|archived`), `GET/PUT /sequences/{id}/email-settings`, `POST /sequences/{id}/leads`, `POST /sequences/{id}/preview` (render steps for one lead) | Step kinds v1: `connect, message, email, x_dm, wait, branch`; `engage`/`x_engage` deferred |
| Messages | `GET /messages` (outbound ledger, filter by lead/sequence/channel/status), `GET /messages/{id}`, `POST /messages/{id}/cancel` (only `scheduled`) | Status `scheduled\|sending\|sent\|failed\|cancelled\|delivery_unknown` from `[model §2.12]` |
| Conversations | `GET /conversations` (inbox; `needsYou=1`), `GET /conversations/{id}` (thread across channels), `POST /conversations/{id}/decide` (`send\|snooze\|start_sequence\|meeting_booked\|dismiss\|opt_out`, `text`, `days`, `requestId`), `POST /conversations/{id}/draft` (regenerate draft) | `invite` and `booking_link` folded into `send` with `kind` |
| Integrations | `GET /integrations`, `POST /integrations/{kind}/connect` (returns hosted URL or form spec), `POST /integrations/{kind}/callback`, `GET /integrations/{id}`, `POST /integrations/{id}/health-check`, `GET/PATCH /integrations/{id}/limits` (daily caps, warm-up mode, window), `DELETE /integrations/{id}` | Kinds `linkedin, mailbox, x, data_provider, llm` |
| Analytics | `GET /analytics?range=7d\|30d\|90d`, `GET /analytics/funnel?groupBy=sequence\|campaign\|sender`, `GET /activity?action=&outcome=&sinceDays=&after=`, `GET /credits` | Timezone is the workspace's, not a fixed one (PumpGTM fixes Pacific `[model §7.1]`) |
| Webhooks | `GET/POST /webhooks`, `GET/PATCH/DELETE /webhooks/{id}`, `POST /webhooks/{id}/test`, `GET /webhooks/{id}/deliveries`, `POST /webhooks/deliveries/{deliveryId}/redeliver` | ≤10 per workspace; create idempotent on `(url, events)` |
| Events stream | `GET /events/stream` (SSE for the UI) | Internal-facing but versioned |

### 7.3 Explicit non-goals for v1

- No Partner API, no delegated `X-*-User` header, no hosted connect links for third parties `[api-guide: Partners]`.
- No MCP server in v1 (REST first; MCP later over the same service layer) `[card]`.
- No n8n node.
- No Instagram, WhatsApp, Sales Navigator import, InMail sending, LinkedIn `engage` actions (view/like/comment/endorse) or X follow/like/repost automation.
- No scheduled replies (`sendAt`), no "held" reply approvals, no reply auto-send.
- No CRM module, no AI-search/AEO module, no account-universe/competitor research module, no physical gifting.
- No Energy-style prepaid packs via Stripe in v1; credits are an internal ledger with manual allocation.
- No fixed-timezone analytics; no visitor identification pixel; no session recording.
- No session-cookie, password-relay, proxy or browser-automation path for any channel (see `integration-analysis.md §5`).
