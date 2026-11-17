# PumpGTM API / MCP data-model notes

Compiled 2026-11-17 from the downloaded evidence (treated as untrusted data). Source keys used in citations:

- `[oa]` = `evidence/openapi-condensed.md` (condensed OpenAPI 3.1; endpoint paths are relative to `https://app.pumpgtm.com/api/v1`, partner routes to `/api/partner/v1`)
- `[api]` = `evidence/md/app_docs_api.md` (full REST reference with JSON schemas; same endpoints, with min/max/pattern detail)
- `[guide]` = `evidence/md/markdown_pages_docs_api.md` (human REST guide: webhooks table, Energy table, error table)
- `[mcp]` = `evidence/md/markdown_pages_docs_mcp.md` (MCP tool reference, 69 tools listed + `get_linkedin_inmail_credits` in prose)
- `[card]` = `evidence/md/.well-known_mcp.json` (MCP server card: 70 tool names, descriptions, annotations; NO input schemas)
- `[mcp.md]` = `evidence/md/mcp.md`; `[quickstart]` = `evidence/md/agent-quickstart.md`; `[docs-quickstart]` = `evidence/md/markdown_pages_docs_quickstart.md`
- `[signals-api]`, `[people-api]`, `[signals-mcp]`, `[people-mcp]` = the corresponding `evidence/md/markdown_pages_docs_*.md`
- `[safety-blog]` = `evidence/md/markdown_pages_blog_is-linkedin-automation-safe-pumpgtm-account-protection.md`
- `[x-play-page]` = `evidence/md/markdown_pages_plays_x-automation.md`; `[li-email-page]` = `evidence/md/markdown_pages_plays_linkedin-email.md`
- `[pricing.md]` = `evidence/md/markdown_pages_pricing.md`; `[integrations_linkedin.md]` / `[integrations_email.md]` = `evidence/md/markdown_pages_integrations_*.md`; `[mcp_tools.json]` / `[mcp_platforms.md]` = the 404 captures in `evidence/md/`

Conventions: `*` after a field = required in the schema. "untyped" = the schema says `additionalProperties: true` with only a prose description.

---

## 0. Platform-level facts (auth, tenancy, headers)

- Base URL `https://app.pumpgtm.com/api/v1`; Partner API `https://app.pumpgtm.com/api/partner/v1`; OpenAPI at `/openapi.json`. `[api: header]`
- Auth: `Authorization: Bearer eve_mcp_...` workspace key (same key for MCP and REST; does not expire; rotation via support). OAuth 2.1 (dynamic client registration + PKCE) for AI clients; access tokens 30 days, refresh tokens 90 days; metadata at `/.well-known/oauth-authorization-server`. `[mcp: Connect]`
- Workspace selection headers on every `/api/v1` route: `X-PumpGTM-Client` (Team owner key selects an authorized Team workspace UUID from `GET /workspaces`) and `X-PumpGTM-User` (partner key acts on one end user's workspace by `externalUserId`). Never both together (400 `invalid_request`). `[oa: every endpoint; api: Partners section]`
- `GET /workspaces` → `workspaces[] {id*, name, role enum ["owner","admin","member"]}`. `[oa: GET /workspaces]`
- MCP: every tool also takes optional `workspaceId` (Team owner acting on one of their workspaces). `[mcp: Tool reference]`
- MCP result envelope: one text content block whose text is JSON, mirrored in `structuredContent`; most results include `next: { tool, arguments, reason, requiresConfirmation, requiresNewRequestId? }`; errors `isError: true` with `{ status, retryable, changed, message, details }`; missing object → code `resource_not_found`. `[mcp: How results come back]`
- MCP resources: `gigacatalyst://lead-search/{catalog,quickstart,fields,query-builder,patterns,results}`; one prompt `gigacatalyst_find_people` with `requestedCount` ("10" to "100"). `[mcp: Resources and prompts]`
- MCP server card: `protocolVersion 2025-06-18`, name `com.pumpgtm/mcp`, version `2.0.0`, `capabilities.tools.listChanged=false`, auth `oauth2` with authorizationServer `https://app.pumpgtm.com`. `[card]`
- Experimental MCP Events (`events/list`, `events/poll`) exist for `hiring.job_observed` only; `maxEvents` 1–100, `maxAgeMs` 1–2,592,000,000; errors `invalid_cursor` / `cursor_expired`. `[signals-mcp]`

---

## 1. ENTITIES

### 1.1 Workspace
- Fields (REST): `id*`, `name`, `role` enum `["owner","admin","member"]`. `[oa: GET /workspaces]`
- `get_workspace` summary (schemaVersion 2) sections: `readyNow`, `company`, billing access, every saved LinkedIn/X/email/Instagram sender (connection, health and execution evidence), all Play types and sequence states, review coverage, period-labelled results, discovery allowance, excluded companies, the GTM profile (setup answers: proof, warm sources, ideas, channels, exclusions, goal, team; `editUrl`), `setup` with setup stage and one `nextStep {say, url}`, `attention` (e.g. `leads_waiting_for_input`, `sender_file_reconnect_required`, `company_profile_unconfirmed`), `energy {allowance, used, remaining}` (absent when workspace has no Energy), and feature-gated `legacyEmailCampaigns`. Each section returns `state`, `data`, `issues`. Lists are bounded previews with totals and `hasMore`. `[mcp: get_workspace; mcp: How results come back; mcp: set_sequence_status]`
- `get_workspace` views: `summary` (default), `activity`, `x_posts`, `suggested_plays`, `search_methods`, `playbook`, `play_library`, `case_studies`. Args: `sinceDays` 0–365 default 7; `account`; `as` (@handle); `actions[]`; `outcome` enum `ok|failed|skipped`; `limit` 1–500 default 100. `[mcp: get_workspace]`
- LinkedIn senders live at `channels.linkedin.data.senders.items[]` with `id` (UUID used as `accountId`) and `proxyCountry` (two-letter or null). `[mcp: LinkedIn sender details]`
- Relationship: Workspace 1—N Sequences, Plays, Leads, Senders (LinkedIn/X/email/Instagram), Webhooks (≤10), Energy balance; Team 1—N Workspaces.

### 1.2 Team
- Only visible via `role` on `GET /workspaces`, `X-PumpGTM-Client` delegation, and `scope=team` analytics (requires a personal OAuth or personal delegation key of a current Team owner/admin from its own home workspace; shared workspace and operator keys cannot). Analytics `team` object: `{ name, workspaces[] {id, name, enrolled, touched, invites, connections, messages, replies, meetings, mature, cohortReplies, replyRate} }`. `[oa: GET /analytics; api: GET /api/v1/analytics]`
- Team members ask the "billing owner" to buy Energy; Energy may be an "allocation" per member workspace. `[mcp: energy, buy_energy]`

### 1.3 LinkedIn account / sender
- `GET /linkedin/accounts` → `accounts[] { id* (UUID), displayName*, status* enum ["connected","disconnected"], pictureUrl*, connectedAt*, timezone*, proxyCountry* }`, `inmailEnabled*` (workspace feature flag), `nextCursor*`, `hasMore*`. Query: `limit`, `cursor`, `status` enum `connected|disconnected`. Failed/pending attempts excluded. `[oa: GET /linkedin/accounts]`
- Partner view `GET /users/{externalUserId}/linkedin/accounts` → `accounts[] { id*, externalUserId*, status* enum ["connected","disconnected","pending","failed"], displayName*, pictureUrl*, connectedAt*, timezone*, proxyCountry* }`. "treat anything but connected as not usable for sending." `[oa]`
- InMail credits `GET /linkedin/accounts/{accountId}/inmail-credits` → `{ accountId*, checkedAt*, credits* { premium*, recruiter*, salesNavigator* } }`; null = no balance supplied, never zero. Errors: 404 `account_not_found`, 409 `account_unavailable`, 429 `rate_limited` (+Retry-After), 502 `inmail_credits_unavailable`, 503. `[oa]`
- Sending limits `GET/PATCH /linkedin/accounts/{accountId}/sending-limits` → `{ accountId*, dailyInviteCap* (1–30), mode* enum ["warmup","outreach"], warmup* { startedAt*, isWarming*, daysRemaining*, ramp*[] }, effectiveDailyCapToday*, invitesSentToday*, remainingToday*, workspaceDailyInviteCapTotal*, limits* { minDailyInviteCap*, maxDailyInviteCap* } }`. PATCH body: `dailyInviteCap`, `mode`, `acknowledgeEarlyGraduation`. `[oa]`
- Identity key: UUID `id`; "Legacy account-name IDs remain accepted" for `accountId`. `[api: POST /api/v1/sequences/{id}/leads accountId]`
- Relationship: Sender 1—N Leads (lead keeps its bound sender; "Existing leads are never reassigned"). `[mcp: add_leads]`
- Pricing: "Each seat is a LinkedIn account you send from. Each LinkedIn account comes with an email inbox and an X account." `[pricing.md line 245]`

### 1.4 X account
- `GET /x/accounts` → `accounts[] { userId* (numeric string, pattern `^[1-9][0-9]{0,19}$`), handle* }`. `[oa; api]`
- `POST /x/users/resolve { username* }` → `{ status*, user* { xUserId*, username*, name*, checkedAt*, evidence* }, provider*, sendsMessages* }`; 503 with `status unknown` and `user null` when unverifiable. `[oa]`
- Handle pattern `^@?[A-Za-z0-9_]{1,15}$`; "X handles are at most 15 characters". `[api: POST /x/watches as; api: sequences/{id}/leads]`
- `GET /x/readiness` → `{ workspaceId*, asOf*, accounts*, billing*, energy* (each `{ state* enum ["complete","partial","unavailable"], observedAt*, data* (untyped/null), issues*[] {code*, message*, retryable*} }`), providerHealthChecked* const false, deliveryGuaranteed* const false, note* }`. `[oa; api]`
- `POST /x/actions { action* enum ["follow","like","repost"], target*, as }` → `{ action*, as*, username, postId, done* }`; MCP `x_account` also allows `unfollow`. `[oa; mcp: x_account]`

### 1.5 Email inbox (mailbox)
- Read/set per sequence via MCP `sequence_email_settings { sequenceId*, settings? }`: "sending inboxes, schedule, daily limit and unsubscribeFooter (off by default)"; response reports read-only `plainTextEmail` (workspace Accounts rule: when true, overrides footer, removes List-Unsubscribe headers, HTML and tracking); "Paused or disconnected inboxes remain paused or disconnected." `[mcp: sequence_email_settings]`
- Legacy email campaigns: `reach_universe channel=email` takes `campaignId`/`campaignName`, `steps[]` (plain text, `{{firstName}} {{company}} {{title}}`, `delayDays`), `schedule`, `mailboxIds[]` (UUIDs from get_workspace) or `allMailboxes`, `dailyLimit` 1–5000. `[mcp: reach_universe]`
- Microsoft mailboxes: personal file limit 1.5 MB vs 18 MB. `[api: POST /leads/{id}/input/upload]`
- Marketing: "Gmail · sending · 30 emails a day"; "Daily mailbox limits and sending windows control when messages go out"; emails are plain text with one-click unsubscribe, follow-ups in one thread. `[li-email-page lines 109-117; integrations_email.md line 43]`

### 1.6 Play
- Play is the audience/source container; a Lead "belongs to a Play" (`playId` or the sequence's implicit "list Play"). `[mcp: add_leads]`
- Play types seen: people-search (targeting) Play `[oa: POST /people/searches]`; X Play / watch (`followers|every_post|post`) `[oa: POST /x/watches]`; Buying-intent X Play (`create_x_play` signals) `[mcp]`; template Plays via `find_people.play` type keys `lookalike_accounts`, `target_accounts`, `role_at_company`, `competitor_engagers`, `new_connections`, `webhook-signups`, `hubspot-signups`, `github_stargazers` `[mcp: find_people]`; LinkedIn post-engagers / profile-watch Play `[mcp: reach_post_engagers]`; Webhook Play `[oa: POST /plays/{id}/webhook]`; competitor research Play `[mcp: research_competitor]`; named-account-list Play (`accounts`, up to 5,000 companies) `[mcp: find_people]`; founder-list Play (`list`: `yc_founders_2026_09`, `a16z_speedrun_founders_2026_10`) `[mcp: find_people]`.
- X Play fields (`GET /x/plays`): `plays[] { id*, name*, status* enum ["active","paused","archived"], revision* (≥1), sequenceId*, accountUserId*, reviewApiEnabled*, autopilot* }`. `[oa]`
- X watch fields (`POST/GET /x/watches`): `{ id*, source* enum ["followers","every_post","post"], postId*, sequenceId*, status* (string, values not enumerated), as*, peopleSeen*, waitingForReview*, createdAt*, funnel* (untyped) }`. Create body: `source*`, `postUrl` (required for `post`, `x.com/{user}/status/{id}`), `message` (≤2000) XOR `sequenceId`, `name`, `as` (handle pattern). `[oa; api]`
- MCP `list_x_plays` returns `id, name, status, revision, audience (audience.sources plain words), reviewUrl, sequenceReviewUrl`. `[mcp]`
- People-search Play: `play { id, revision }`, `plan` (with `plan.targetingSummary`), `ambiguities[]`, `companyResolution` (outcomes incl. `matched_several`, `unmatched`), `readyToRun`, `reviewUrl`, `searched`, `contacted`. `[api: POST /people/searches response; mcp: find_people]`
- Identity/concurrency: `revision` with `expectedRevision` (409 `draft_changed` on people-search; stale revision refused on X plays). `[api; mcp: edit_x_play]`
- Relationship: Play →(0..1) default Sequence (`sequenceId` / `defaultSequenceId`, "for new leads only"); Play 1—N Review batches; Play 1—N Candidates; Play 1—N Leads (`strategyId` filter in `list_leads`). `[oa; mcp: list_leads]`

### 1.7 Sequence
- Full shape: `{ id, name, status, revision, approvedAt, approvedRevision, executionBlockReason, executionModel, leadCount, channels[], steps[], updatedAt }`. `[api: POST /sequences response description]`
- List item (`GET /sequences`): `id*`, `name*`, `status*` (string), `revision*`, `approvedAt*`, `approvedRevision*`, `executionBlockReason*`, `executionModel*` enum `["linear","tracks","graph"]`, `leadCount*`, `channels*[]`, `steps*[]` (compact: `index`, `kind`, `delayDays`, `subject`, `message`, `next`, `condition`, `sendIf`, `attachments`, `actions`, `variants`, `tool` — all required keys, nullable). `[api: GET /api/v1/sequences]`
- `name` 1–160 chars. `[api: POST /sequences]`
- Create: `POST /sequences { requestId?, name*, steps*, executionModel?, xThreadCheck? }` → 201 `{ sequence*, reviewUrl*, live* }`. `[oa]`
- Replace: `PUT /sequences/{id} { requestId?, expectedRevision* (≥1), name?, steps*, executionModel?, xThreadCheck? }` → `{ update* { ok: true, replayed, sequence, live, change: { previousRevision, revision, currentRevision, previousStatus, nameChanged, stepCountBefore, stepCountAfter, changedStepIndexes, approvalInvalidated } }, reviewUrl* }`. `[api: PUT]`
- Status: `PATCH /sequences/{id}/status { status* enum ["active","paused","draft"] }` → `{ ok* true, sequenceId*, previousStatus* enum ["draft","active","paused","archived"], status* }`. `[oa]`
- `xThreadCheck` is workspace-wide (not per sequence), default off; 5 Energy per DM vs 0.6. `[api]`
- Templates for new draft via `add_to_sequence.template`: `inmail`, `linkedin`, `email`, `x`, `linkedin_email`, `linkedin_email_parallel`, `all_channels`, `branching_flow`. `[mcp: add_to_sequence]`
- Relationship: Sequence 1—N Leads (a person "still runs one sequence at a time"); Sequence has email settings; Sequence referenced by Plays. `[mcp: add_to_sequence]`

### 1.8 Sequence revision
- Integer `revision` (min 1); `approvedRevision` records which revision was approved; `expectedRevision` optimistic concurrency on PUT, `set_sequence_status approved`, `POST /sequences/{id}/leads` (optional on contacts), `POST /plays/{id}/enroll` (`sequenceRevision`), `review_x_play_candidates` (`sequenceRevision`). Changing content invalidates approval (`approvalInvalidated`). `[api: PUT; oa; mcp]`

### 1.9 Step
- Fields: `stepIndex` (0–29; must match array index), `kind*` enum `["connect","message","engage","email","x_dm","x_engage","instagram_dm","branch"]`, `delayDays*` (0–30), `subject` (1–200; email), `messageTmpl` (1–8000), `sendIf` enum `["followed_back","not_followed_back"]` (x_dm only), `next` (`{next: i|null}` or `{yes: i|null, no: j|null}`), `condition` enum `["linkedin_accepted","x_followed_back","has_email","linkedin_first_degree"]` (branch only), `attachments[]` (≤5; `{id* uuid, name*, size* ≥1}`; LinkedIn message steps), `actions[]` (≤10; `{type* enum ["follow","unfollow","view_profile","like_last_post","endorse_first_skill","comment_last_post"], count 1–3, reaction enum ["like","celebrate","support","love","insightful","funny"], guidance ≤1250, text ≤1250 (deprecated alias of guidance)}`), `variants[]` (≤10), `tool` (object with `kind` enum `["customer_input","sendspark"]`). Required: `kind`, `delayDays`. `[api: POST /sequences request schema]`

### 1.10 Step variant (A/B)
- `variants[] { key* (1–5 chars), weight* (1–10000), messageTmpl (≤2000) }`, max 10 per step. "a message needs messageTmpl or text on every variant". Analytics `messages[].variant` and `/reports/funnel.experimentArms` expose results. `[api: POST /sequences; api: intro; oa: GET /analytics, GET /reports/funnel]`

### 1.11 Lead
- Identity: `id` (uuid). Dedup keys: LinkedIn profile URL, email, X handle ("people already known by LinkedIn profile, email or X handle are counted in duplicatesSkipped"; "skips existing identities across all channels"). `[api: POST /sequences/{id}/leads; mcp: add_leads]`
- `GET /leads` item: `id*`, `person` (untyped), `removal*` (`{id, removedAt, undoAfter}` or null) plus, per description, "identity, account, sequence, stage, milestones, reply sentiment, last error and removal metadata". `[oa; api: GET /leads/{id}]`
- `GET /plays/{id}/leads` item: `{ id*, name*, linkedinUrl*, email*, xUserId*, username*, sequenceId*, stage*, createdAt* }`. `[oa]`
- MCP `list_leads` adds `stage` (cumulative) vs `stageExact` (current), `channel`, `waitingFor` keys, `waitingForFiles`, `waitingSince`, per-person file state `waiting|ready|sent|closed`. Filters: `leadId`, `stage`, `stageExact`, `sequenceId`, `strategyId` (Play), `query`, `engagedOnly`, `bookedOnly`, `waitingForInput`, `personalFiles` (25/page, `page` 0–400), `sinceDays` 0–365, `limit` 1–500 (default 100). `[mcp: list_leads]`
- Input lead shape (`contacts`): `person*` (1–200), `company` (≤200), `title` (≤200), `linkedinUrl` (≤500, "Public LinkedIn /in/ profile URL"), `email` (≤320), `xUsername` (≤500, handle or x.com URL). `manual`: `linkedinUrl*` (1–500), `person`, `company`, `title`, `customFields` (keys `^[a-z][a-z0-9_]{0,39}$`, values ≤1000). `[api]`
- X lead (`GET /x/leads/{id}`): `{ id*, xUserId*, username*, accountUserId*, playId*, sequenceId*, stage* (string), automationStopped*, currentStep*, nextActionAt*, followedAt*, followedBackAt*, messagedAt*, repliedAt*, optedOutAt*, deliveryGuaranteed* const false }`. `[oa; api]`
- Webhook `lead` object: `{ id, person, company, title, email, linkedinUrl, account, sequenceId, stage }`. `[guide: Webhooks]`
- `invitePriority` 0–1000 (default 0) per add request. `[api]`
- Relationship: Lead → Sequence (0..1), Play (0..1), Sender account (0..1), Removal (0..1 current), Thread (LinkedIn), Replies, Scheduled replies, Input values/files, CRM contact link (`lead_id`). `[oa; mcp]`

### 1.12 Candidate (review candidate)
- People-search candidate: `{ id, person, title, company, linkedinUrl, location, matchReason, evidence, linkedinVerified, recentActivityAt, decision: undecided | approved | rejected, sequenceId }`. `[api: GET /people/reviews/{batchId}]`
- X Play candidate (`GET /plays/{id}/candidates`): `{ id*, xUserId*, username*, name*, status* enum ["proposed","approved","imported","rejected"], review* }`; `GET` response also `counts* { total*, unreviewed*, goodFit*, notAGoodFit* }`, `play* { id*, name*, revision*, status* }`, `sequence* { id, name, revision, status, approved }`, `reviewUrl*`, `nextCursor*`. Filter enum `["all","unreviewed","good_fit","not_a_good_fit"]`. `[oa; api]`
- X Play review candidate via MCP adds `evidence`: `intent.score` 0–100, `intent.tier` (`hot` ≥65, `warm` ≥35, `watching`), `signals[]` (plain line + post excerpt/link), `judge` (daily criteria check). `[mcp: get_x_play_review]`
- Lookup result: `{ exists*, candidate*, enrolledInPlay*, currentFollowerStatus*, existingLeads*[] {id*, sequenceId*, playId*, stage*} }`. `[oa: GET/POST /plays/{id}/candidates/lookup]`
- Account-universe candidate: `candidateIds` "as shown in review_people candidates", cited to source page. `[mcp: reach_universe, research_competitor]`

### 1.13 Review batch
- `{ batch: { id, status: draft | sample_ready | approved | imported | rejected, planId, planRevision, proposedCount, approvedCount, importedCount, ... }, target, candidates[] }`. `[api: GET /people/reviews/{batchId}]`
- Decisions: `POST /people/reviews/{batchId}/decisions { decisions*[1..100] { candidateId*, decision* enum ["good_fit","not_a_fit"], sequenceId?, feedbackReason (1–120), feedbackNote (≤1000) }, sequenceId?, finish? (default false), requestId? }` → `{ batch, candidates[], reviewUrl?, contacted: false }` + on finish `summary { approvedCount, rejectedCount, addedCount, duplicatesSkipped, alreadyInvitedCount }, addedLeadIds, addedLeads, sequences`. `[api]`
- MCP `review_people`: each `good_fit` is enrolled at once; `finish` only closes the review; returns added/skipped/duplicate counts + `reviewUrl`. `[mcp: review_people]`
- Webhook-Play intake also produces `batchId` + `candidateId` with status `review` or `queued`. `[api: POST /plays/{id}/webhook]`

### 1.14 Reply (pending reply)
- `GET /replies?limit` → `replies[]` (untyped). MCP item fields: `id` (= `draftId`, present when a draft exists), `channel` (`linkedin`, `instagram`, `x`; REST also email), `lead`, `leadId`, `theirMessage` (null when unreadable), `draft`, `allowedDecisions[]`, `messageUnavailable` (`x_chat_passcode_required` | `x_chat_passcode_changed`), `unlockUrl`, `replyUrl`. `[oa: GET /replies; mcp: list_pending_replies]`
- Webhook `reply.received` data: `replyId, lead, classification, theirMessage, draft` (X: `channel: "x"`, `classification` and `draft` null). Classification values are NOT enumerated anywhere in the evidence. `[guide: Webhooks]`
- Lead holds "reply sentiment" (values not enumerated). `[api: GET /leads/{id}]`

### 1.15 Scheduled reply
- `{ id*, replyId*, leadId*, channel* enum ["linkedin","email","x"], status* enum ["scheduled","sending","sent","held","cancelled","failed","delivery_unknown"], reason*, sendAt*, nextAttemptAt*, sentAt*, version*, text* }`. List filters: `status`, `channel`, `leadId`, `cursor`, `limit`; oldest creation first. `[oa: GET /scheduled-replies]`

### 1.16 Reply decision
- `POST /replies/{id}/decide { decision* enum ["send","invite","booking_link","snooze","start_sequence","meeting_booked","dismiss","opt_out"], text? (send only), days? (snooze, ≥1), by? (default "api"), sendAt? }` + header `Idempotency-Key` (required with `sendAt`). 200 `{ ok }` or 202 `{ ok, scheduledReply }`. `[oa; api]`
- Draft-less X: `GET /leads/{id}/reply-decisions` → `{ leadId*, channel*, replyVersion*, allowedDecisions*[] }`; `POST` same path `{ channel*, decision*, text*, sendAt*, replyVersion*, by? }` + `Idempotency-Key*` → 202. `[oa]`

### 1.17 Webhook subscription
- `{ id*, url* (≤2000), events*[] (1–15 items), createdAt* }`; `secret*` only on create. `GET /webhooks` also returns the catalog `events*[]`. `[oa; api]`

### 1.18 Activity event (ledger row)
- `GET /activity?action=<csv>&outcome=ok|failed|skipped&sinceDays&limit` (untyped response; `count` is the full total). "append-only". Action vocabulary = the `get_workspace view=activity actions` enum (see §7). `[oa; mcp: get_workspace; guide; docs-quickstart]`

### 1.19 Signal event
- `{ eventId, name, timestamp, data: { company {name, domain, headcount}, job {id, title, url, location}, source, observedAt, providerIndexedAt, publishedAt }, cursor }`; page: `events[], cursor, hasMore, truncated, nextPollMs, billing {energyCharged}, coverage {source, latestObservedAt, description}`. Only type `hiring.job_observed`. Catalog item: `name, title, status ("available"|coming-soon), description, delivery`. `[signals-api; oa: POST /signals/events]`

### 1.20 Person (people data)
- `POST /people/enrich { email (≤320) XOR linkedin (≤1500), find[] enum ["x","work_email"] (≤2; MCP adds "mobile"), leadId }` → `{ id, person, missing?, energyUsed }` (MCP adds `energyLeft`, `lead.email` status `attached|lead_has_email|different_person|email_on_another_lead|no_email`). `person`: `name, title, headline, location, company {name, domain}, linkedin, x {handle, url, evidence}, workEmail {address, matchesCompanyDomain, verification {status, method, mailProvider, summary}}, connections[] {from, to, type: "follows", sourceUrl, observedAt}` (≤100), `mobile`. `missing.<field>` reasons: `not_found`, `energy_exhausted`, `unavailable`. `[api: POST /people/enrich; people-api; mcp: enrich_person]`
- `POST /leads/enrich { leads*[≤20] {reference, email | linkedinUrl} }` bridges to X identities (response untyped). `[oa]`
- `search_known_people { query* }` returns ≤20 observations; `get_lead_profile { leadId* }` returns identities, dated observations, refresh state, coverage note. `[mcp]`

### 1.21 Energy / balance
- `GET /energy` → `{ enabled*, used, remaining, periodStart, costs (untyped map), centsPerEnergy }`; `{enabled:false}` when not metered. `[oa]`
- MCP `energy` returns remaining, total, costs, usage, renewal, automatic top-up state, refill guidance, links; `estimate` object keys: `peopleToFind, xAudiencePeople, xDms, xDmsUnchecked, xFollows, xUnfollows, xLikes, xReposts, linkedinInvites, linkedinMessages, emails`. `buy_energy { packs* 1–100 }` → `packs, energy, usd, checkoutUrl, message`. `set_auto_top_up { enabled* }`. `[mcp]`

### 1.22 CRM Company
- `save_company { id* uuid, expected_revision* (0 creates), name*, domain* (string|null), lifecycle* enum ["prospect","onboarding","active","at_risk","churned"], owner* (string|null), success_plan* (string|null), next_review_on* (date|null) }`; `get_company { company_id* }` → company, asOf, opportunities, contacts, events (latest 100), eventCount. `[mcp]`

### 1.23 Opportunity
- `save_opportunity { id*, expected_revision*, company_id*, title*, stage* enum ["new","qualified","meeting","proposal","negotiation","won","lost"], amount_minor* (int|null), currency* enum ["USD","EUR","GBP","CAD","AUD","INR"], probability_override* (int|null, cleared for won/lost), expected_close_on* (date|null), next_step* (string|null), next_step_due_on* (date|null; past date = overdue) }`. `get_pipeline { q, currency, attention (overdue or ≥14 days no contact), scope enum ["active","archived","all"], offset 0–10000, limit 1–100 }` → asOf, totals (per currency, minor units), opportunityCount, opportunities, nextOffset. `[mcp]`

### 1.24 Contact (CRM)
- `add_company_contact { id*, company_id*, name*, email* (email|null), role* (string|null), lead_id* (uuid|null) }`. `[mcp]`

### 1.25 Customer signal (CRM timeline event)
- `record_customer_signal { id*, company_id*, kind* enum ["note","meeting","reply","product_engagement","risk","milestone"], source* enum ["manual","eve","notion","fathom","granola","calendar","slack","stripe"], title*, body* (string|null), occurred_at* (ISO 8601 with offset; no future), source_url* (uri|null) }`. Only meeting/reply/product_engagement refresh last-contact. `[mcp]`

### 1.26 Company profile / workspace setup
- `preview_workspace_setup { company?, answers? }` → `reviewed, reviewerChanges, reviewToken` or `status: needs_input`. `company`: "name, website, offer, buyers, audiences and proof"; `answers`: "proof, best customer, warm sources, audiences, signals and channels". `save_workspace_setup { company, answers, reviewToken* }` → what was saved + `setupRevision`. GTM profile fields in get_workspace: proof, warm sources, ideas, channels, exclusions, goal, team. `[mcp]`

### 1.27 Campaign plan
- `plan_campaigns` → `companyConfirmed, setupRevision, channels, campaigns[] (key, channels, what it needs, already built), reason`. `build_campaigns { keys*[], expectedRevision* (= setupRevision) }` → each built campaign with Play, sequence review link or setup link. `check_campaign { campaign* { targeting, steps, executionModel, include sample people } }` → `targeting, audience {say, ...}, audienceChecksToday, samplePeople (≤3), messages`. `[mcp]`

### 1.28 Account universe / competitor research
- `research_competitor { websiteUrl, competitorName, roles[], productBrief, maxCaseStudies 1–80, maxPeopleTotal 1–500 (default 100), playId, limit 1–500 (default 200) }`; `reach_universe` and `add_to_sequence` select by `competitor`, `playId`, `candidateIds[]`, `notYetEnrolled` (default true). `[mcp]`

### 1.29 AI search (AEO) objects
- Overview (`windowDays` 30|90): `aiSearch, company, you {visibility, share of voice, sentiment (0–1), average position, byEngine, weekChange, trend}, competitors, questions, sources, opportunities, website, spend {daily limit, energyLeft}, costs {websiteScanAtMost, suggestQuestionsAbout, checkOneQuestionAbout, websiteAuditAtMost, githubAuditAtMost}, settings, audit`. Question: `questionId`, `branded`; `answers[]` (`answerId`, names company, sentiment, position, passage, competitors, cited pages, searches; text ≤1,000 chars, full ≤20,000). Settings: `engines[]` enum `["chatgpt","google_ai_overview","google_ai_mode","gemini","perplexity"]`, `samples` 1–5, `frequency` enum `["off","daily","weekly"]`, `dailyLimitUsd` 0–1000 (1 Energy = $0.05), `competitors[]`, `brandAliases[]`, `brandDomains[]`, `country`. Topics: kind `howto|guide|comparison|explainer`, ≤5 topics, ≤3 HN links. Content audit: `source` `site|github`, ≤30 pages, score 0–100, ≤50 pages returned. Max 50 tracked questions. `[mcp: AI search section]`

### 1.30 Partner account
- `POST /signup { email* (≤254), company* (1–200), website (≤2000), acceptedPolicies* const "2026-09-18" }` → `{ apiKey*, mcpUrlTemplate*, freeLeads*, accountUrl*, usersUrl*, docsUrl* }`. `GET /account` → `partner {id, name}, enterprise {outreach, linkedinConnect}, linkedinConnect {successRedirectUrl, failureRedirectUrl, brandName (1–60)}, rest {requireUserHeader}, mcpUrlTemplate, users, accounts {connected, included, remaining}, periodStart, leadsThisPeriod, freeLeads, freeLeadsRemaining, billing {status enum ["metered","billing_required","free"], checkoutUrl}`. `[oa; api]`

### 1.31 End user (partner client)
- `{ externalUserId* (letters, digits, `_ . : @ -`, ≤120), name*, createdAt*, status* enum ["active","disabled"], monthlyLeadCap*, mcpUrl* (https://mcp.pumpgtm.com/mcp/u/{externalUserId}), rest* ({header: "X-PumpGTM-User", value} or null), outreach* enum ["enabled","disabled"] }` + usage `leadsFound, toolCalls, lastUsedAt`. `[oa: GET/POST/PATCH/DELETE /users]`

### 1.32 Connect link
- `{ id*, externalUserId*, status* enum ["pending","connected","expired","revoked"], expiresAt*, connectedAt*, revokedAt*, createdAt* }` + `url` (once). `expiresInMinutes` 10–43200 (default 7 days); ≤10 open links per user. `[oa]`

### 1.33 Move operation
- `{ operationId*, sequenceId*, requestLeadIds*[], status* enum ["pending","running","completed","cancelled","failed"], executeAfter*, serverNow*, movedCount*, blockedCount*, results*[] { leadId*, person*, sourceSequenceId*, status* enum ["moved","blocked"], reason*, message* } }`. Preview result: `{ sequenceId, eligibleCount, blockedCount, results[] {leadId, person, sourceSequenceId, eligible, reason, message} }`. MCP `move_leads` adds optional `sourceSequenceId`. `[oa; mcp]`

### 1.34 Import batch
- `importStatus { method: "sales_navigator", batchId, requestId, status enum ["processing","waiting","finalizing","completed","failed"], sequence, progress { fetchState, fetchedCount, providerTotalCount, validCandidateCount, providerLimitReached, nextAttemptAt }, summary { addedCount, duplicatesSkipped, alreadyInvitedCount }, errorCode, createdAt, updatedAt }`. `[api: GET /leads/imports/{batchId}]`
- Synchronous add result: `addResult { method enum ["contacts","manual","csv","sales_navigator"], batchId, status, sequenceId*, sequenceStatus* enum ["active","paused"], reused*, addedLeadIds[], addedLeads[] {id, person, linkedinUrl} (manual/csv), summary {submittedCount ≥1, addedCount, duplicatesSkipped, invalidSkipped, alreadyInvitedCount}, contacted* const false, energyCharged (contacts; always 0) }` + `reviewUrl`. MCP adds `rejected[] {inputIndex, person, linkedinUrl, reason, message}`. `[api; mcp: add_leads]`
- X import (`POST /plays/{id}/import`): `{ playId*, batchId*, requestId*, replayed*, results*[] {xUserId*, reference*, candidateId*, result* enum ["imported","existing_candidate"]}, enrolled*, sendsMessages* }`. `[oa]`

### 1.35 Removal
- `POST /leads/remove` (discriminator `target`: `leads` + `leadIds[1..500]`; `import` + `batchId`; `companies` + `companies[1..100]` (1–240 chars)) → `removal { ok: true, selectedCount, removedBeforeContact, automationStoppedAfterContact, alreadyStopped, notFoundCount, importCancelled, excludedCompanies?, removals: [{ leadId, removalId, undoAfter }], historyPreserved: true, sentActionsReversed: false, summary }`. Lead `removal { id, removedAt, undoAfter }`. Undo: `POST /leads/undo-remove { removalIds*[] }` → `restoration { restoredCount, alreadyRestoredCount, blockedCount, results[] {removalId, leadId, status enum ["restored","already_restored","blocked"], reason, message} }`. `DELETE /leads/{id}` → `deletion { leadId, status: "deleted" }`. `[api; oa]`


---

## 2. STATE MACHINES

### 2.1 Sequence status
- Values: `draft`, `active`, `paused`, `archived` (`previousStatus` enum). Settable via REST: `active`, `paused`, `draft`. MCP `set_sequence_status.status`: `approved`, `active`, `paused`, `draft`. `[oa: PATCH /sequences/{id}/status; mcp: set_sequence_status]`
- Transitions:
  - `draft` → live (`approved`/`active`): MCP `set_sequence_status status=approved` with `expectedRevision` ("records the approval and makes it live in the same call"); REST `POST /sequences` with a workspace/partner key is approved and live on return (`live: true`); adding people to a draft (`POST /sequences/{id}/leads`, `POST /plays/{id}/leads`) "approves and starts it". `[mcp; api: POST /sequences; api: POST /sequences/{id}/leads]`
  - `active` ↔ `paused`: `PATCH status` / `set_sequence_status`. `paused` "halts future sequence work; already dispatched actions cannot be recalled". A paused sequence "takes the people and stays paused". `[oa; api]`
  - `active|paused` → `draft`: "draft reopens it for editing"; MCP `save_sequence_draft` on an active/paused sequence requires reopening to draft first. `[mcp: set_sequence_status, save_sequence_draft]`
  - `PUT /sequences/{id}` with a customer credential: "the new revision is re-approved and returns to its previous status (active stays active, paused stays paused, a draft goes live)". `[api: PUT]`
  - `archived` is terminal for writes: 409 `archived_sequence_is_read_only`; archived sequences cannot be move destinations. `[oa: PATCH status; oa: POST /leads/move/preview]`
  - Refusals: 409 `sequence_approval_required` (activating an unapproved sequence), `sequence_must_be_draft`, `sequence_has_progress`, `sequence_not_active`, `sequence_not_ready`. `[oa; api]`
- `executionBlockReason` (string|null) explains why an active sequence is not executing. `[oa: GET /sequences]`
- MCP flow summary: `save_sequence_draft` → `set_sequence_status approved (expectedRevision)` → `active`. `[mcp: A complete flow]`

### 2.2 Lead stage (LinkedIn/sequence lead)
- MCP `stage` / `stageExact` enum: `queued`, `resolving`, `invited`, `accepted`, `messaged`, `followed_up`, `replied`, `failed`, `skipped`. `stage` is cumulative ("reached this milestone or beyond"); `stageExact` is the current position; waiting rooms = `queued`, `resolving`; exits = `failed`, `skipped`. `[mcp: list_leads]`
- REST `GET /leads?stage=` examples: "queued, invited, connected, messaged, replied, meeting_booked" (note the different vocabulary: `connected` vs `accepted`, plus `meeting_booked`). `[oa: GET /leads]`
- Progress funnel vocabulary: "invited, accepted, messaged, replied, meetings booked". `[docs-quickstart §2]`
- Removal: "Uncontacted leads leave the queue; contacted leads keep their stage and milestones"; X stop: "uncontacted queued leads become skipped". `[oa: POST /leads/remove; oa: POST /x/leads/{id}/stop]`
- Reply freezes the lead ("Replies freeze the lead"; "a sequence stops when someone replies"). `[docs-quickstart; mcp.md]`

### 2.3 X lead status
- `stage*` (string, not enumerated) plus milestone timestamps `followedAt`, `followedBackAt`, `messagedAt`, `repliedAt`, `optedOutAt`; `automationStopped` boolean ("done/stopped; does not distinguish normal completion from a manual stop"); `currentStep`, `nextActionAt`. `[oa: GET /x/leads/{id}]`

### 2.4 Review batch status (people search)
- `draft` (being prepared) → `sample_ready` (ready to review) → `approved` → `imported` (finished; good fits queued) | `rejected`. `[api: GET /people/reviews/{batchId}]`
- Candidate decision: `undecided` → `approved` (`good_fit`) | `rejected` (`not_a_fit`). Partial decisions persist; `finish: true` requires every candidate decided (409 `all_candidates_require_a_decision`). `[api: POST decisions]`

### 2.5 X Play candidate status
- `proposed` → `approved` (enroll) | `rejected`; `imported` (via `POST /plays/{id}/import`). Enroll results: `enrolled`, `existing_lead`, `already_reviewed`, `rejected`. Import results: `imported`, `existing_candidate`. Review filter states: `unreviewed`, `good_fit`, `not_a_good_fit`, `all`. "conflicting review decisions return 409"; "Repeating a completed good-fit review returns already_reviewed". `[oa: GET /plays/{id}/candidates; POST /plays/{id}/enroll; POST /plays/{id}/import]`

### 2.6 Play running state
- X Plays: `active`, `paused`, `archived`; `autopilot` boolean (true = auto-enroll without review; "A Play that uses batch review (every Buying intent Play) keeps automatic enrollment off"). `set_x_play_status { status active|paused, autopilot }`. Pausing stops collection, not queued messages. `[oa: GET /x/plays; mcp: set_x_play_status]`
- X watch `status` string (values not enumerated). `[oa: GET /x/watches]`

### 2.7 Move operation
- `pending` → (`running` → `completed` | `failed`) or `cancelled`. Executes after a five-second server delay (`executeAfter`); cancel only while `pending` and before execution claims it; "A pending response with serverNow at or after executeAfter also means the cancellation window closed." Per-lead: `moved` | `blocked`. `failed` may contain confirmed partial results. 503 `sequence_move_unconfirmed` = re-read/retry the same operation. `[oa: POST /leads/move, /cancel, GET /leads/move]`

### 2.8 Import status (Sales Navigator)
- `processing` → `waiting` (fetched; waiting on `errorCode`, retries automatically) → `finalizing` → `completed` | `failed`. Manual/CSV/contacts complete synchronously (`status "completed"`) and return 404 on the import endpoint. `[api: GET /leads/imports/{batchId}]`

### 2.9 Connect link status
- `pending` → `connected` | `expired` | `revoked` (expired and revoked final). Only `pending` can be revoked (409 `connect_link_not_pending`). Poll every 3 s, give up after 15 min. `[oa: connect-links]`

### 2.10 LinkedIn account status
- Workspace list: `connected`, `disconnected`. Partner list: `connected`, `disconnected`, `pending`, `failed`. Sending-limit `mode`: `warmup` ↔ `outreach` (warmup restart always allowed; graduation during ramp refused 409 `warmup_in_progress` unless `acknowledgeEarlyGraduation: true`). `[oa]`
- Invite hold: `linkedin.limited` (reason `invite_limit`, `attempt` 1..3, `retryAt`) → `linkedin.resumed` (`warmupRestarted false`). `[api: POST /webhooks]`

### 2.11 Pending reply / decision lifecycle
- A reply is "pending" while it waits in Inbox "Needs you"; it leaves the list once answered, cleared, snoozed, booked or opted out, "until the person writes again". Decisions: `send` (posts draft or `text`), `invite`, `booking_link`, `start_sequence` ("they wrote first, so let the sequence run now") act on the thread; `snooze` waits `days` (MCP default 3, then 7 on a later snooze; 1–365); `meeting_booked`, `dismiss`, `opt_out` close it; `opt_out` is permanent. Same text re-sent → `alreadyDecided`. `[oa: GET /replies; oa: POST /replies/{id}/decide; mcp: decide_reply]`

### 2.12 Scheduled reply status
- `scheduled` → `sending` → `sent` (provider acceptance) | `failed` | `delivery_unknown` (reserves the conversation until reconciled; never blindly retry/recreate); `scheduled`/`held` → `cancelled` (cancel idempotent; 409 once sending/sent/failed/delivery_unknown); `held` needs explicit review (PATCH with `reapprove: true` + `expectedVersion`). 409 `version_conflict`, `reapproval_required`, `conversation_changed`, `reply_not_editable`. `[oa: scheduled-replies]`

### 2.13 Partner end user / billing
- End user `active` ↔ `disabled` (disable pauses active sequences, 403 `user_disabled`). `outreach` `disabled` → `enabled` when PumpGTM enables it on the partner account. Partner `billing.status`: `metered`, `billing_required`, `free`. `[oa: /users; /account]`

### 2.14 Removal / undo / delete
- Lead removed → undo within validity (`undoAfter`; "In-flight work can require ten minutes to settle") → `restored` | `already_restored` | `blocked`. Removed + no history + settled → `DELETE` → `deleted` (irreversible; 409 `lead_delete_blocked` with `retryAfterSeconds`; 503 `lead_delete_unavailable`). `[api; guide: Delete an unused test lead]`

### 2.15 Webhook-Play signup event
- `dryRun: true` → `status "validated"`; live → `status` `review` or `queued` (eligible auto-add uses the linked approved active sequence), `reused` on replay. `[api: POST /plays/{id}/webhook]`

### 2.16 Per-person file state (customer_input attachment)
- `waiting` (no file yet) → `ready` (attached, not sent) → `sent`; or `closed` (not needed). `[mcp: list_leads personalFiles]`

---

## 3. SEQUENCE STEP MODEL

### 3.1 Step kinds and required fields `[api: POST /api/v1/sequences schema + intro; mcp: save_sequence_draft]`
| kind | channel | required | notes |
|---|---|---|---|
| `connect` | LinkedIn | `delayDays` | Connection request. "go without a note: never suggest, offer or draft one"; if the customer insists, note in `messageTmpl` ≤300 chars using only `{{firstName}} {{fullName}} {{company}} {{title}} {{senderFirstName}}`; "an account out of notes sends the request without it". Linear/tracks with any LinkedIn step: step 0 must be `connect` (tracks: first in the LinkedIn lane). Graph: anywhere, at most once per path. |
| `message` | LinkedIn | `messageTmpl` or `text` on every variant | May carry `attachments[]` (≤5 uploaded refs) and `tool` (`customer_input` or `sendspark`). Must follow a connection request + `linkedin_accepted`/`linkedin_first_degree` Yes path in graphs; in linear "the step after connect waits for acceptance". |
| `engage` | LinkedIn | `actions[]` non-empty (≤10) | types `follow`, `unfollow`, `view_profile`, `like_last_post` (`count` 1–3, `reaction`), `endorse_first_skill`, `comment_last_post` (`guidance` ≤1250; "Every comment waits for the customer's approval in the app before it posts"). view/like/comment need no connection; endorsement does. Comment before connect needs feature `linkedin_comment_before_connect`. |
| `email` | email | `messageTmpl`; `subject` on the first email ("In a graph, it is required if any incoming path has not already sent an email") | `subject` 1–200. Follow-ups stay in the thread. `tool` only `customer_input`. |
| `x_dm` | X | `messageTmpl` | optional `sendIf` `followed_back` / `not_followed_back` (after an earlier `x_engage` follow). `tool` only `customer_input`. |
| `x_engage` | X | `actions[]` with `follow`/`unfollow` only | |
| `instagram_dm` | Instagram | `messageTmpl` | "Instagram DMs run only in their own linear sequence". |
| `branch` | — | `condition`, `next {yes, no}` | graph only. |
- `inmail` appears only as an `add_to_sequence` template name and via `inmailEnabled`/InMail credits; no `inmail` step kind exists in the schema. `[mcp: add_to_sequence; oa: GET /linkedin/accounts]`

### 3.2 delayDays semantics `[api: delayDays description; mcp: executionModel]`
- Integer 0–30. `linear`: "after the previous step, with acceptance required after connect". `tracks`: "after the previous step in that channel's lane"; a missing channel does not block other lanes. `graph`: "delay on entering an action node, or the waiting branch's condition window; the initial step starts immediately". Branch conditions `linkedin_accepted` and `x_followed_back` "wait up to delayDays for yes, otherwise take no"; `has_email` and `linkedin_first_degree` evaluate immediately.
- Comment-before-connect pattern: engage `[like_last_post, comment_last_post]` → `connect` with `delayDays 1`: "the request goes out a day after the comment posts or is skipped".

### 3.3 executionModel `[api; mcp: save_sequence_draft]`
- `linear` (default on create): up to 20 ordered steps; "X steps cannot mix other channels"; indices 0–19.
- `tracks`: up to 20 steps in parallel LinkedIn, email and X lanes.
- `graph`: up to 30 nodes (indices 0–29), explicit `next` edges (`{next: i}` / `{yes, no}`; `null` target ends the path; omitted `next` defaults to the next array step), "All nodes must be reachable from step 0 and cycles are forbidden", one cursor per lead. "missing email or X identity skips that channel's action". Graph reply safety: before further outreach it checks previously contacted email/LinkedIn/X conversations; "a human reply stops the flow; unavailable evidence holds it" (independent of `xThreadCheck`).
- Changing models "requires no existing execution progress". Omission on edit keeps the saved model.

### 3.4 Edit rules after progress `[api: PUT /sequences/{id}]`
- Graph: once any lead left step 0, "step count, kinds, edges and conditions cannot change; copy and delays may still be edited without moving lead cursors".
- Any model: a step someone may already have received must keep identical content or 409 `sequence_edit_would_repeat`; a linear step may be removed if every remaining step is unchanged; "Linear people move past every step they may have received, matched by exact content".

### 3.5 Variants / A-B
- `variants[] {key (1–5), weight (1–10000), messageTmpl (≤2000)}` max 10 per step; LinkedIn message may put `text` on every variant instead of step `messageTmpl`. Results in analytics `messages[].variant` and `/reports/funnel.experimentArms`. `[api; oa]`

### 3.6 Template variables / per-person values
- Render on every channel: `{{firstName}}`, `{{fullName}}`, `{{company}}`, `{{title}}`; connect note additionally `{{senderFirstName}}`. `[api: messageTmpl; mcp: save_sequence_draft]`
- Custom tokens: `customFields` on manual adds / `customColumns` on CSV map to lowercase tokens (`^[a-z][a-z0-9_]{0,39}$`, values ≤1000) "written verbatim wherever a message uses {{personalized_message}}". `[api: sequences/{id}/leads]`
- Legacy email campaigns: `{{firstName}} {{company}} {{title}}`. X DMs: "first name, full name or handle". `[mcp: reach_universe; x-play-page]`

### 3.7 `tool` held steps `[api: tool description; oa: POST /leads/{id}/input, /input/upload; mcp: set_lead_input]`
- `{ kind: "customer_input", tokens: ["video_url", ...] }` — up to 5 lowercase tokens per step; optional `attachment: { key: "personal_file" }` (then tokens may be empty). LinkedIn message steps take either tool; email, X DM and Instagram DM steps take only `customer_input`.
- `{ kind: "sendspark", params, outputToken?: "video_url", timeoutHours?: 1-168, fallback?: "send_without" | "skip_step" }` — personalised video from the connected video tool.
- Supplying values: `POST /leads/{id}/input { values {1–5 keys, values 1–2000}, files {exactly 1 key → uploadTicket} }`; `*_url` keys must be http(s) URLs; value written to every not-yet-sent step declaring the token. Upload: `POST /leads/{id}/input/upload { key, fileName (1–200), size (1–50,000,000) }` → `{ uploadUrl, method: "PUT", headers, uploadTicket, expiresAt (2 h), maxBytes, appUrl }`; PUT bytes with `Content-Type: application/octet-stream`. MCP `set_lead_input` also supports batch `uploads[]` (≤25) + `confirmUploads[]`.
- File limits: LinkedIn message ≤5 files and 15 MB total incl. step attachments; email one document/image/MP4 ≤18 MB (1.5 MB from Microsoft mailbox, checked at send time); X DM one image ≤5 MB, GIF ≤15 MB, MP4 ≤50 MB and 140 s. Nothing is compressed.
- Response `stored { leadId, person, company, linkedinUrl, sequenceId, sequenceName, stepIndex, storedKeys, storedFiles?, complete, stillMissing, willSendOn, stillWaitingInSequence }`.
- `get_workspace attention.leads_waiting_for_input`; `list_leads waitingForInput=true`. `sender_file_reconnect_required` / `reconnectXForFiles`: X account must be reconnected before files can send.

### 3.8 Email subject, footer, inboxes, schedule, daily limit
- Subject required on first email (1–200). `[api]`
- `unsubscribeFooter` off by default; List-Unsubscribe headers sent unless workspace `plainTextEmail` is on (which removes headers, HTML formatting and tracking). `[mcp: sequence_email_settings]`
- `sequence_email_settings.settings` replaces "mailboxes, schedule and daily limit together" (exact sub-field names not documented). Email campaigns (legacy) expose `schedule`, `mailboxIds`/`allMailboxes`, `dailyLimit` 1–5000. `[mcp]`
- "Every email is plain text from your address... each message carries a one-click unsubscribe. Daily mailbox limits control the sending pace." `[li-email-page line 109]`

### 3.9 Writing rules / default follow-up plan `[mcp: save_sequence_draft, write_cold_email, reach_post_engagers]`
- Default three follow-ups after the first message: proof (+2 days), question or free offer (+3 days), short last note (+5 days). `reach_post_engagers.followUps` "sent 2, 3 and 5 days apart until the person replies".
- Style constraints listed verbatim in `save_sequence_draft.steps` (no em dashes, at most one question, etc.).
- Marketing sample timeline: Day 0 connect (no note), Day 1 LinkedIn note after accept, Day 3 intro email, Day 4/5 follow-ups same thread, Day 9 last follow-up. `[li-email-page lines 16-21]`

### 3.10 Attachments on steps
- `attachments[] {id uuid, name, size ≥1}` ≤5 — "Existing uploaded attachment references for LinkedIn message steps. Preserve returned references when editing." No upload endpoint for step-level attachments is documented (only per-lead input uploads). `[api]`

---

## 4. PEOPLE SEARCH / TARGETING

### 4.1 Targeting schema (`POST /people/searches.targeting`) `[api: POST /api/v1/people/searches]`
- `schemaVersion` const `1`; `name*` (1–120); `candidateCount*` (5–100, "The exact number of candidates to return"); `semanticQuery` (1–2000; "Plain-language description of product, workload, responsibility and business-model fit"); `defaultSequenceId`; `hardFilters*`:
  - `currentTitleIncludesAny*` string[1..40] (1–120 each) — "a person's current title must contain at least one"
  - `currentFunctionsAny` / `excludedCurrentFunctionsAny` enum[≤40]: `"Engineering"`, `"Sales"`, `"Consulting"`, `"Marketing"`, `"Operations"`, `"Finance"`, `"Research"`, `"Customer Success and Support"`, `"Arts and Design"`, `"Human Resources"`, `"Legal"`, `"Product Management"` `[oa]`
  - `currentSenioritiesAny` / `excludedCurrentSenioritiesAny` enum[≤40]: `"Owner / Partner"`, `"CXO"`, `"Vice President"`, `"Director"`, `"Experienced Manager"`, `"Entry Level Manager"`, `"Strategic"`, `"Senior"`, `"Entry Level"`, `"In Training"` ("put finer wording such as Head of or SVP in semanticQuery") `[oa]`
  - `personCountriesAny` string[≤40] (1–240)
  - `currentCompanyNamesAny` (exact employer names, "only for a named account list"), `currentCompanyDomainsAny` ("a domain pins one company exactly"), `currentCompanyLinkedInUrlsAny`, `currentCompanyIndustriesAny` ("canonical company industries"), `currentCompanyTypesAny` ("canonical company ownership types"), `currentCompanyInvestorsAny` ("Y Combinator, not YC"), `currentCompanyHiringRolesAny` (open job posting right now) — all string[≤40] (1–240)
  - `currentCompanyHeadcount { minimum (1–10,000,000), maximum (1–10,000,000) }`
  - `currentCompanyHiringPostedWithinDays` 1–365 (default 30 when hiring roles given)
  - `excludedCurrentCompanyNamesAny`, `excludedCurrentCompanyTypesAny` string[≤40]
- MCP-only targeting fields (not in REST schema): `targeting.searchMethod` enum `auto | connected_account | professional_database`; fundraising signal `currentCompanyRaisedWithinDays`, `currentCompanyRoundTypesAny`, `currentCompanyMinRaisedUsd` ("such a Play re-runs once a day"). `[mcp: find_people]`
- Company-name resolution never blocks: "an exclusion covers every company sharing the name and a required company includes every strong match"; pin with domain/LinkedIn URL. `companyResolution` outcomes include `matched_several`, `unmatched`. `[mcp: find_people]`
- Lookalike: `find_people.play { type: lookalike_accounts, inputs: { seedCompany } }`; the setup reviewer "removes the customer's own company as a lookalike customer". `[mcp: find_people, preview_workspace_setup]`
- Alternatives to targeting in `find_people`: `playId` (+`expectedRevision` to revise), `list { yc_founders_2026_09 | a16z_speedrun_founders_2026_10, filters }`, `play { type, inputs }`, `accounts` (≤5,000 companies + titles), `sequenceId`, `confirmed` (default false), `requestId*`. `[mcp: find_people]`

### 4.2 Run / count / sample
- REST: `run: false` (default) → 200 prepared `{ play {id, revision}, plan, ambiguities: [], companyResolution, readyToRun, reviewUrl?, searched: false, contacted: false }`; `run: true` (requestId required) → 201 `{ play, batch {id, status...}, candidates[] {id, person, title, company, linkedinUrl, decision...}, reviewUrl?, searched: true, contacted: false }`. 409 `targeting_needs_clarification` (with `ambiguities`), 409 `draft_changed`; 403 `user_lead_cap_reached` / `billing_required`. "A run crawls toward candidateCount, up to 100 people". `[api]`
- `POST /people/searches/{playId}/run { requestId*, sequenceId? }` → 201 same shape. `[oa]`
- MCP: searches are background operations → `operationId` + `status`; poll `get_people_search { operationId }` until `completed`/`failed`; default candidateCount "five for a new search without a count". `[mcp: find_people, get_people_search]`
- Size check: `check_campaign` counts matching profiles (no Energy, saves nothing), `audience=sample` adds up to 3 example people, max 3 counted size checks/day (`audienceChecksToday`; zero-match and failed don't count), `audience.say` is the customer-facing line. `[mcp: check_campaign]`
- Energy: 2 per person found; "a company where nobody matches costs nothing"; 402 `energy_exhausted`; partners without Energy: 50 free leads then 403 `billing_required`. `[mcp.md; api]`

### 4.3 Review batch and decisions
- See §1.13. Decision enum `good_fit` / `not_a_fit`; candidate decision enum `undecided` / `approved` / `rejected`; 1–100 decisions per call; `feedbackReason` 1–120, `feedbackNote` ≤1000; sequence precedence: per-decision `sequenceId` > call `sequenceId` > Play default. `[api]`

---

## 5. X PLAYS

### 5.1 Buying-intent signals (`create_x_play` / `edit_x_play`) `[mcp]`
- `name*`; `signal*` enum `competitor_followers`, `competitor_post_engagers`, `asks`, `complaints`, `reddit`.
  - `competitor_followers`: `competitors[]` (≥2; @handle/handle/x.com link), `minShared` 2–10 (default 3, capped at number of competitors).
  - `competitor_post_engagers` (replying, quoting or reposting): `competitors[]` (≥1), `postsPerCompetitor` 1–10 (default 5 newest posts read daily).
  - `asks` (asking for a tool): `phrases[]`, `networks[]` enum `x`, `linkedin` (default X only).
  - `complaints`: `phrases[]`, `competitors[]` (optional; anchors X search), `competitorNames[]` (LinkedIn), `networks[]`.
  - `reddit`: `phrases[]`, `subreddits[]` (`r/name` or `name`; omit = all Reddit); "a reply drafted for review".
- `criteria` (one sentence; found people checked against it; omit = keep everyone); `sequenceId` (X lane or LinkedIn lane) XOR `message` (creates an approved active X DM sequence named after the Play).
- "The Play collects people once a day, even before X is connected, and lists them for review; it never enrolls or messages anyone by itself." Phrases are buyer words, "never the company's own marketing terms".
- `edit_x_play { playId*, expectedRevision*, name, plan (audience rules), signal, competitors, minShared, postsPerCompetitor, phrases, networks, competitorNames, subreddits }`; signal fields "replace its sources"; the sender stays fixed.

### 5.2 Own-account X Plays (`reach_post_engagers`, `POST /x/watches`) `[mcp; oa]`
- Sources: `followers` (new followers), `every_post`, `post` (+`postUrl`). MCP: `postUrl` (x.com status → X Play), `followers=true`, `engagements[]` enum `liked`, `replied` (default both), `message` or `sequenceId`, `name`, `as`, `watchId` (progress: people, sent, replied). "X defaults to review before enrollment". Funnel on `GET /x/watches` (untyped).
- LinkedIn variant: post URL → Play with approved sequence (note-less connect, message, followUps), fetches reactors/commenters up to 500; `profileUrl` → watch latest 10 posts from past 30 days every six hours, auto-enroll up to 500 new engagers per collection.

### 5.3 Review, intent score, eligibility, pacing
- `get_x_play_review { playId*, filter unreviewed|good_fit|not_a_good_fit|all (default unreviewed), limit 1–200 (default 100), after }` → counts, nextCursor, candidates with `intent.score` 0–100, `intent.tier` `hot` (≥65) / `warm` (≥35) / `watching`, `signals[]`, `judge`, `play` (revision), `sequence`, `reviewUrl`. `[mcp]`
- `review_x_play_candidates { playId*, expectedRevision*, sequenceId* (uuid|null), sequenceRevision* (int|null), decisions*[] (≤200; each with `note`) }` → per decision `enrolled|existing_lead|rejected|already_reviewed`, `sequenceStatus`, `reviewUrl`. Conflicting decision fails the whole request. `[mcp]`
- Eligibility `POST /x/eligibility { account*, leads*[≤100] {reference, xUsername | xUserId} }` → `results[] { reference, xUsername, xUserId, followsAccount (true | false verified negative via handle | null unknown), checkedAt, reason, evidence }`, `provider`, `sendsMessages`. Numeric IDs use a bounded follower snapshot: presence true, absence null. `[oa; guide]`
- Webhooks: `x.followed` (`outcome` `staged` | `filtered` | `no_sink`), `x.intent_detected` (`play, person, score, tier, reasons, signals, fit`), `x.competitor_follower` (`play, person, signal`). `[guide: Webhooks]`
- Pacing: "A few DMs every few minutes with a random gap, never more than 100 a day per workspace"; thread check skips anyone previously spoken to; "Accounts with an empty bio or under 20 followers are skipped"; "Sequences up to five DMs ... follow-ups one to thirty days apart"; autopilot enrollment "paced by the daily X budget"; a reply stops remaining steps. `[x-play-page; mcp: set_x_play_status]`
- Energy: liker/follower collected 1; DM with history check 5; DM without / X reply 0.6; follow/unfollow/like/repost 1 each. `[mcp.md]`
- Manual-review REST path: `POST /plays/{id}/import` (1–100 unique numeric IDs, atomic, `requestId*` scoped to workspace+Play), `GET /plays/{id}/candidates` (≤200 rows/page), `POST /plays/{id}/enroll { expectedRevision*, sequenceId*, sequenceRevision*, candidateIds*[1..200 unique] }`; requires `reviewApiEnabled` and non-autopilot Play. `[oa; api]`

---

## 6. REPLIES

- Listing: `GET /replies?limit` / `list_pending_replies { limit 1–200, default 50 }` (drafted replies and draft-less X replies each capped at `limit`). Channels: LinkedIn, email, X, Instagram (MCP says "linkedin, instagram, x"; REST says "LinkedIn, email and X"). `[oa; mcp]`
- Item: see §1.14. `allowedDecisions` lists what applies per item; "X drafts accept everything but invite"; draft-less X items accept only `send`, `snooze`, `dismiss`, `opt_out`, `meeting_booked` and `send` requires customer-approved `text`. `[mcp: list_pending_replies, decide_reply]`
- Encrypted X Chat: `theirMessage null` + `messageUnavailable` `x_chat_passcode_required` | `x_chat_passcode_changed`; customer unlocks via `unlockUrl` in Inbox; "Never ask the customer for the passcode". `[mcp]`
- Decision enum (REST and MCP): `send`, `invite`, `booking_link`, `snooze`, `start_sequence`, `meeting_booked`, `dismiss`, `opt_out`. MCP args: `draftId` | `leadId`, `text`, `days` 1–365, `decidedBy` (default "mcp"); REST `by` (default "api"). `[oa; mcp]`
- Draft editing: `text` "replaces the generated draft" (`send` only); sending identical text again → `alreadyDecided`. `[oa; mcp]`
- X reply via draft "goes out immediately as a direct message on X from the account that owns the conversation, uses Energy" (0.6). `[mcp; mcp.md]`
- Scheduling (private partner capability, "enabled per partner"; 403 `scheduling_not_enabled`): `sendAt` RFC 3339 within 30 days, `Idempotency-Key` header, text-only, decision `send` only; worker runs every minute, treats `sendAt` as earliest, "rechecks the original account and conversation, and holds stale approvals"; OAuth/member and operator tokens cannot schedule. Lifecycle in §2.12. `[api: Agency partners; oa]`
- Auto-send mode: NOT documented. The evidence says every reply "is answered only through decide_reply" and "PumpGTM never writes replies for you on X" (marketing page; contradicts the X-draft behaviour in `decide_reply`). `[mcp: How results come back; x-play-page]`
- Classification values: not enumerated (only `classification` field name on `reply.received`). `[guide]`


---

## 7. ANALYTICS & REPORTING

### 7.1 `GET /analytics` / `get_analytics` `[oa; api: GET /api/v1/analytics; mcp: get_analytics]`
- Query: `range` enum `7d|30d|90d` (default 30d), `scope` enum `workspace|team` (default workspace). "Unknown or repeated query parameters are refused."
- Response: `range*`, `scope*`, `timezone*` const `"America/Los_Angeles"`, `period* { since* (inclusive), until* (exclusive; report refresh cutoff), label* }`, `totals*`, `daily*[] { date*, messages*, replies*, invites* }`, `plays*[]` (each with `sequences*[]`), `messages*[]` (message-step rows: `+ sequenceName*, channel* enum ["linkedin","email","x","instagram","whatsapp"], variant*, rankable*`), `channels*[] { id* enum [linkedin,email,x,instagram,whatsapp], name*, messages*, touched*, invites* }`, `team*` (team scope only), `rankings* { plays { highest, lowest }, messages { highest, lowest } }` (each `{ id, name, replyRate, mature, cohortReplies }` or null), `methodology*`, `coverage*`.
- Metric set (totals / play / sequence / message / team-workspace rows): `enrolled` ("All-time current Sequence assignment, not enrollments during this range"), `touched`, `invites`, `connections`, `messages`, `replies`, `meetings`, `mature` ("People eligible for the full 14-day reply comparison"), `cohortReplies`, `replyRate` (0–1 fraction; "Null when no people have a complete 14-day window"; denominator = `mature`, numerator = `cohortReplies`).
- `methodology`: `responseDays` const 14; `minimumRankingSample` const 30; `enrolled` const `"all_time_current_assignment"`; `replies` const `"first_recorded_reply"`; `replyAttribution` const `"last_message_before_first_reply"`.
- `coverage`: `clicks` const `"unavailable"`; `meetings` const `"partial"`; `unmatchedSendEvents` integer.
- Ranking rule: "rankings require at least two non-tied results with 30 eligible people each"; null = insufficient or tied. Windows: activity counted in Pacific time; reply rates need a complete 14-day observation window.
- "All returned channels retain their recorded counts, including channels hidden from the dashboard's Channels tab."

### 7.2 `GET /progress?sinceDays` (default 7) `[oa; docs-quickstart]`
- Untyped. "invites, acceptances, messages, replies and meetings per account"; quickstart: "the funnel (invited, accepted, messaged, replied, meetings booked), the queue depth, and every connected LinkedIn account with today's connection-request budget". Saved observations, not a live probe. MCP equivalent: `get_workspace view=summary` ("funnel and account pacing").

### 7.3 `GET /reports/funnel?group_by=sequence|account` `[oa]`
- `{ groupBy*, excludedWarmupAccounts*[] (always empty, compatibility), total* (untyped), groups*[] { id*, name*, funnel* (untyped) }, experimentArms* (array|object) }`.

### 7.4 `GET /activity` / `get_workspace view=activity` `[oa; mcp: get_workspace]`
- Query: `action` (comma-separated), `outcome` enum `ok|failed|skipped`, `sinceDays`, `limit` (MCP 1–500 default 100; `sinceDays` 0 = all history; `account` filter). Response untyped; `count` = full total. "Bounded recent ledger; polling supplements best-effort webhook delivery."
- Action enum (from `get_workspace.actions`): `resolve`, `invite`, `invite_withdrawn`, `accepted`, `like`, `message`, `followup`, `reply_detected`, `view_profile`, `endorse`, `comment`, `tool_prepare`, `enrich`, `meeting_invited`, `reply_drafted`, `reply_sent`, `reply_dismissed`, `reply_snoozed`, `sequence_started`, `sequence_contact`, `sequence_contact_attempt`, `sequence_contact_cancelled`, `reply_check`, `sequence_stopped`, `meeting_booked`, `meeting_no_show`, `meeting_synced`, `manual_override`, `x_dm`, `x_follow`, `x_like`, `x_follow_back`, `x_unfollow`, `x_repost`, `x_lookup_cached`, `memory_search`, `x_follow_back_scan`, `x_credit_balance`, `x_reply_subscription`, `x_follow_event`, `x_auto_accept`, `instagram_dm`, `instagram_comment`, `instagram_unlock`, `whatsapp_dm`, `track_unavailable`, `track_done`, `ad_campaign_architected`, `ad_campaign_saved`, `ad_creative_generated`, `ad_budget_revised`, `ad_approval_requested`, `ad_campaign_approved`, `ad_campaign_published_paused`, `linkedin_search`, `post_engagement_read`, `activity_check`, `web_pages_read`, `email_found`, `email_campaign_created`, `email_campaign_added`, `email_sent`, `email_replied`, `email_auto_reply`, `email_skipped`, `email_bounced`, `email_unsubscribed`, `hubspot_reply_logged`, `email_click`, `testimonial_submitted`, `sequence_people_added`, `lead_moved`, `sequence_status_changed`, `lead_replenishment_enabled`, `lead_replenishment_disabled`, `recovery_eligible`, `recovery_matched`, `recovery_enrolled`, `recovery_review`, `recovery_invite_sent`, `recovery_invite_accepted`, `recovery_message_sent`, `recovery_reply_detected`, `recovery_suppressed`, `workspace_access_invited`, `workspace_access_granted`, `workspace_access_revoked`, `engine_run`, `linkedin_connect`, `error`.
- Outcome enum: `ok`, `failed`, `skipped`.
- "Each successful [X] write is one activity row and one Energy charge". `[oa: POST /x/actions]`
- Timestamps: "Counts are exact and every timestamp is UTC" (quickstart) vs analytics in Pacific time.

### 7.5 `get_workspace` reporting views `[mcp]`
- `summary` with `sinceDays` 0–365 (default 7) for period-labelled results; `x_posts` reads recent X posts (paid); `suggested_plays`, `playbook`, `play_library`, `case_studies`, `search_methods`.

---

## 8. WEBHOOKS

- Manage: `POST /webhooks { url* (≤2000), events*[1..15] }` → 201 `{ id, url, events, secret }` (secret shown once); `GET /webhooks` → `{ webhooks[] {id, url, events, createdAt}, events[] (catalog) }`; `DELETE /webhooks/{id}` → `{ ok, id }`; `POST /webhooks/{id}/test` → 202 `{ ok, id, event: "ping" }`. Max 10 enabled hooks (409 `webhook_limit_reached`). Registration not idempotent. Not available over MCP. `[oa; api; mcp: Not on this server yet]`
- Event enum (schema): `reply.received`, `lead.invited`, `lead.accepted`, `lead.messaged`, `lead.emailed`, `lead.meeting_booked`, `x.followed`, `linkedin.connected`, `linkedin.disconnected`, `linkedin.limited`, `linkedin.resumed`, `linkedin.watched_post`, `x.competitor_follower`, `x.intent_detected`, `ping`. `[api: POST /api/v1/webhooks]`
- Payload data per event `[guide: Webhooks; api: POST /webhooks description]`:
  - `reply.received`: `replyId, lead, classification, theirMessage, draft` (X: `channel: "x"`, `classification`/`draft` null; encrypted text may be unavailable)
  - `lead.invited`, `lead.accepted`, `lead.emailed`, `lead.meeting_booked`: `lead`
  - `lead.messaged`: `lead` (+ `channel: "x"` for X DMs)
  - `x.followed`: `account, follower, outcome` (`staged | filtered | no_sink`)
  - `x.intent_detected`: `play, person, score, tier, reasons, signals, fit`
  - `x.competitor_follower`: `play, person, signal`
  - `linkedin.connected`: `account {id, displayName}, connectLink {externalUserId, ...}` (fires on the partner workspace for hosted links)
  - `linkedin.disconnected`: `account` (+ `source: provider | dashboard | api`)
  - `linkedin.limited`: `account {id, displayName}, reason: invite_limit, heldSince, retryAt, attempt (1..3)`
  - `linkedin.resumed`: `account, resumedAt, warmupRestarted: false`
  - `linkedin.watched_post`: `profile, post`
  - `ping`: `webhookId, message`
  - `lead` = `{ id, person, company, title, email, linkedinUrl, account, sequenceId, stage }`
- Delivery envelope: JSON POST `{ id, event, createdAt, data }`; headers `X-PumpGTM-Event`, `X-PumpGTM-Delivery` (event id, same every attempt), `X-PumpGTM-Signature: t=<unix>,v1=<hex>` where `v1 = HMAC-SHA256(secret, t + "." + rawBody)` (64 hex chars); reject `|now - t| > 300 s`; dedupe on `id`. `[guide; api: Verify a webhook]`
- Receiver rules: HTTPS on 443, public IPv4 DNS; private/mixed IPs, IP literals, URL credentials, fragments, redirects rejected; answer 2xx within 10 seconds. `[guide; api]`
- Retry policy: best-effort, up to three attempts; "A timeout, network error, 429 or 5xx is retried twice, 1 and 4 seconds later, with the same delivery id. Other non-2xx responses end delivery." No replay queue or event-history endpoint; reconcile by polling lead state and `/activity`. `[guide; api: Events your agent can act on]`

---

## 9. WORKSPACE SETUP / COMPANY PROFILE

- Trigger: `get_workspace` reports `company_profile_unconfirmed` (attention) and `setup { stage, nextStep {say, url} }`; blocked tools return the same `nextStep`. `[mcp: get_workspace, preview_workspace_setup]`
- `readyNow`: "free work, then each tool's Energy price; lead with it and raise billing only when a request needs it". Agents are told to lead with what works right away and never invent onboarding requirements. `[mcp: get_workspace; quickstart: Test]`
- Company profile (`company`): `name`, `website`, `offer`, `buyers`, `audiences`, `proof`. Setup answers (`answers`): `proof`, `best customer`, `warm sources`, `audiences`, `signals`, `channels`. GTM profile stored: proof, warm sources, ideas, channels, exclusions, goal, team (`editUrl`). Exact JSON keys are not given in the evidence. `[mcp: preview_workspace_setup, get_workspace]`
- `preview_workspace_setup` → `reviewed`, `reviewerChanges` (what/why), `reviewToken`; or `status: needs_input` (e.g. no website). Reviewer may replace unclear audiences and removes the customer's own company as a lookalike. Owner/admin only. `[mcp]`
- `save_workspace_setup { company, answers, reviewToken* }`: payload must equal the reviewed one and workspace unchanged since review, else refused; "Saving the company confirms it and starts a fresh set of setup audiences"; returns saved data + setup revision. Then `get_workspace view=playbook` → propose 1–2 campaigns → `check_campaign` → `find_people confirmed=false` + `save_sequence_draft`. `[mcp]`
- `plan_campaigns` → `companyConfirmed`, `setupRevision`, `channels`, `campaigns[]` (channels, needs, already built, `key`), `reason`. `build_campaigns { keys*, expectedRevision* = setupRevision }` → Plays with draft messages (never approves); "Building ends the setup questions". `[mcp]`
- `suggested_plays` view: items with `why`, steps, `setupUrl`, optional `connectFirst`. `play_library` view: every Play with what it does, when it fits, channels, needs, setup link. `[mcp: get_workspace]`
- Pattern: the `next` hint on every MCP result `{ tool, arguments, reason, requiresConfirmation, requiresNewRequestId? }`. `[mcp: How results come back]`

---

## 10. LIMITS AND RULES

### 10.1 Numeric caps (per call)
| Item | Limit | Source |
|---|---|---|
| Sequence steps | 30 graph (indices 0–29) / 20 linear or tracks (0–19); `minItems` 1 | `[api: POST /sequences]` |
| `delayDays` | 0–30 | `[api]` |
| `subject` | 1–200; `messageTmpl` 1–8000; variant `messageTmpl` ≤2000; variant `key` 1–5; `weight` 1–10000; ≤10 variants; ≤10 actions; `count` 1–3; `guidance` ≤1250; ≤5 attachments; sequence `name` 1–160 | `[api]` |
| Connect note | ≤300 chars | `[mcp: save_sequence_draft]` |
| Add leads | 1–500 per request (contacts/manual/csv); CSV ≤500 rows, ≤100 columns, `csvContent` ≤200,000 chars; `person` 1–200; `company`/`title` ≤200; `linkedinUrl` ≤500; `email` ≤320; `xUsername` ≤500 (handle ≤15); `invitePriority` 0–1000; `accountId` 1–160; `listUrl` ≤500 | `[api]` |
| Plays/{id}/leads | 1–500 leads; `candidateIds` 1–200 unique | `[api]` |
| X import | 1–100 unique IDs; enroll ≤200 candidateIds; eligibility ≤100 leads; `/leads/enrich` ≤20 | `[oa; api]` |
| People search | `candidateCount` 5–100; hard-filter arrays ≤40 items; decisions 1–100/call | `[api]` |
| Review pages | candidate and enrolled-lead pages ≤200 rows; `get_x_play_review` 1–200; `review_x_play_candidates` ≤200 | `[api: Handle uncertainty; mcp]` |
| Leads list | `limit` max 500 (MCP 1–500, default 100); `personalFiles` 25/page, `page` 0–400 | `[oa; mcp]` |
| Thread | `limit` 1–100 (default 50); cursor expires 30 min | `[api]` |
| Replies | MCP `limit` 1–200 (default 50) | `[mcp]` |
| Move | ≤500 leads | `[oa]` |
| Remove | `leadIds` 1–500; `companies` 1–100 (1–240 chars) | `[api]` |
| Lead input | 1–5 values (1–2000 chars); exactly 1 file key; upload `size` 1–50,000,000; `fileName` 1–200; uploads batch ≤25; tickets 2 h | `[api; mcp]` |
| Webhooks | ≤10 enabled; 1–15 events each; url ≤2000 | `[api]` |
| Webhook-Play intake | body ≤8192 bytes; `eventId` 1–120 `^[A-Za-z0-9][A-Za-z0-9._:-]*$`; `expectedRevision` 1–2147483647 (or numeric string `^[1-9][0-9]{0,9}$`) | `[api]` |
| People enrich | body ≤4 KB (413); `linkedin` ≤1500; `find` ≤2 | `[api; people-api]` |
| Signals | body ≤8 KB; `roles` 1–10 (2–100 chars); `companyDomains` 1–20 (≤253); `limit` 1–100 (default 50); cursor ≤3000, expires 7 days; recent = 30 days | `[api; signals-api]` |
| Connect links | `expiresInMinutes` 10–43200 (default 7 days); ≤10 open per user; list ≤25 newest | `[oa]` |
| Partner | `externalUserId` ≤120 chars `[A-Za-z0-9_.:@-]`; `brandName` 1–60; 50 free leads per partner | `[oa; api]` |
| AI search | ≤50 tracked questions; `samples` 1–5; `dailyLimitUsd` 0–1000; ≤5 topics; ≤30 audited pages; ≤50 pages returned | `[mcp]` |
| CRM | `offset` 0–10000; `limit` 1–100 | `[mcp]` |
| Account universe | ≤5,000 companies; `maxPeopleTotal` 1–500; `maxCaseStudies` 1–80; `maxEmailLookups` 1–200 | `[mcp]` |
| Energy packs | `packs` 1–100 | `[mcp]` |

### 10.2 LinkedIn pacing and warm-up `[oa: sending-limits; safety-blog: The limits PumpGTM enforces]`
- Daily invite cap 1–30 (`limits.minDailyInviteCap`/`maxDailyInviteCap`); new accounts default 30. No weekly cap ("bounded by 7 × the daily cap").
- Warm-up: 6-day ramp 5, 7, 10, 15, 16, 20 invites/day (73 total); `effectiveDailyCapToday = min(ramp value, configured cap)`. `mode warmup` restarts the ramp; `mode outreach` graduates (409 `warmup_in_progress` unless `acknowledgeEarlyGraduation: true`).
- Profile views/lookups ≤100/day; messages, likes and other actions ≤100/day shared; hours 8am–6pm account time zone; random 5–30 s waits; "roughly 1 in 4 of the six-minute runs acts"; no connection notes; invite decline → hold, test invite after 24 h, then 48, then 72 (matches `linkedin.limited attempt 1..3`).
- Fixed/residential proxy per account near the user (`proxyCountry`).

### 10.3 X pacing
- ≤100 DMs/day per workspace; random gaps; daily X budget; thread check; bio/follower filters (see §5.3). `[x-play-page]`

### 10.4 Energy cost table (two sources, note discrepancies)
| Action | `[mcp.md]` / `[mcp: energy]` | `[guide: Energy]` |
|---|---|---|
| Person found by people search | 2 | 2 |
| Liker/follower collected by X Play | 1 | 1 |
| X DM with history check | 5 | 5 |
| X DM without check / X reply | 0.6 | 0.6 |
| X follow / unfollow / like / repost | 1 each | 1 |
| Profile lookup | ~1 (people-api) | per lookup |
| X account lookup | ~0.2 | — |
| Mobile number | ~10 when found | — |
| Plan allowance | 1,500 Starter / 4,000 Hypergrowth per LinkedIn account per month | — |
| Extra packs | $10 for 75, or 100 per $10 from $50 up; auto top-up $10/75 when balance < 50; Energy lasts 12 months | "$10 for 100 Energy" |
| 1 Energy | $0.05 (`centsPerEnergy` on `GET /energy`) | — |
- People-data lookups "priced at twice [provider] cost, rounded up to the next 0.1 Energy"; reserve-then-settle; no-match and cached lookups free; never auto-retry paid calls. `[people-api]`
- Partner metering: 50 free leads, then 403 `billing_required`; with Energy, 2 per person from the partner pool; `monthlyLeadCap` → 403 `user_lead_cap_reached`. `[api: Partners]`

### 10.5 Idempotency / concurrency
- `requestId` regex `^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$` (8–120 chars). Optional on most writes, required on people-search runs and X imports (and on every MCP write). Same id + same body → stored result with `reused`/`replayed: true`; same id + different body → 409 (`idempotency_conflict`, `sequence_create_request_conflict`, `sequence_edit_request_conflict`). Omitted → random key. Undo-remove uses `removalIds` instead; moves use `operationId` UUID. `[api: intro; oa]`
- `expectedRevision` (≥1) optimistic concurrency on sequences, Plays (people-search `draft_changed`, X plays), setup (`setupRevision`), webhook-Play; CRM `expected_revision` (0 creates). `[api; mcp]`
- Scheduled replies use `expectedVersion` + `Idempotency-Key` header. `[oa]`
- Undo windows: lead move 5-second cancel window (`executeAfter`, `serverNow`); removal settling "up to ten minutes" (`undoAfter`, `Retry-After`). `[oa; api]`

### 10.6 Pagination patterns
- Cursor: `after` + `nextCursor` (candidates, Play leads, X review), `cursor` + `nextCursor` (threads, LinkedIn accounts, scheduled replies), `nextCursor`/`hasMore` on lists; stop at null. Offset: CRM `offset`/`nextOffset`; `page` for personalFiles. Signals: opaque signed cursor + `hasMore` + `nextPollMs`. `[api: Handle uncertainty; oa; mcp]`

### 10.7 Other rules
- "Nothing reaches LinkedIn, email or X until a person approves it"; no tool call sends synchronously; sends happen in the paced engine inside working hours, account limits and reply stops. `[mcp; quickstart]`
- OAuth tokens: access 30 days, refresh 90. No fixed MCP rate limit; discovery paced by daily provider budget. Deprecation: ≥90 days notice (`Deprecation: true`, `Sunset` header). `[mcp: Connect, Versioning; guide: Versioning]`
- Do-not-contact list: companies excluded via `remove_leads target=companies`; Plays stop finding people there. `[mcp: remove_leads]`
- Reply stops everything for that person across channels ("A detected reply stops the remaining outreach"). `[integrations_linkedin.md line 49]`

---

## 11. ERROR MODEL

- HTTP shapes `[api: intro; guide: Retries and idempotency]`: 400 `{ error: "invalid_request", issues }`; 401 (missing/revoked key); 402 `energy_exhausted`; 403 (workspace/feature/channel; `enterprise_required`, `partner_key_required`, `user_disabled`, `x_channel_disabled`, `scheduling_not_enabled`, `billing_required`, `user_lead_cap_reached`, `energy_required`); 404 `{ error: "not_found", resource }` (resources seen: `sequence`, `lead`, `import`, `play`, `review`; also `user_not_found`, `account_not_found`, `connect_link_not_found`, `person_unavailable`); 409 `{ error, message }` (customer-safe code; "changes nothing"); 410 (retired endpoint; expired signals cursor); 413 `request_too_large`; 429 `rate_limited` with `Retry-After`; 500 `internal_error`; 502 (`thread_unavailable`, `inmail_credits_unavailable`); 503 (`sequence_move_unconfirmed`, `lead_delete_unavailable`, `disconnect_failed`, `people_data_unavailable`, X resolve `status unknown`).
- Non-standard shapes: `PATCH /sequences/{id}/status` → 400 `{ error: "status must be one of active, paused, draft" }`, 404 `{ error: "sequence not found" }`, 409 `{ ok: false, error: sequence_approval_required | archived_sequence_is_read_only }`. `[oa]`
- 409 codes catalogue: `play_has_no_sequence`, `x_not_connected`, `idempotency_conflict`, `sequence_not_active`, `sequence_not_ready`, `sequence_revision_conflict`, `lead_sender_unavailable`, `linkedin_not_connected`, `lead_import_csv_*` (with `details`), `sequence_create_request_conflict`, `sequence_step_limit_exceeded`, `sequence_steps_invalid`, `sequence_edit_request_conflict`, `sequence_has_progress`, `sequence_edit_would_repeat`, `archived_sequence_is_read_only`, `sequence_must_be_draft`, `sequence_approval_required`, `targeting_needs_clarification`, `draft_changed`, `all_candidates_require_a_decision`, `webhook_limit_reached`, `warmup_in_progress`, `account_unavailable`, `account_limit_reached`, `connect_link_limit_reached`, `connect_link_not_pending`, `email_in_use`, `thread_account_unavailable`, `version_conflict`, `reapproval_required`, `conversation_changed`, `reply_not_editable`, `lead_delete_blocked` (+`reason`, `message`, `retryAfterSeconds`), and the `lead_input_*` family: `lead_input_already_replied`, `lead_input_sequence_finished`, `lead_input_step_already_sent`, `lead_input_channel_unavailable`, `lead_input_no_sequence`, `lead_input_sequence_has_no_input_step`, `lead_input_unknown_key`, `lead_input_invalid_value`, `lead_input_step_uses_generated_asset`, `lead_input_not_a_file`, `lead_input_not_text`, `lead_input_file_invalid`, `lead_input_file_unavailable`, `lead_input_file_does_not_fit`, `lead_input_email_file_not_allowed`, `lead_input_file_wrong_type`, `lead_input_file_too_large`, `lead_input_upload_expired`, `lead_input_upload_invalid`, `lead_input_upload_missing`. `[oa; api]`
- 400 codes: `invalid_cursor`, `user_header_required`, `invalid_external_user_id`, `invalid_monthly_lead_cap`, `nothing_to_update`, `invalid_body`, `invalid_expires_in_minutes` (with `field`). `[oa]`
- MCP error: `isError: true`, `{ status, retryable, changed, message, details }`; `resource_not_found`; `energy_exhausted` returns needed/left/nothing charged + one link. Feature-gated groups "return a structured error". `[mcp; mcp.md]`
- Partial-success semantics: eligibility may return 200 with null results; undo-remove and move results must be inspected per item even on 200. `[api]`

---

## 12. UNKNOWNS (referenced but undefined in the evidence)

- Exact JSON of `GET /replies` items, `GET /progress`, `GET /activity` rows, `GET /reports/funnel.total/funnel`, `GET /x/watches.funnel`, `GET /signals` catalog, `GET /x/readiness.*.data`, `GET /energy.costs` map, `GET /leads.person` object and the lead "milestones", "reply sentiment", "last error" fields (all `additionalProperties: true`). `[api]`
- `reply.received.classification` values; lead "reply sentiment" values. `[guide; api]`
- X watch `status` values; X lead `stage` values. `[oa]`
- `sequence_email_settings.settings` sub-fields (mailbox ids, schedule shape, daily limit name). `[mcp]`
- Company profile / setup `answers` exact keys; `check_campaign.campaign` exact keys; `edit_x_play.plan` keys; `review_people.decisions` and `review_x_play_candidates.decisions` item keys (likely `candidateId`, `decision`, `note`); `find_people.list.filters` and `accounts` shapes. `[mcp]` (server card has no input schemas; `/mcp/tools.json` returned 404 in evidence `[mcp_tools.json]`)
- Working-hours configuration API (only "8am to 6pm in the account's time zone" marketing claim; email "sending windows"). `[safety-blog; integrations_email]`
- `executionBlockReason` values. `[oa]`
- `GET /leads?stage` vocabulary (`connected`, `meeting_booked`) vs MCP enum (`accepted`, no `meeting_booked`) — unresolved. `[oa; mcp]`
- Whether `inmail` is a real step kind (only a template name and credits endpoints). `[mcp; oa]`
- `sendspark` tool `params` contents. `[api]`
- Reply "auto-send" / autopilot for replies: not documented anywhere.
- Pricing discrepancy: packs "$10 for 75" (`[mcp.md]`, `[mcp: energy]`) vs "$10 for 100" (`[guide: Energy]`).
- Tool count discrepancy: card lists 70, docs page says 69 (+ prose `get_linkedin_inmail_credits`), MCP page says "up to 38 tools, depending on the workspace's features" load for a client. `[card; mcp]`
- `linkedin.watched_post` profile/post payload fields; `x.intent_detected.reasons/fit` shapes. `[guide]`
- `/mcp/platforms.md` and `/mcp/tools.json` pages were 404 at capture time. `[mcp_platforms.md; mcp_tools.json]`
