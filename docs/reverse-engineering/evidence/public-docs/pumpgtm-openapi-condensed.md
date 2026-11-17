
## GET /analytics
Read outreach analytics by Play, Sequence and channel

Read the same outreach results as /analytics: totals, daily activity, Plays and their Sequences, message-step performance, channels and highest/lowest eligible results. Defaults to range=30d and scope=workspace. Team scope requires a personal OAuth or personal delegation key belonging to a current Team owner/admin, used from its own home workspace; shared workspace and operator keys cannot read team scope. Enrolled is all-time current Sequence assignment; other activity uses the selected Pacific-time window. Reply rates use a full 14-day observation window and rankings require 30 eligible people per result. Null rankings mean insufficient or tied results. Clicks are unavailable; meetings have partial coverage. Cached report timestamps are returned explicitly. No message text, lead records,

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- range (query): None enum=["7d", "30d", "90d"] — 
- scope (query): None enum=["workspace", "team"] — 

Response 200:
- range*: enum enum=["7d", "30d", "90d"] — 
- scope*: enum enum=["workspace", "team"] — 
- timezone*: ? — 
- period*: object — 
  - since*: string — Inclusive start.
  - until*: string — Exclusive end and report refresh cutoff.
  - label*: string — 
- totals*: object — 
  - enrolled*: integer — All-time current Sequence assignment, not enrollments during this range.
  - touched*: integer — 
  - invites*: integer — 
  - connections*: integer — 
  - messages*: integer — 
  - replies*: integer — 
  - meetings*: integer — 
  - mature*: integer — People eligible for the full 14-day reply comparison.
  - cohortReplies*: integer — 
  - replyRate*: anyOf — 
- daily*: array — 
  - date*: string — 
  - messages*: integer — 
  - replies*: integer — 
  - invites*: integer — 
- plays*: array — 
  - id*: string — 
  - name*: string — 
  - enrolled*: integer — All-time current Sequence assignment, not enrollments during this range.
  - touched*: integer — 
  - invites*: integer — 
  - connections*: integer — 
  - messages*: integer — 
  - replies*: integer — 
  - meetings*: integer — 
  - mature*: integer — People eligible for the full 14-day reply comparison.
  - cohortReplies*: integer — 
  - replyRate*: anyOf — 
  - sequences*: array — 
    - id*: string — 
    - name*: string — 
    - enrolled*: integer — All-time current Sequence assignment, not enrollments during this range.
    - touched*: integer — 
    - invites*: integer — 
    - connections*: integer — 
    - messages*: integer — 
    - replies*: integer — 
    - meetings*: integer — 
    - mature*: integer — People eligible for the full 14-day reply comparison.
    - cohortReplies*: integer — 
    - replyRate*: anyOf — 
- messages*: array — 
  - id*: string — 
  - name*: string — 
  - enrolled*: integer — All-time current Sequence assignment, not enrollments during this range.
  - touched*: integer — 
  - invites*: integer — 
  - connections*: integer — 
  - messages*: integer — 
  - replies*: integer — 
  - meetings*: integer — 
  - mature*: integer — People eligible for the full 14-day reply comparison.
  - cohortReplies*: integer — 
  - replyRate*: anyOf — 
  - sequenceName*: string — 
  - channel*: enum enum=["linkedin", "email", "x", "instagram", "whatsapp"] — 
  - variant*: anyOf — 
  - rankable*: boolean — 
- channels*: array — 
  - id*: enum enum=["linkedin", "email", "x", "instagram", "whatsapp"] — 
  - name*: string — 
  - messages*: integer — 
  - touched*: integer — 
  - invites*: integer — 
- team*: anyOf — 
- rankings*: object — 
  - plays*: anyOf — 
  - messages*: anyOf — 
- methodology*: object — 
  - responseDays*: ? — 
  - minimumRankingSample*: ? — 
  - enrolled*: ? — 
  - replies*: ? — 
  - replyAttribution*: ? — 
- coverage*: object — 
  - clicks*: ? — 
  - meetings*: ? — 
  - unmatchedSendEvents*: integer — 

## POST /integrations/hubspot
Retired HubSpot signup endpoint

Use POST /plays/{id}/webhook with a Webhook Play. This old endpoint always returns 410 without processing the request.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

## POST /plays/{id}/webhook
Receive a signup event in a Webhook Play

Receives one supplied contact from a backend or automation tool. Workspace bearer authentication scopes tenancy; the URL identifies the Play and expectedRevision pins its revision. dryRun defaults to true and validates without saving. Live events enter review; eligible auto-add uses the linked approved active sequence. No implicit activation or paid identity lookup. Stable Play/eventId identity deduplicates retries; changed contact fields conflict. No Team delegation. Maximum body size 8192 bytes.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
- expectedRevision*: anyOf — 
- eventId*: string — 
- name: anyOf — 
- email: anyOf — 
- company: anyOf — 
- title: anyOf — 
- linkedinUrl: anyOf — 
- xUsername: anyOf — 
- dryRun: anyOf — 

Response 200:
(alt)
  - status*: ? — 
  - dryRun*: ? — 
  - contacted*: ? — 
  - message*: string — 
(alt)
  - status*: string — 
  - dryRun*: ? — 
  - contacted*: ? — 
  - batchId*: string — 
  - candidateId*: string — 
  - reused*: boolean — 

## POST /plays/{id}/leads
Add people to a Play

Works on any Play. Send leads: 1 to 500 people, each with at least one of linkedinUrl, email or xUsername. They go straight into the Play's sequence and are tagged with the Play, so they show in GET /plays/{id}/leads. Each person is queued for the channels the sequence has steps for; people already known by LinkedIn, email or X handle are skipped. Your request is the approval: a draft sequence is approved and started; a paused sequence takes the people and stays paused. Nothing is sent in this call; an active sequence sends in its next working window. 409 play_has_no_sequence when the Play has none. Reusing requestId with the same body replays the stored result. The older body with candidateIds behaves exactly like POST /plays/{id}/enroll.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
(alt)
  - requestId: string — Optional idempotency key; reuse it only to retry this exact request. Omitted means a fresh request.
  - accountId: string — Optional LinkedIn sender: the public id from the partner LinkedIn accounts list or get_workspace channels.linkedin.data.senders.items. Legac
  - leads*: array — 
    - person*: string — 
    - company: anyOf — 
    - title: anyOf — 
    - linkedinUrl: anyOf — 
    - email: anyOf — 
    - xUsername: anyOf — 
(alt)
  - expectedRevision*: integer — Current saved revision. Fetch again after a 409; do not silently retry a changed plan.
  - sequenceId*: string — 
  - sequenceRevision*: integer — Current saved revision. Fetch again after a 409; do not silently retry a changed plan.
  - candidateIds*: array — 

Response 201:
- playId*: string — 
- addResult*: object — { method: "contacts", batchId, status: "completed", sequenceId, sequenceStatus, reused, addedLeadIds[], summary: { submittedCount, addedCoun

## GET /plays/{id}/leads
List the Play's leads

Leads in the selected Play, from its runs or added with POST /plays/{id}/leads, with stable cursor pagination. Use each lead ID to read detailed state or stop its automation.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 
- limit (query): integer  — 
- after (query): string  — Pass nextCursor from the previous response until null.

Response 200:
- playId*: string — 
- leads*: array — 
  - id*: string — 
  - name*: anyOf — 
  - linkedinUrl*: anyOf — 
  - email*: anyOf — 
  - xUserId*: anyOf — 
  - username*: anyOf — 
  - sequenceId*: anyOf — 
  - stage*: string — 
  - createdAt*: string — 
- nextCursor*: anyOf — 
- hasMore*: boolean — 

## POST /x/watches
Create an X Play

From now on, people who follow the account (followers), engage with any post (every_post) or engage with one post (post, with postUrl) are collected for review and then DMed with the sequence. Pass exactly one of message (a one-step DM sequence is created; customer credential required) or sequenceId (an existing X sequence). Nothing is sent in this call. 409 x_not_connected when the account is not connected.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- source*: enum enum=["followers", "every_post", "post"] — 
- postUrl: string — Required when source is post: an x.com/{user}/status/{id} URL.
- message: string — 
- sequenceId: string — 
- name: string — 
- as: string — Connected account to act as; defaults to the workspace's account.
(alt)
(alt)

Response 201:
- id*: string — 
- source*: string — 
- postId*: anyOf — 
- sequenceId*: string — 
- status*: string — 
- as*: anyOf — 
- peopleSeen*: integer — 
- waitingForReview*: integer — 
- createdAt*: string — 

## GET /x/watches
List X Plays with people waiting and funnels

Every X Play (a follower or post-engager watch plus its DM sequence) with how many people are waiting for review and the sequence funnel. Requires the X channel (403 x_channel_disabled otherwise).

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Response 200:
- watches*: array — 
  - id*: string — 
  - source*: enum enum=["followers", "every_post", "post"] — 
  - postId*: anyOf — 
  - sequenceId*: string — 
  - status*: string — 
  - as*: anyOf — 
  - peopleSeen*: integer — 
  - waitingForReview*: integer — 
  - createdAt*: string — 
  - funnel*: object — 

## GET /workspaces
List accessible workspaces

Use the MCP key without X-PumpGTM-Client. Returns only its workspace and permitted Team workspaces. Select a returned ID on subsequent requests; a header never grants access.

Response 200:
- workspaces*: array — 
  - id*: string — 
  - name: string — 
  - role: enum enum=["owner", "admin", "member"] — 

## GET /x/accounts
List connected X identities

Read saved account identities. No provider health check or OAuth refresh.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Response 200:
- accounts*: array — 
  - userId*: string — Numeric X user ID as a string. Never convert it to a JavaScript number.
  - handle*: string — 

## GET /x/readiness
Read account, billing and Energy state

Read-only snapshot. Check each section's state/issues; data may be null. Provider health is unverified. A connection or positive follower result does not guarantee delivery.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Response 200:
- workspaceId*: string — 
- asOf*: string — 
- accounts*: object — 
  - state*: enum enum=["complete", "partial", "unavailable"] — 
  - observedAt*: anyOf — 
  - data*: anyOf — 
  - issues*: array — 
    - code*: string — 
    - message*: string — 
    - retryable*: boolean — 
- billing*: object — 
  - state*: enum enum=["complete", "partial", "unavailable"] — 
  - observedAt*: anyOf — 
  - data*: anyOf — 
  - issues*: array — 
    - code*: string — 
    - message*: string — 
    - retryable*: boolean — 
- energy*: object — 
  - state*: enum enum=["complete", "partial", "unavailable"] — 
  - observedAt*: anyOf — 
  - data*: anyOf — 
  - issues*: array — 
    - code*: string — 
    - message*: string — 
    - retryable*: boolean — 
- providerHealthChecked*: ? — 
- deliveryGuaranteed*: ? — 
- note*: string — 

## GET /energy
Read this period's Energy balance

Energy for the current month on a metered workspace: allowance, used, remaining, per-action costs and cents per Energy. { enabled: false } when the workspace is not metered. Partner end users draw from the partner's pool. A balance is not a reservation.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Response 200:
- enabled*: boolean — 
- used: integer — 
- remaining: integer — 
- periodStart: string — 
- costs: object — 
- centsPerEnergy: number — 

## POST /x/users/resolve
Resolve a handle to a numeric X ID

One exact public handle lookup through the public X data provider. No email-to-X enrichment or fuzzy identity matching. An unverified or unavailable profile returns HTTP 503 with status unknown and user null. No official X fallback.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- username*: string — Public X handle, with optional @. Case-insensitive.

Response 200:
- status*: ? — 
- user*: object — 
  - xUserId*: string — Numeric X user ID as a string. Never convert it to a JavaScript number.
  - username*: string — 
  - name*: string — 
  - checkedAt*: string — 
  - evidence*: ? — 
- provider*: string — Identifies the PumpGTM data source used for this check.
- sendsMessages*: ? — 

## POST /x/eligibility
Check whether leads follow your account

Direction: the lead follows the connected account. Supply exactly one X identity per lead. Handles use direct relationship evidence. Numeric IDs use a bounded public follower snapshot: presence is true; absence is null, never a verified false. null means unknown, not eligible or ineligible. Provider errors can produce HTTP 200 with unknown individual results. Up to 100 leads; sequential work is time bounded, so small batches are preferable. Per-instance short cache may be reused; checkedAt is evidence time. No messages are sent.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- account*: string — Public X handle, with optional @. Case-insensitive.
- leads*: array — 
  - reference: string — 
  - xUsername: string — Public X handle, with optional @. Case-insensitive.
  - xUserId: string — Numeric X user ID as a string. Never convert it to a JavaScript number.
  (alt)
  (alt)

Response 200:
- account*: string — 
- results*: array — 
  - reference: string — 
  - xUsername: string — 
  - xUserId*: anyOf — 
  - followsAccount*: anyOf — 
  - checkedAt*: anyOf — 
  - reason*: anyOf — 
  - evidence*: anyOf — 
- provider*: string — Identifies the PumpGTM data source used for this check.
- sendsMessages*: ? — 

## POST /leads/enrich
Bridge emails or LinkedIn URLs to X identities

Up to 20 leads, each with one email or one public LinkedIn profile URL. Emails resolve to a LinkedIn identity first; only exact, source-governed public profile links then bridge LinkedIn to X. No name matching or fuzzy identity guesses. Results may be unavailable per lead; nothing is enrolled or sent.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- leads*: array — 
  - reference: string — 
  - email: string — 
  - linkedinUrl: string — Public linkedin.com/in/... profile URL.
  (alt)
  (alt)

Response 200:


## GET /signals
Discover Signals API availability

Lists available event types and coming-soon roadmap categories. Only available types can be read.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Response 200:


## POST /signals/events
Read events for an available signal type

Read-only shared-index developer preview. No Energy charged or paid collection. Stable event IDs, workspace/filter-bound cursors. start=now bootstraps future observations; recent reads up to 30 days. Cursor expires after 7 days. Collection is demand-driven; no coverage or cadence guarantee.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- name*: ? — 
- filters: object — 
  - roles: array — 
  - companyDomains: array — 
  - minHeadcount: integer — 
  - maxHeadcount: integer — 
- cursor: anyOf — 
- start: enum enum=["now", "recent"] — 
- limit: integer — 

Response 200:


## POST /people/enrich
Enrich one person by email or LinkedIn URL

Send exactly one of email or linkedin; an email is matched to a LinkedIn profile first. Returns { id, person, missing?, energyUsed }. person is null, and nothing is charged, when nobody matches or the profile found is someone else's; otherwise name, title, headline, location, company {name, domain}, linkedin, x, workEmail {address, matchesCompanyDomain, verification {status, method, mailProvider, summary}}, and connections when any are observed. find adds paid extras: x (their X account, only with public evidence it is theirs) and work_email. A requested extra that did not come back appears in missing with a reason. Energy-priced on metered workspaces (402 when exhausted, nothing charged). Request body is limited to 4 KB (413). Nothing is sent. Send leadId (one of your own leads, the same 

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- email: string — Email address to match to a LinkedIn profile. Omit when sending linkedin.
- linkedin: string — Public linkedin.com/in/... profile URL. Omit when sending email.
- find: array — 
  items enum=["x", "work_email"]
- leadId: string — Your own lead to receive the found work email. It must be the same person and have no email.

Response 200:


## GET /x/plays
Discover X Plays and their revisions

Use reviewApiEnabled to identify Plays supporting candidate review, import, lookup and enrollment. Plays must be explicitly enabled for review APIs. Autopilot Plays cannot use manual import/enrollment.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Response 200:
- plays*: array — 
  - id*: string — 
  - name*: string — 
  - status*: enum enum=["active", "paused", "archived"] — 
  - revision*: integer — Current saved revision. Fetch again after a 409; do not silently retry a changed plan.
  - sequenceId*: anyOf — 
  - accountUserId*: anyOf — 
  - reviewApiEnabled*: boolean — 
  - autopilot*: boolean — 

## GET /plays/{id}/candidates
Page through review candidates

Saved review candidates, not evidence of a current follow relationship. Returns Play and sequence revisions for guarded enrollment. Cursor paging covers all batches.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 
- limit (query): integer  — 
- after (query): string  — Pass nextCursor from the previous response until null.
- filter (query): None enum=["all", "unreviewed", "good_fit", "not_a_good_fit"] — 

Response 200:
- counts*: object — 
  - total*: integer — 
  - unreviewed*: integer — 
  - goodFit*: integer — 
  - notAGoodFit*: integer — 
- candidates*: array — 
  - id*: string — 
  - xUserId*: string — Numeric X user ID as a string. Never convert it to a JavaScript number.
  - username*: anyOf — 
  - name*: anyOf — 
  - status*: enum enum=["proposed", "approved", "imported", "rejected"] — 
  - review*: anyOf — 
- nextCursor*: anyOf — 
- play*: object — 
  - id*: string — 
  - name*: string — 
  - revision*: integer — Current saved revision. Fetch again after a 409; do not silently retry a changed plan.
  - status*: string — 
- sequence*: anyOf — 
- reviewUrl*: string — 

## GET /plays/{id}/candidates/lookup
Find one existing candidate by X identity

Single-identity form of the POST lookup: pass xUserId or username as a query parameter. Exact lookup across all saved Play batches; ambiguous matches return 409. Does not check a live follower relationship.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 
- xUserId (query): string  — 
- username (query): string  — 

Response 200:
- exists*: boolean — 
- candidate*: anyOf — 
- enrolledInPlay*: boolean — 
- currentFollowerStatus*: ? — 
- existingLeads*: array — 
  - id*: string — 
  - sequenceId*: anyOf — 
  - playId*: anyOf — 
  - stage*: string — 

## POST /plays/{id}/candidates/lookup
Find existing candidates by X identity

Exact identity lookup across all saved Play batches. Each identity requires xUserId OR username. Ambiguous matches return 409; use numeric IDs or the candidate list. This endpoint does not check a live follower relationship.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
- identities*: array — 
  - xUserId: string — Numeric X user ID as a string. Never convert it to a JavaScript number.
  - username: string — Public X handle, with optional @. Case-insensitive.
  (alt)
  (alt)

Response 200:
- playId*: string — 
- results*: array — 
  - exists: boolean — 
  - candidate: anyOf — 
  - enrolledInPlay: boolean — 
  - currentFollowerStatus: ? — 
  - existingLeads: array — 
    - id*: string — 
    - sequenceId*: anyOf — 
    - playId*: anyOf — 
    - stage*: string — 

## POST /plays/{id}/import
Import external leads for review

Requires an enabled, non-archived, manual-review Play. Resolve known handles first, then submit numeric IDs. Names are caller-provided display labels, not verified identity evidence. The operation is atomic: 1–100 unique IDs. requestId is scoped to workspace + Play; retry the exact same normalized payload for the stored result. Reusing it with changed inputs returns 409. Existing candidates retain their review state. Import does not verify followers, enroll, change sequence status or send. Duplicate candidate records produce 409.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
- requestId*: string — 
- expectedRevision*: integer — Current saved revision. Fetch again after a 409; do not silently retry a changed plan.
- leads*: array — 
  - xUserId*: string — Numeric X user ID as a string. Never convert it to a JavaScript number.
  - name: string — 
  - reference: string — 

Response 200:
- playId*: string — 
- batchId*: string — 
- requestId*: string — 
- replayed*: boolean — 
- results*: array — 
  - xUserId*: string — Numeric X user ID as a string. Never convert it to a JavaScript number.
  - reference*: anyOf — 
  - candidateId*: string — 
  - result*: enum enum=["imported", "existing_candidate"] — 
- enrolled*: ? — 
- sendsMessages*: ? — 

## POST /plays/{id}/enroll
Approve candidates and enroll through the existing engine

Mutating action: marks selected candidates good fit and queues newly enrolled leads. Requires exact Play and sequence revisions and the Play's own connected sender/sequence. An active eligible sequence can send on its next engine run. Does not activate, approve or change the sequence itself. Existing leads (including stopped/replied leads) keep their original state and sequence. Repeating a completed good-fit review returns already_reviewed; conflicting review decisions return 409. POST /plays/{id}/leads with this same candidateIds body does the same.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
- expectedRevision*: integer — Current saved revision. Fetch again after a 409; do not silently retry a changed plan.
- sequenceId*: string — 
- sequenceRevision*: integer — Current saved revision. Fetch again after a 409; do not silently retry a changed plan.
- candidateIds*: array — 

Response 200:
- results*: array — 
  - candidateId*: string — 
  - result*: enum enum=["enrolled", "existing_lead", "already_reviewed", "rejected"] — 
  - leadId*: anyOf — 
- sequenceStatus*: anyOf — 
- sequenceStatusChanged*: ? — 
- reviewUrl*: string — 

## POST /x/actions
Follow, like or repost as a connected account

One write as a connected X account: follow a profile URL or @handle, or like/repost a post URL. Never sends a DM or writes a post. Each successful write is one activity row and one Energy charge on metered workspaces (402 when exhausted). Requires the X channel; 409 x_not_connected when the account is not connected.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- action*: enum enum=["follow", "like", "repost"] — 
- target*: string — Profile URL or @handle for follow; post URL for like and repost.
- as: string — Connected account to act as; defaults to the workspace's account.

Response 200:
- action*: string — 
- as*: string — 
- username: string — 
- postId: string — 
- done*: ? — 

## GET /x/leads/{id}
Read one lead's saved progress

Tenant-owned X lead only. Stage/milestones are saved observations, not a live provider probe. automationStopped means the sequence is done/stopped; it does not distinguish normal completion from a manual stop.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 200:
- lead*: object — 
  - id*: string — 
  - xUserId*: anyOf — 
  - username*: anyOf — 
  - accountUserId*: anyOf — 
  - playId*: anyOf — 
  - sequenceId*: anyOf — 
  - stage*: string — 
  - automationStopped*: boolean — 
  - currentStep*: integer — 
  - nextActionAt*: anyOf — 
  - followedAt*: anyOf — 
  - followedBackAt*: anyOf — 
  - messagedAt*: anyOf — 
  - repliedAt*: anyOf — 
  - optedOutAt*: anyOf — 
  - deliveryGuaranteed*: ? — 

## POST /x/leads/{id}/stop
Stop this lead's future automation

Idempotent stop using the existing removal controls. Stops all sequence lanes for this lead, preserving contacted history; uncontacted queued leads become skipped. Available even after X is disabled. Does not recall dispatched actions, permanently suppress the identity, or delete history.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 200:
- ok*: ? — 
- lead*: anyOf — 
- scope*: ? — 
- permanentSuppression*: ? — 
- note*: string — 

## GET /sequences
List existing sequences

Read tenant-owned sequences, exact lead counts, executionModel and routing. Compact steps use index/message and retain next, condition and sendIf. GET /sequences/{id} returns the editable stepIndex/messageTmpl shape and exact revision; read it before PUT so graph edges and conditions survive a full replacement. Create with POST /sequences, replace with PUT /sequences/{id}, and pause or resume with PATCH /sequences/{id}/status.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Response 200:
- sequences*: array — 
  - id*: string — 
  - name*: string — 
  - status*: string — 
  - revision*: integer — 
  - approvedAt*: anyOf — 
  - approvedRevision*: anyOf — 
  - executionBlockReason*: anyOf — 
  - executionModel*: enum enum=["linear", "tracks", "graph"] — linear (default on create): up to 20 ordered steps; X steps cannot mix other channels. tracks: up to 20 steps in parallel LinkedIn, email an
  - leadCount*: integer — 
  - channels*: array — 
  - steps*: array — 
    - index*: integer — 
    - kind*: enum enum=["connect", "message", "engage", "email", "x_dm", "x_engage", "instagram_dm", "branch"] — 
    - delayDays*: integer — 
    - subject*: anyOf — 
    - message*: anyOf — 
    - next*: anyOf — 
    - condition*: anyOf — 
    - sendIf*: anyOf — 
    - attachments*: array — Existing uploaded attachment references for LinkedIn message steps. Preserve returned references when editing.
      - id*: string — 
      - name*: string — 
      - size*: integer — 
    - actions*: anyOf — 
    - variants*: anyOf — 
    - tool*: anyOf — 

## POST /sequences
Create a complete sequence

Save a complete sequence with the same step and approval rules as the PumpGTM agent tools: up to 30 graph steps or 20 linear/tracks steps. Your request is the approval: with a workspace or partner key the sequence is approved and live when this returns (live: true). Nothing is sent until people are added; sends retain working hours, account limits and reply stops. X steps need x_channel. Graph reply safety is automatic across previously contacted email, LinkedIn and X conversations, independently of xThreadCheck; unavailable reply evidence holds the action. requestId (8-120 characters, first alphanumeric) replays the stored result with replayed: true for the same body; 409 sequence_create_request_conflict for changed content; 409 sequence_step_limit_exceeded for the model limit or sequence

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- requestId: string — Optional idempotency key; reuse it only to retry this exact request. Omitted means a fresh request.
- name*: string — 
- steps*: array — Complete replacement, not a patch. Runtime limit: 30 steps for graph; 20 for linear/tracks. With LinkedIn, linear starts with connect and tr
  - stepIndex: integer — Optional zero-based position; when supplied it must match the array index. Graphs allow indices 0–29; linear/tracks allow 0–19.
  - kind*: enum enum=["connect", "message", "engage", "email", "x_dm", "x_engage", "instagram_dm", "branch"] — 
  - delayDays*: integer — linear: after the previous step, with acceptance required after connect. tracks: after the previous step in that channel's lane. graph: dela
  - subject: anyOf — 
  - messageTmpl: anyOf — 
  - sendIf: anyOf — 
  - next: anyOf — 
  - condition: anyOf — 
  - attachments: array — Existing uploaded attachment references for LinkedIn message steps. Preserve returned references when editing.
    - id*: string — 
    - name*: string — 
    - size*: integer — 
  - actions: array — Required and non-empty for engage or x_engage; x_engage supports follow and unfollow only.
    - type*: enum enum=["follow", "unfollow", "view_profile", "like_last_post", "endorse_first_skill", "comment_last_post"] — 
    - count: integer — like_last_post only: how many of their newest posts to react to. In a step with comment_last_post the reaction goes once on the post the com
    - reaction: enum enum=["like", "celebrate", "support", "love", "insightful", "funny"] — 
    - guidance: string — comment_last_post only: optional guidance for the comment PumpGTM writes for each person's latest original post. Every comment waits for the
    - text: string — Older name for guidance on comment_last_post; read as guidance, never posted as written.
  - variants: anyOf — 
  - tool: anyOf — 
- executionModel: enum enum=["linear", "tracks", "graph"] — linear (default on create): up to 20 ordered steps; X steps cannot mix other channels. tracks: up to 20 steps in parallel LinkedIn, email an
- xThreadCheck: boolean — Workspace-wide optional X prior-conversation check (5 Energy per DM instead of 0.6), default off. Omit to retain the saved setting. Automati

Response 201:
- sequence*: object — Full sequence: { id, name, status, revision, approvedAt, approvedRevision, executionBlockReason, executionModel, leadCount, channels, steps:
- reviewUrl*: string — 
- live*: boolean — 

## GET /sequences/{id}
Read one sequence with its revision

One owned sequence with executionModel, exact revision and the full editable steps (stepIndex, messageTmpl, next, condition, sendIf and other saved fields). Read it before PUT and preserve unchanged graph edges and conditions. 404 not_found (resource sequence) outside this workspace.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 200:
- sequence*: object — Full sequence: { id, name, status, revision, approvedAt, approvedRevision, executionBlockReason, executionModel, leadCount, channels, steps:

## PUT /sequences/{id}
Replace a sequence's steps as a new revision

Complete revisioned replacement: read GET /sequences/{id}, then send its full editable step list with expectedRevision equal to that exact revision. Preserve next, condition, sendIf and every unchanged field; compact index/message fields are not accepted. With a customer credential the new revision is re-approved and returns to its previous status (active stays active, paused stays paused, a draft goes live). Omitted executionModel keeps the saved model; changing models requires no execution progress. Graphs allow 30 steps; linear/tracks allow 20. Once any graph lead has left step 0, step count, kinds, edges and conditions cannot change; copy and delays may still be edited without moving lead cursors. Once someone still in outreach may have received a step (an earlier linear step, an earli

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
- requestId: string — Optional idempotency key; reuse it only to retry this exact request. Omitted means a fresh request.
- expectedRevision*: integer — Current saved revision. Fetch again after a 409; do not silently retry a changed plan.
- name: string — 
- steps*: array — Complete replacement, not a patch. Runtime limit: 30 steps for graph; 20 for linear/tracks. With LinkedIn, linear starts with connect and tr
  - stepIndex: integer — Optional zero-based position; when supplied it must match the array index. Graphs allow indices 0–29; linear/tracks allow 0–19.
  - kind*: enum enum=["connect", "message", "engage", "email", "x_dm", "x_engage", "instagram_dm", "branch"] — 
  - delayDays*: integer — linear: after the previous step, with acceptance required after connect. tracks: after the previous step in that channel's lane. graph: dela
  - subject: anyOf — 
  - messageTmpl: anyOf — 
  - sendIf: anyOf — 
  - next: anyOf — 
  - condition: anyOf — 
  - attachments: array — Existing uploaded attachment references for LinkedIn message steps. Preserve returned references when editing.
    - id*: string — 
    - name*: string — 
    - size*: integer — 
  - actions: array — Required and non-empty for engage or x_engage; x_engage supports follow and unfollow only.
    - type*: enum enum=["follow", "unfollow", "view_profile", "like_last_post", "endorse_first_skill", "comment_last_post"] — 
    - count: integer — like_last_post only: how many of their newest posts to react to. In a step with comment_last_post the reaction goes once on the post the com
    - reaction: enum enum=["like", "celebrate", "support", "love", "insightful", "funny"] — 
    - guidance: string — comment_last_post only: optional guidance for the comment PumpGTM writes for each person's latest original post. Every comment waits for the
    - text: string — Older name for guidance on comment_last_post; read as guidance, never posted as written.
  - variants: anyOf — 
  - tool: anyOf — 
- executionModel: enum enum=["linear", "tracks", "graph"] — linear (default on create): up to 20 ordered steps; X steps cannot mix other channels. tracks: up to 20 steps in parallel LinkedIn, email an
- xThreadCheck: boolean — Workspace-wide optional X prior-conversation check (5 Energy per DM instead of 0.6), default off. Omit to retain the saved setting. Automati

Response 200:
- update*: object — { ok: true, replayed, sequence, live, change: { previousRevision, revision, currentRevision, previousStatus, nameChanged, stepCountBefore, s
- reviewUrl*: string — 

## PATCH /sequences/{id}/status
Pause or resume an existing sequence

Affects every lead in this sequence. active may enable sending, subject to existing approval, billing, budget and provider controls. paused halts future sequence work; already dispatched actions cannot be recalled. Does not edit or approve content. 400 { error: "status must be one of active, paused, draft" } for any other value; 404 { error: "sequence not found" } outside this workspace; 409 { ok: false, error: sequence_approval_required | archived_sequence_is_read_only } when the change is refused.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
- status*: enum enum=["active", "paused", "draft"] — 

Response 200:
- ok*: ? — 
- sequenceId*: string — 
- previousStatus*: enum enum=["draft", "active", "paused", "archived"] — 
- status*: enum enum=["active", "paused", "draft"] — 

## POST /sequences/{id}/leads
Add people to a sequence

Queue people into one sequence. Nothing is sent in this call: people enter the paced engine and are contacted later inside working hours and account limits.  **Choose a method**  - `contacts`: 1 to 500 people, each with any mix of `linkedinUrl`, `email` and `xUsername`. Needs a connected LinkedIn account only when LinkedIn people go into a sequence with LinkedIn steps. - `manual`: 1 to 500 people with LinkedIn URLs. Always needs a connected LinkedIn account. - `csv`: CSV text with a header row, at most 500 rows. Always needs a connected LinkedIn account. - `sales_navigator`: a saved Sales Navigator list URL. Imports in the background; poll `GET /leads/imports/{batchId}`. Always needs a connected LinkedIn account.  **Choose a sender**  Optional `accountId` selects the connected LinkedIn sen

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
(alt)
  - method*: ? — 
  - requestId: string — Optional idempotency key; reuse it only to retry this exact request. Omitted means a fresh request.
  - invitePriority: integer — Optional, default 0, for everyone in this request. Higher priority people get their connection request before the rest of the workspace queu
  - accountId: string — Optional LinkedIn sender: the public id from the partner LinkedIn accounts list or get_workspace channels.linkedin.data.senders.items. Legac
  - expectedRevision: integer — Optional. When given it must equal the sequence's current revision (409 sequence_revision_conflict otherwise); omitted means the current rev
  - leads*: array — 1 to 500 people, each with at least one of linkedinUrl, email or xUsername. A person is queued only for the channels the sequence has steps 
    - person*: string — 
    - company: anyOf — 
    - title: anyOf — 
    - linkedinUrl: anyOf — 
    - email: anyOf — 
    - xUsername: anyOf — 
(alt)
  - method*: ? — 
  - requestId: string — Optional idempotency key; reuse it only to retry this exact request. Omitted means a fresh request.
  - invitePriority: integer — Optional, default 0, for everyone in this request. Higher priority people get their connection request before the rest of the workspace queu
  - accountId: string — Optional LinkedIn sender: the public id from the partner LinkedIn accounts list or get_workspace channels.linkedin.data.senders.items. Legac
  - leads*: array — 
    - linkedinUrl*: string — 
    - person: anyOf — 
    - company: anyOf — 
    - title: anyOf — 
    - customFields: object — Per-person values from your own list, keyed by a lowercase token such as personalized_message; written verbatim wherever a message uses {{pe
(alt)
  - method*: ? — 
  - requestId: string — Optional idempotency key; reuse it only to retry this exact request. Omitted means a fresh request.
  - invitePriority: integer — Optional, default 0, for everyone in this request. Higher priority people get their connection request before the rest of the workspace queu
  - accountId: string — Optional LinkedIn sender: the public id from the partner LinkedIn accounts list or get_workspace channels.linkedin.data.senders.items. Legac
  - csvContent*: string — CSV with a header row; at most 500 rows and 100 columns. Person, LinkedIn URL, Company and Title columns are recognised by name.
  - customColumns: object — Extra CSV header → lowercase token it fills, for example { "personalizedMessage": "personalized_message" }.

Response 201:
- addResult*: object — contacts, manual and csv finish in this call (status "completed"). sales_navigator returns the initial import status instead; poll GET /lead
  - method*: enum enum=["contacts", "manual", "csv", "sales_navigator"] — 
  - batchId: anyOf — 
  - status: string — 
  - sequenceId*: string — 
  - sequenceStatus*: enum enum=["active", "paused"] — 
  - reused*: boolean — 
  - addedLeadIds: array — 
  - addedLeads: array — manual and csv only.
    - id*: string — 
    - person*: anyOf — 
    - linkedinUrl*: anyOf — 
  - summary: object — 
    - submittedCount*: integer — 
    - addedCount*: integer — 
    - duplicatesSkipped*: integer — 
    - invalidSkipped*: integer — 
    - alreadyInvitedCount*: integer — 
  - contacted*: ? — 
  - energyCharged: integer — contacts only; always 0.
- reviewUrl*: string — Where the customer reviews or pauses the sequence.

## GET /leads/imports/{batchId}
Read a Sales Navigator import's status

Status of an import started by POST /sequences/{id}/leads with method sales_navigator. status is processing (still fetching), waiting (fetched; enrollment is waiting on errorCode and retries automatically), finalizing (fetched; valid people are being added), completed (queued in the sequence) or failed (stopped; read errorCode). Poll until completed or failed. Manual and CSV adds finish in their own call and return 404 here (resource import).

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- batchId (path)*: string  — 

Response 200:
- importStatus*: object — { method: "sales_navigator", batchId, requestId, status: processing | waiting | finalizing | completed | failed, sequence, progress: { fetch
  - status: enum enum=["processing", "waiting", "finalizing", "completed", "failed"] — 

## GET /leads
List leads across channels

The same view as the Leads screen: who is engaged, who booked, who went quiet. engaged=1 or sinceDays>0 limits to people with recent activity; booked=1 to booked meetings; q searches person and company. Bounded by limit (max 500). To recover a lost removal ID, search with q and no activity/stage filters, identify the correct person and sequence, and read that lead's removal.id. Pass it to POST /leads/undo-remove. removal is null when no current Undo event is available; do not re-add the person as a workaround.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- stage (query): string  — Lead stage, e.g. queued, invited, connected, messaged, replied, meeting_booked.
- engaged (query): None enum=["1"] — 
- sinceDays (query): number  — 
- booked (query): None enum=["1"] — 
- q (query): string  — 
- limit (query): integer  — 

Response 200:
- count*: integer — 
- returned*: integer — 
- leads*: array — 
  - id*: string — 
  - person: anyOf — 
  - removal*: anyOf — Current removal metadata, or null when no current Undo event is available. Recover id here if the original remove response was not saved. A 

## GET /leads/{id}/thread
Read a lead's LinkedIn conversation

Read incoming and outgoing messages through the lead's saved sender, including paused sequences and removed leads whose history is retained. LinkedIn only. Each page is oldest first; the first page contains the newest messages and nextCursor reads the next older page, which should be prepended. Continue until nextCursor is null. Cursors are opaque, expire after 30 minutes, and work only for the same workspace, lead and connected sender. Start again without a cursor after reconnecting. available=false and an empty messages array mean no LinkedIn thread has been recorded yet, not a verified absence of conversation on LinkedIn. Text and attachment presence only; no attachment downloads. Sends nothing, does not decide drafts or mark messages read. 400 invalid_cursor for invalid, mismatched or 

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 
- channel (query): None  — 
- limit (query): integer  — 
- cursor (query): string  — Use thread.nextCursor from the previous page; omit for the newest messages.

Response 200:
- thread*: object — 
  - leadId*: string — 
  - channel*: ? — 
  - available*: boolean — 
  - messages*: array — 
    - id*: anyOf — 
    - direction*: enum enum=["inbound", "outbound"] — 
    - text*: anyOf — 
    - timestamp*: anyOf — 
    - hasAttachments*: boolean — 
  - nextCursor*: anyOf — 
  - hasMore*: boolean — 

## GET /leads/{id}
Read one lead

One lead in the same shape as GET /leads: identity, account, sequence, stage, milestones, reply sentiment, last error and removal metadata. If the original removal response was not saved, use lead.removal.id with POST /leads/undo-remove. removal is null when no current Undo event is available. 404 not_found (resource lead) outside this workspace.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 200:
- lead*: object — 
  - id*: string — 
  - person: anyOf — 
  - removal*: anyOf — Current removal metadata, or null when no current Undo event is available. Recover id here if the original remove response was not saved. A 

## DELETE /leads/{id}
Permanently delete an unused removed lead

REST-only. Irreversibly deletes one already-removed lead with no outreach or processing history, replies, opt-outs, meetings, protected linked records, other matching workspace records or company exclusions. No dashboard action or MCP tool. Send no body or query parameters; no force override is supported. The current removal must remain valid and its settling period must have ended: follow removal.undoAfter or the 409 Retry-After header (up to ten minutes after removal). The source import must be finished or cancelled. Use a paused sequence for import tests. After confirmed deletion, add the profile again with a new requestId; old import receipts and requestIds remain unchanged and old review candidates are not reopened. Deletion removes this record's duplicate protection, so future approv

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 200:
- deletion*: object — 
  - leadId*: string — 
  - status*: ? — 

## POST /leads/{id}/input
Supply per-person values for a held message step

Store the customer's values for a LinkedIn message, email, X DM or Instagram DM step declared with tool { kind: "customer_input", tokens }, for example a link to a video they recorded. Each value is written to every not-yet-sent step of the lead's sequence that declares it. 1-5 entries; keys are the sequence's token names; a *_url key must be an http(s) URL. A step that sends each person their own file (customer_input attachment) takes files: { [key]: uploadTicket } after the bytes were uploaded through POST /leads/{id}/input/upload. Nothing is sent in this call: the paced engine sends on its next run. 409 with nothing changed: lead_input_already_replied, lead_input_sequence_finished, lead_input_step_already_sent, lead_input_channel_unavailable, lead_input_no_sequence, lead_input_sequence_

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
- values*: object — 
- files*: object — The file slot's key mapped to the uploadTicket from POST /leads/{id}/input/upload.

Response 200:
- stored*: object — { leadId, person, company, linkedinUrl, sequenceId, sequenceName, stepIndex, storedKeys, storedFiles?, complete, stillMissing, willSendOn, s

## POST /leads/{id}/input/upload
Get a one-time upload link for one person's file

For a LinkedIn message, email, X DM or Instagram DM step that sends each person their own file (customer_input attachment), returns { uploadUrl, method: "PUT", headers, uploadTicket, expiresAt, maxBytes, appUrl }. PUT the file's bytes to uploadUrl with Content-Type: application/octet-stream before expiresAt (two hours), then POST /leads/{id}/input with files: { [key]: uploadTicket }. Limits are each provider's, checked before any upload: a LinkedIn message carries at most 5 files and 15 MB together with the step's own attachments; an email step takes one document, image or MP4 up to 18 MB (1.5 MB when sent from a Microsoft mailbox, checked at send time); an X DM step takes one image up to 5 MB, GIF up to 15 MB or MP4 video up to 50 MB and 140 seconds. Nothing is compressed: a larger file i

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Request body:
- key*: string — 
- fileName*: string — 
- size*: integer — 

Response 200:
- upload*: object — { leadId, person, sequenceId, sequenceName, key, uploadUrl, method, headers, uploadTicket, expiresAt, maxBytes, appUrl }

## POST /leads/move/preview
Preview moving untouched people

Read-only eligibility across LinkedIn, email and X for up to 500 leads and a non-archived destination in this workspace. Queued on one channel is not sufficient. Returns eligible and excluded people with reasons. Does not pause, approve, move or send.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- leadIds*: array — 
- sequenceId*: string — 

Response 200:
- sequenceId*: string — 
- eligibleCount*: integer — 
- blockedCount*: integer — 
- results*: array — 
  - leadId*: string — 
  - person*: anyOf — 
  - sourceSequenceId*: anyOf — 
  - eligible*: boolean — 
  - reason*: anyOf — 
  - message*: string — 

## POST /leads/move
Schedule a lead move after five seconds

Schedules the exact selection to move after a five-second server delay; execution checks eligibility again. Reuse the identical operationId, leadIds and sequenceId on retries. Save operationId for polling or cancellation. Moved people follow the destination's normal schedule while existing personal pauses, sender bindings, lead IDs, history and Play attribution stay intact. Does not approve messages or activate a sequence. Inspect per-person blocked reasons when completed. 409 idempotency_conflict means the operation ID belongs to a different request; 503 sequence_move_unconfirmed requires reading or retrying the same operation, never a replacement.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- leadIds*: array — 
- sequenceId*: string — 
- operationId*: string — Required stable UUID for this exact selection and destination. Reuse for retries; a different payload with the same ID conflicts.

Response 200:
- operationId*: string — 
- sequenceId*: string — 
- requestLeadIds*: array — 
- status*: enum enum=["pending", "running", "completed", "cancelled", "failed"] — A failed operation may contain confirmed partial results. Compare requestLeadIds with results: missing people need review; never assume they
- executeAfter*: string — 
- serverNow*: string — 
- movedCount*: integer — 
- blockedCount*: integer — 
- results*: array — 
  - leadId*: string — 
  - person*: anyOf — 
  - sourceSequenceId*: anyOf — 
  - status*: enum enum=["moved", "blocked"] — 
  - reason*: anyOf — 
  - message*: string — 

## GET /leads/move
Read a saved move operation

Read-only lifecycle status in the current workspace: pending, running, completed, cancelled or failed. Polling never executes or restarts a move. Keep the operationId returned by the original POST for recovery. 404 not_found for an unavailable operation.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- operationId (query)*: string  — 

Response 200:
- operationId*: string — 
- sequenceId*: string — 
- requestLeadIds*: array — 
- status*: enum enum=["pending", "running", "completed", "cancelled", "failed"] — A failed operation may contain confirmed partial results. Compare requestLeadIds with results: missing people need review; never assume they
- executeAfter*: string — 
- serverNow*: string — 
- movedCount*: integer — 
- blockedCount*: integer — 
- results*: array — 
  - leadId*: string — 
  - person*: anyOf — 
  - sourceSequenceId*: anyOf — 
  - status*: enum enum=["moved", "blocked"] — 
  - reason*: anyOf — 
  - message*: string — 

## POST /leads/move/cancel
Cancel a pending move

Cancels the exact operationId only during its five-second window and before execution claims it. This is Undo during the five-second delay, not a reversal after completion. The cancel and execution claims compete atomically; inspect the returned status. cancelled confirms no people moved; running or completed means cancellation was too late. A pending response with serverNow at or after executeAfter also means the cancellation window closed. Repeating cancellation is safe. Does not rewind progress, alter sequence approval or send.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- operationId*: string — 

Response 200:
- operationId*: string — 
- sequenceId*: string — 
- requestLeadIds*: array — 
- status*: enum enum=["pending", "running", "completed", "cancelled", "failed"] — A failed operation may contain confirmed partial results. Compare requestLeadIds with results: missing people need review; never assume they
- executeAfter*: string — 
- serverNow*: string — 
- movedCount*: integer — 
- blockedCount*: integer — 
- results*: array — 
  - leadId*: string — 
  - person*: anyOf — 
  - sourceSequenceId*: anyOf — 
  - status*: enum enum=["moved", "blocked"] — 
  - reason*: anyOf — 
  - message*: string — 

## POST /leads/undo-remove
Undo specific lead removals

Explicitly restores the same leads to their original sequences and progress. Pass removal IDs from the remove response or the lead's removal.id. Paused sequences stay paused. Retrying the same IDs is harmless and cannot undo a newer removal. Each result is restored, already_restored or blocked with a reason and message; check all results, including on HTTP 200. Nothing is sent in this request. Company exclusions and cancelled imports are not undone. Historical removals are eligible only when untouched pooled enrollment can be proven; no past state is guessed.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- removalIds*: array — 

Response 200:
- restoration*: object — 
  - restoredCount*: integer — 
  - alreadyRestoredCount*: integer — 
  - blockedCount*: integer — 
  - results*: array — 
    - removalId*: string — 
    - leadId*: anyOf — 
    - status*: enum enum=["restored", "already_restored", "blocked"] — 
    - reason*: anyOf — 
    - message*: string — 

## POST /leads/remove
Remove leads, cancel an import or block companies

Stops outreach and returns removals [{ leadId, removalId, undoAfter }]. Use POST /leads/undo-remove with those exact removal IDs to reverse removal. Removed leads stay out of Play review and ordinary imports. Uncontacted leads leave the queue; contacted leads keep their stage and milestones and get no further automated steps. Sent invitations and messages are never reversed. target companies also puts those employers on the do-not-contact list. 404 not_found (resource import) when batchId is not one of this workspace's imports.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
(alt)
  - target*: ? — 
  - leadIds*: array — 
(alt)
  - target*: ? — 
  - batchId*: string — 
(alt)
  - target*: ? — 
  - companies*: array — Employers to put on the workspace do-not-contact list; everyone queued there is stopped and Plays stop finding people there.

Response 200:
- removal*: object — { ok: true, selectedCount, removedBeforeContact, automationStoppedAfterContact, alreadyStopped, notFoundCount, importCancelled, excludedComp

## POST /people/searches
Create or revise a people-search Play and optionally run it

Find people from a targeting, the same way the PumpGTM agent does. Provide targeting (creates a Play, or revises playId at expectedRevision, the play.revision from the previous response), a playId alone (use the Play as is), or both. run: false (default) prepares and returns 200 with the targeting summary; run: true searches and returns 201 with the review batch and candidates. requestId is required when run is true: a run is billed, so a retry must carry the same requestId to replay the stored result (reused: true) instead of searching and charging again. sequenceId sets the Play's sequence for future leads only; it does not move existing people, approve messages or start a draft. A run crawls toward candidateCount, up to 100 people; each person found costs 2 Energy on metered workspaces 

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- targeting: object — 
  - schemaVersion: ? — 
  - name*: string — A short customer-facing name for this search.
  - candidateCount*: integer — The exact number of candidates to return.
  - hardFilters*: object — 
    - currentTitleIncludesAny*: array — Alternative literal phrases; a person's current title must contain at least one.
    - currentFunctionsAny: array — Alternative current job functions. Use only when non-negotiable. One of the listed values only.
      items enum=["Engineering", "Sales", "Consulting", "Marketing", "Operations", "Finance", "Research", "Customer Success and Support", "Arts and Design", "Human Resources", "Legal", "Product Management"]
    - currentSenioritiesAny: array — Alternative current seniority levels. Use only when non-negotiable. One of the listed values only; put finer wording such as Head of or SVP 
      items enum=["Owner / Partner", "CXO", "Vice President", "Director", "Experienced Manager", "Entry Level Manager", "Strategic", "Senior", "Entry Level", "In Training"]
    - personCountriesAny: array — Alternative countries where the person must be located.
    - currentCompanyNamesAny: array — Alternative exact current-employer names, only for a named account list.
    - currentCompanyDomainsAny: array — Alternative exact current-employer website domains; a domain pins one company exactly.
    - currentCompanyLinkedInUrlsAny: array — Alternative current-employer LinkedIn company URLs.
    - currentCompanyIndustriesAny: array — Alternative canonical company industries.
    - currentCompanyTypesAny: array — Alternative canonical company ownership types.
    - currentCompanyHeadcount: object — 
      - minimum: integer — 
      - maximum: integer — 
    - currentCompanyInvestorsAny: array — Alternative canonical investors or accelerators backing the current company (Y Combinator, not YC).
    - currentCompanyHiringRolesAny: array — Alternative role phrases the current company must have an open job posting for right now.
    - currentCompanyHiringPostedWithinDays: integer — Defaults to 30 when hiring roles are given.
    - excludedCurrentFunctionsAny: array — Current job functions that must be excluded. One of the listed values only.
      items enum=["Engineering", "Sales", "Consulting", "Marketing", "Operations", "Finance", "Research", "Customer Success and Support", "Arts and Design", "Human Resources", "Legal", "Product Management"]
    - excludedCurrentSenioritiesAny: array — Current seniority levels that must be excluded. One of the listed values only; put finer wording such as Head of or SVP in semanticQuery.
      items enum=["Owner / Partner", "CXO", "Vice President", "Director", "Experienced Manager", "Entry Level Manager", "Strategic", "Senior", "Entry Level", "In Training"]
    - excludedCurrentCompanyNamesAny: array — Exact current-employer names that must be excluded.
    - excludedCurrentCompanyTypesAny: array — Company ownership types that must be excluded.
  - semanticQuery: string — Plain-language description of product, workload, responsibility and business-model fit. Descriptive requirements go here, not in hard filter
  - defaultSequenceId: anyOf — 
- playId: string — 
- expectedRevision: integer — Current saved revision. Fetch again after a 409; do not silently retry a changed plan.
- sequenceId: string — 
- run: boolean — 
- requestId: string — Optional idempotency key; reuse it only to retry this exact request. Omitted means a fresh request.
(alt)
(alt)

Response 200:


Response 201:


## POST /people/searches/{playId}/run
Run an existing people-search Play

Runs a saved people-search Play as is; same metering and result as createPeopleSearch with run: true. requestId is required: a run is billed, so a retry must carry the same requestId to replay the stored result instead of searching and charging again. 404 not_found (resource play) when the Play does not exist or is not a people-search Play.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- playId (path)*: string  — 

Request body:
- requestId*: string — Optional idempotency key; reuse it only to retry this exact request. Omitted means a fresh request.
- sequenceId: string — 

Response 201:


## GET /people/reviews/{batchId}
Read a review batch and its candidates

One review batch: batch counts, the targeting summary and each candidate with its current decision (undecided, approved or rejected). batch.status is draft (being prepared), sample_ready (ready to review), approved, imported (finished; good fits queued) or rejected. 404 not_found (resource review).

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- batchId (path)*: string  — 

Response 200:


## POST /people/reviews/{batchId}/decisions
Record good-fit decisions and enroll

Record the customer's good-fit decisions on a review batch. 1-100 decisions per call; good_fit approves, not_a_fit rejects. Partial decisions persist. finish: true requires every candidate decided and queues the good fits into their sequence (the call's sequenceId, a per-decision override, or the Play's default); summary, addedLeadIds, addedLeads and sequences are present only on that finishing call, and reviewUrl is then present. Nothing is sent in this call. 409 all_candidates_require_a_decision when finishing with undecided people.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- batchId (path)*: string  — 

Request body:
- decisions*: array — 
  - candidateId*: string — 
  - decision*: enum enum=["good_fit", "not_a_fit"] — 
  - sequenceId: string — Optional per-person override of the sequence this good fit goes into.
  - feedbackReason: string — 
  - feedbackNote: string — 
- sequenceId: string — Applies to every good fit in this call.
- finish: boolean — 
- requestId: string — Optional idempotency key; reuse it only to retry this exact request. Omitted means a fresh request.

Response 200:


## GET /progress
Read LinkedIn pace and outcomes

Current LinkedIn sending pace and outcome counts over the last sinceDays days (default 7): invites, acceptances, messages, replies and meetings per account. Saved observations, not a live provider probe.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- sinceDays (query): number  — 

Response 200:


## GET /reports/funnel
Read the lead funnel by sequence or account

Funnel outcomes grouped by sequence (default) or by connected account, plus split-test arms, so a backend can report or decide without scraping a screen. excludedWarmupAccounts is a compatibility field and is always empty.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- group_by (query): None enum=["sequence", "account"] — 

Response 200:
- groupBy*: string — 
- excludedWarmupAccounts*: array — 
- total*: object — 
- groups*: array — 
  - id*: string — 
  - name*: anyOf — 
  - funnel*: object — 
- experimentArms*: ['array', 'object'] — 

## GET /replies
Read pending replies

Includes LinkedIn, email and X replies, only while they wait on you as the Inbox's Needs you shows them: a reply answered or cleared from your side, snoozed, booked or opted out since leaves the list until the person writes again. Some X conversations have no draft; enabled scheduling partners obtain their replyVersion through GET /leads/{id}/reply-decisions. Encrypted text can be unavailable. This is a bounded pending queue, not a complete conversation archive.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- limit (query): integer  — 

Response 200:
- replies*: array — 

## POST /replies/{id}/decide
Decide a pending reply

Optional sendAt schedules a text-only send for enabled agency partners (LinkedIn, email or X), returning 202 { ok, scheduledReply }. Requires Idempotency-Key and a future RFC 3339 instant within 30 days. Null/invalid sendAt or other decisions with sendAt are refused, never sent immediately. Poll /scheduled-replies/{id}. Without sendAt, runs exactly the same code as the inbox buttons. send posts the draft (text overrides it); invite, booking_link and start_sequence act on the thread; snooze waits days; meeting_booked, dismiss and opt_out close it. by is recorded for the audit trail. 404 when the reply is not pending in this workspace; 409 with the result when the decision could not be applied.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 
- Idempotency-Key (header): string  — Required when sendAt is present.

Request body:
- sendAt: string — Future RFC 3339 instant with Z or numeric offset, at most 30 days ahead. Earliest send time; the worker runs every minute.
- decision*: enum enum=["send", "invite", "booking_link", "snooze", "start_sequence", "meeting_booked", "dismiss", "opt_out"] — 
- text: string — send only: replaces the generated draft.
- days: integer — snooze only.
- by: string — Who decided; defaults to api.

Response 200:
- ok*: boolean — 

Response 202:
- ok*: boolean — 

## GET /activity
Read the activity ledger

Use action=x_dm and outcome=ok to inspect confirmed X sends. Other actions may be skipped/failed. Bounded recent ledger; polling supplements best-effort webhook delivery.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- action (query): string  — Comma-separated action names, e.g. x_dm,x_follow
- outcome (query): None enum=["ok", "failed", "skipped"] — 
- sinceDays (query): number  — 
- limit (query): integer  — 

Response 200:


## GET /webhooks
List enabled subscriptions

Lists workspace webhook URLs and events; never returns signing secrets.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Response 200:
- webhooks*: array — 
  - id*: string — 
  - url*: string — 
  - events*: array — 
  - createdAt*: string — 
- events*: array — 

## POST /webhooks
Subscribe to signed events

Maximum 10 enabled hooks. Save the returned secret securely; it is shown only at creation. HTTPS port 443 and publicly resolving IPv4 DNS required. Private/mixed IPs, URL credentials, fragments and redirects are rejected. Registration is not idempotent: list before retrying after a timeout; 409 webhook_limit_reached at the maximum. Delivery is best-effort: up to three attempts, retried on network errors, 5xx and 429; not a durable replay queue. Verify signatures on the exact raw body (X-PumpGTM-Signature, t=<unix>,v1=<hex HMAC-SHA256 of t + "." + body>; reject t older than 5 minutes) and deduplicate event IDs. x.followed means an inbound follow of your connected account. lead.messaged includes successful x_dm with channel x; reply.received can include unreadable encrypted content. linkedin

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke

Request body:
- url*: string — 
- events*: array — 
  items enum=["reply.received", "lead.invited", "lead.accepted", "lead.messaged", "lead.emailed", "lead.meeting_booked", "x.followed", "linkedin.connected", "linkedin.disconnected", "linkedin.limited", "linkedin.r

Response 201:
- id*: string — 
- url*: string — 
- events*: array — 
- secret*: string — 

## POST /webhooks/{id}/test
Schedule a signed ping

202 means the ping was scheduled, not that the receiver accepted it. Verify the event at your receiver.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 202:
- ok*: boolean — 
- id*: string — 
- event*: ? — 

## DELETE /webhooks/{id}
Disable a subscription

Only an enabled hook belonging to the selected workspace can be disabled. A subsequent delete returns 404. Already queued delivery may still complete.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 200:
- ok*: boolean — 
- id*: string — 

## GET /scheduled-replies
List scheduled replies

API-only private partner capability. Requires an enabled partner workspace/Team-owner key and optionally X-PumpGTM-User for its active child workspace. OAuth/member and operator tokens cannot schedule. 403 scheduling_not_enabled when the capability is off. No automatic send-now fallback. Oldest creation first. Read and cancel remain available with scheduling disabled. Poll individual resources; restart pagination to discover new or changed statuses.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- status (query): None enum=["scheduled", "sending", "sent", "held", "cancelled", "failed", "delivery_unknown"] — 
- channel (query): None enum=["linkedin", "email", "x"] — 
- leadId (query): string  — 
- cursor (query): string  — 
- limit (query): integer  — 

Response 200:
- scheduledReplies*: array — 
  - id*: string — 
  - replyId*: anyOf — 
  - leadId*: string — 
  - channel*: enum enum=["linkedin", "email", "x"] — 
  - status*: enum enum=["scheduled", "sending", "sent", "held", "cancelled", "failed", "delivery_unknown"] — 
  - reason*: anyOf — 
  - sendAt*: string — 
  - nextAttemptAt*: string — 
  - sentAt*: anyOf — 
  - version*: integer — 
  - text*: string — 
- nextCursor*: anyOf — 

## GET /scheduled-replies/{id}
Read a scheduled reply

API-only private partner capability. Requires an enabled partner workspace/Team-owner key and optionally X-PumpGTM-User for its active child workspace. OAuth/member and operator tokens cannot schedule. 403 scheduling_not_enabled when the capability is off. No automatic send-now fallback. Sent means confirmed provider acceptance. Held needs explicit review. delivery_unknown must not be blindly retried or recreated; it reserves the conversation until reconciled.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 200:
- scheduledReply*: object — 
  - id*: string — 
  - replyId*: anyOf — 
  - leadId*: string — 
  - channel*: enum enum=["linkedin", "email", "x"] — 
  - status*: enum enum=["scheduled", "sending", "sent", "held", "cancelled", "failed", "delivery_unknown"] — 
  - reason*: anyOf — 
  - sendAt*: string — 
  - nextAttemptAt*: string — 
  - sentAt*: anyOf — 
  - version*: integer — 
  - text*: string — 

## PATCH /scheduled-replies/{id}
Edit or reapprove an unsent reply

API-only private partner capability. Requires an enabled partner workspace/Team-owner key and optionally X-PumpGTM-User for its active child workspace. OAuth/member and operator tokens cannot schedule. 403 scheduling_not_enabled when the capability is off. No automatic send-now fallback. Only scheduled/held resources. Requires current expectedVersion; held also requires reapprove true. Changed conversation/account requires cancellation and fresh approval. 409 version_conflict, reapproval_required, conversation_changed or reply_not_editable.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 
- Idempotency-Key (header)*: string  — Reuse only for the identical create/edit request in this workspace.

Request body:
- sendAt*: string — Future RFC 3339 instant with Z or numeric offset, at most 30 days ahead. Earliest send time; the worker runs every minute.
- text: string — 
- expectedVersion*: integer — 
- reapprove: boolean — 

Response 200:
- ok*: boolean — 
- scheduledReply*: object — 
  - id*: string — 
  - replyId*: anyOf — 
  - leadId*: string — 
  - channel*: enum enum=["linkedin", "email", "x"] — 
  - status*: enum enum=["scheduled", "sending", "sent", "held", "cancelled", "failed", "delivery_unknown"] — 
  - reason*: anyOf — 
  - sendAt*: string — 
  - nextAttemptAt*: string — 
  - sentAt*: anyOf — 
  - version*: integer — 
  - text*: string — 

## POST /scheduled-replies/{id}/cancel
Cancel before dispatch claims a reply

API-only private partner capability. Requires an enabled partner workspace/Team-owner key and optionally X-PumpGTM-User for its active child workspace. OAuth/member and operator tokens cannot schedule. 403 scheduling_not_enabled when the capability is off. No automatic send-now fallback. Idempotent. scheduled/held become cancelled. 409 once sending, sent, failed or delivery_unknown. Does not resume a Sequence or recall an in-flight message.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 200:
- ok*: boolean — 
- scheduledReply*: object — 
  - id*: string — 
  - replyId*: anyOf — 
  - leadId*: string — 
  - channel*: enum enum=["linkedin", "email", "x"] — 
  - status*: enum enum=["scheduled", "sending", "sent", "held", "cancelled", "failed", "delivery_unknown"] — 
  - reason*: anyOf — 
  - sendAt*: string — 
  - nextAttemptAt*: string — 
  - sentAt*: anyOf — 
  - version*: integer — 
  - text*: string — 

## GET /leads/{id}/reply-decisions
Get an X reply version without a draft

API-only private partner capability. Requires an enabled partner workspace/Team-owner key and optionally X-PumpGTM-User for its active child workspace. OAuth/member and operator tokens cannot schedule. 403 scheduling_not_enabled when the capability is off. No automatic send-now fallback. Returns an opaque version for the latest verified inbound event. 409 if history is unavailable, incomplete, or already answered. Does not decrypt bodies or send anything.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 

Response 200:
- leadId*: string — 
- channel*: ? — 
- replyVersion*: string — 
- allowedDecisions*: array — 

## POST /leads/{id}/reply-decisions
Schedule a reply to a draft-less X conversation

API-only private partner capability. Requires an enabled partner workspace/Team-owner key and optionally X-PumpGTM-User for its active child workspace. OAuth/member and operator tokens cannot schedule. 403 scheduling_not_enabled when the capability is off. No automatic send-now fallback. Use replyVersion from GET on this path. Revalidates the latest inbound and exact sender before storing. 409 conversation_changed for stale context. Does not resume the Sequence.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- id (path)*: string  — 
- Idempotency-Key (header)*: string  — Reuse only for the identical create/edit request in this workspace.

Request body:
- channel*: ? — 
- decision*: ? — 
- text*: string — 
- sendAt*: string — Future RFC 3339 instant with Z or numeric offset, at most 30 days ahead. Earliest send time; the worker runs every minute.
- replyVersion*: string — 
- by: string — 

Response 202:
- ok*: boolean — 
- scheduledReply*: object — 
  - id*: string — 
  - replyId*: anyOf — 
  - leadId*: string — 
  - channel*: enum enum=["linkedin", "email", "x"] — 
  - status*: enum enum=["scheduled", "sending", "sent", "held", "cancelled", "failed", "delivery_unknown"] — 
  - reason*: anyOf — 
  - sendAt*: string — 
  - nextAttemptAt*: string — 
  - sentAt*: anyOf — 
  - version*: integer — 
  - text*: string — 

## POST /signup
Create a partner account

Self-serve partner account for agent platforms and agencies; no browser step. The response carries the partner API key once (it is also the partner's MCP key). The email owns the account and can sign in later with a login link. acceptedPolicies must equal the current policy version. 409 email_in_use when the email already has an account: sign in and copy the key from the install page instead.

Request body:
- email*: string — 
- company*: string — 
- website: string — 
- acceptedPolicies*: ? — The current legal policy version, confirming acceptance of /terms and /privacy.

Response 201:
- apiKey*: string — 
- mcpUrlTemplate*: string — 
- freeLeads*: integer — 
- accountUrl*: string — 
- usersUrl*: string — 
- docsUrl*: string — 

## GET /account
Read the partner account, capabilities and usage

Partner id and name; enterprise capabilities enabled by PumpGTM (outreach, linkedinConnect); hosted connect-link settings; the REST policy for this key (rest.requireUserHeader); the MCP URL template; active user count; this period's leads, free allowance and billing state.

Response 200:
- partner*: object — 
  - id*: string — 
  - name*: string — 
- enterprise*: object — 
  - outreach*: boolean — 
  - linkedinConnect*: boolean — 
- linkedinConnect*: object — 
  - successRedirectUrl*: anyOf — 
  - failureRedirectUrl*: anyOf — 
  - brandName*: anyOf — 
- rest*: object — 
  - requireUserHeader*: boolean — When true, every /api/v1 request made with this partner key must carry X-PumpGTM-User; without it the request is 400 user_header_required in
- mcpUrlTemplate*: string — 
- users*: integer — 
- accounts*: object — 
  - connected*: integer — 
  - included*: anyOf — 
  - remaining*: anyOf — 
- periodStart*: string — 
- leadsThisPeriod*: integer — 
- freeLeads*: integer — 
- freeLeadsRemaining*: integer — 
- billing*: object — 
  - status*: enum enum=["metered", "billing_required", "free"] — 
  - checkoutUrl*: anyOf — 

## PATCH /account
Set brand name, connect-link return URLs and the REST policy

Two groups, each behind its own capability (GET /account enterprise). Connect settings (enterprise.linkedinConnect): where end users land after a hosted LinkedIn connect link resolves, and the white-label name shown on that page (1-60 characters; null uses your workspace name). An absent field is kept, null or "" clears it. The end user id and link id are appended to the redirect as externalUserId and connectLinkId; only expired or revoked links use the failure URL. REST policy (enterprise.outreach): requireUserHeader true makes every /api/v1 request with this key that lacks X-PumpGTM-User fail with 400 user_header_required, so a missing header can never act on your own workspace; /api/partner/v1 and the per-user MCP URL are unaffected. Nothing is written when any group is refused. 400 { e

Request body:
- successRedirectUrl: anyOf — 
- failureRedirectUrl: anyOf — 
- brandName: anyOf — 
- requireUserHeader: boolean — 

Response 200:
- linkedinConnect*: object — 
  - successRedirectUrl*: anyOf — 
  - failureRedirectUrl*: anyOf — 
  - brandName*: anyOf — 
- rest*: object — 
  - requireUserHeader*: boolean — When true, every /api/v1 request made with this partner key must carry X-PumpGTM-User; without it the request is 400 user_header_required in

## GET /users
List end users with this period's usage

One row per end user with the same fields as GET /users/{externalUserId} (name, status, lead cap, mcpUrl, rest, outreach) plus people found and tool calls since periodStart, and last use.

Response 200:
- periodStart*: string — 
- users*: array — 
  - externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
  - name*: anyOf — 
  - createdAt*: string — 
  - status*: enum enum=["active", "disabled"] — 
  - monthlyLeadCap*: anyOf — 
  - mcpUrl*: string — https://mcp.pumpgtm.com/mcp/u/{externalUserId}
  - rest*: anyOf — 
  - outreach*: enum enum=["enabled", "disabled"] — disabled until PumpGTM enables outreach on the partner account.
  - leadsFound*: integer — 
  - toolCalls*: integer — 
  - lastUsedAt*: anyOf — 

## POST /users
Create an end user's workspace

Creates the isolated workspace for one end user before any MCP or REST traffic. Idempotent: 201 when created, 200 unchanged when the user already existed (monthlyLeadCap is then not applied; use PATCH). The response carries the user's mcpUrl (https://mcp.pumpgtm.com/mcp/u/{externalUserId}) and, once outreach is enabled on the partner account, rest: { header: "X-PumpGTM-User", value } and outreach: "enabled"; until then rest is null and outreach is "disabled". 400 invalid_external_user_id, 400 invalid_monthly_lead_cap.

Request body:
- externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
- name: string — 
- monthlyLeadCap: anyOf — 

Response 200:
- externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
- name*: anyOf — 
- createdAt*: string — 
- status*: enum enum=["active", "disabled"] — 
- monthlyLeadCap*: anyOf — 
- mcpUrl*: string — https://mcp.pumpgtm.com/mcp/u/{externalUserId}
- rest*: anyOf — 
- outreach*: enum enum=["enabled", "disabled"] — disabled until PumpGTM enables outreach on the partner account.

Response 201:
- externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
- name*: anyOf — 
- createdAt*: string — 
- status*: enum enum=["active", "disabled"] — 
- monthlyLeadCap*: anyOf — 
- mcpUrl*: string — https://mcp.pumpgtm.com/mcp/u/{externalUserId}
- rest*: anyOf — 
- outreach*: enum enum=["enabled", "disabled"] — disabled until PumpGTM enables outreach on the partner account.

## GET /users/{externalUserId}
Read one end user

The user's status, lead cap, MCP URL and REST header. 404 user_not_found.

Query/path params:
- externalUserId (path)*: string  — 

Response 200:
- externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
- name*: anyOf — 
- createdAt*: string — 
- status*: enum enum=["active", "disabled"] — 
- monthlyLeadCap*: anyOf — 
- mcpUrl*: string — https://mcp.pumpgtm.com/mcp/u/{externalUserId}
- rest*: anyOf — 
- outreach*: enum enum=["enabled", "disabled"] — disabled until PumpGTM enables outreach on the partner account.

## PATCH /users/{externalUserId}
Change a lead cap, disable or reactivate

monthlyLeadCap sets or clears (null) the user's people-search cap (400 invalid_monthly_lead_cap); status disabled is the same as DELETE (sequences paused, 403 user_disabled on MCP and REST, nothing more billed) and status active reactivates. At least one field is required (400 nothing_to_update; a non-object body is 400 invalid_body; both carry field null).

Query/path params:
- externalUserId (path)*: string  — 

Request body:
- monthlyLeadCap: anyOf — 
- status: enum enum=["active", "disabled"] — 

Response 200:
- externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
- status*: enum enum=["active", "disabled"] — 
- monthlyLeadCap*: anyOf — 

## DELETE /users/{externalUserId}
Disable an end user

The user's workspace loses the partner's entitlement and Energy, its active sequences are paused, and its MCP URL and X-PumpGTM-User requests answer 403 user_disabled. Data is kept and nothing more is billed for them. PATCH { status: "disabled" } is equivalent; reactivate with PATCH { status: "active" }.

Query/path params:
- externalUserId (path)*: string  — 

Response 200:
- externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
- status*: enum enum=["active", "disabled"] — 
- monthlyLeadCap*: anyOf — 

## GET /users/{externalUserId}/linkedin/accounts
List an end user's connected LinkedIn accounts

Enterprise. The user's LinkedIn identities with status (connected or disconnected) and display name. A saved connection does not prove live provider health. 404 user_not_found for a user that has not been created.

Query/path params:
- externalUserId (path)*: string  — 

Response 200:
- accounts*: array — 
  - id*: string — 
  - externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
  - status*: enum enum=["connected", "disconnected", "pending", "failed"] — connected or disconnected in steady state; treat anything but connected as not usable for sending.
  - displayName*: anyOf — 
  - pictureUrl*: anyOf — 
  - connectedAt*: anyOf — 
  - timezone*: anyOf — 
  - proxyCountry*: anyOf — 

## DELETE /users/{externalUserId}/linkedin/accounts/{accountId}
Disconnect one LinkedIn account

Enterprise. Sequences stop sending from this identity; its history is kept. Idempotent: an already disconnected account also returns 200. 404 user_not_found for a user that has not been created; 404 account_not_found; 503 disconnect_failed (retry in a minute).

Query/path params:
- externalUserId (path)*: string  — 
- accountId (path)*: string  — 

Response 200:
- account*: object — 
  - id*: string — 
  - externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
  - status*: ? — 

## GET /linkedin/accounts
List this workspace's LinkedIn senders

Saved connected and disconnected accounts; failed/pending connection attempts are excluded. Each id is the UUID for accountId on lead additions, sending limits and InMail credits. proxyCountry is the last recorded proxy country, not a live verification or an exclusive-IP guarantee. No provider requests, refreshes or sends. Use X-PumpGTM-User to select a partner client or authorized X-PumpGTM-Client Team delegation. inmailEnabled is the selected workspace's sending feature, independent of LinkedIn subscription or credit availability. Follow nextCursor until null; each cursor is just a position inside the currently authorized workspace. No-store.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- limit (query): integer  — 
- cursor (query): string  — 
- status (query): None enum=["connected", "disconnected"] — 

Response 200:
- accounts*: array — 
  - id*: string — 
  - displayName*: string — 
  - status*: enum enum=["connected", "disconnected"] — 
  - pictureUrl*: anyOf — 
  - connectedAt*: anyOf — 
  - timezone*: anyOf — 
  - proxyCountry*: anyOf — 
- inmailEnabled*: boolean — 
- nextCursor*: anyOf — 
- hasMore*: boolean — 

## GET /linkedin/accounts/{accountId}/inmail-credits
Read one sender's live InMail credits

One live balance read from the sender in the authorized workspace. Pass its UUID from GET /linkedin/accounts. Returns each subscription's balance separately; null means no balance supplied, not zero. Reading neither enables InMail nor reserves credits, sends a message or guarantees a future send. Sending still needs the workspace feature and the sender's LinkedIn subscription. 404 account_not_found for absent/foreign accounts; 409 account_unavailable for disconnected or demo accounts; 429 rate_limited with Retry-After; 502 inmail_credits_unavailable for provider failure or malformed balances; 503 for an unavailable account read. Never substitutes zero for failure. No-store.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- accountId (path)*: string  — 

Response 200:
- accountId*: string — 
- checkedAt*: string — 
- credits*: object — 
  - premium*: anyOf — 
  - recruiter*: anyOf — 
  - salesNavigator*: anyOf — 

## GET /linkedin/accounts/{accountId}/sending-limits
Read a LinkedIn account's daily invite cap and warm-up state

accountId is the LinkedIn sender UUID from GET /api/v1/linkedin/accounts (or GET /api/partner/v1/users/{id}/linkedin/accounts for a partner client). Returns the configured daily cap (1 to 30), the mode, warm-up progress, and the numbers the engine uses today: effective cap, invites already sent in the account's local day, and what remains. A week is bounded by 7 × the daily cap; there is no separate weekly setting. 404 account_not_found outside this workspace.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- accountId (path)*: string  — 

Response 200:
- accountId*: string — 
- dailyInviteCap*: integer — Configured full-pace cap: connection requests per account-local day once warm-up is over.
- mode*: enum enum=["warmup", "outreach"] — 
- warmup*: object — 
  - startedAt*: anyOf — 
  - isWarming*: boolean — 
  - daysRemaining*: integer — 
  - ramp*: array — 
- effectiveDailyCapToday*: integer — What the engine will allow today: the warm-up ramp value or the configured cap, whichever is lower.
- invitesSentToday*: integer — 
- remainingToday*: integer — 
- workspaceDailyInviteCapTotal*: anyOf — 
- limits*: object — 
  - minDailyInviteCap*: integer — 
  - maxDailyInviteCap*: integer — 

## PATCH /linkedin/accounts/{accountId}/sending-limits
Set a LinkedIn account's daily invite cap or warm-up mode

dailyInviteCap 1 to 30 (the same range as the dashboard). mode warmup restarts the 6-day ramp (5, 7, 10, 15, 16, 20 a day) and is always allowed; mode outreach graduates the account to its configured cap. Graduating while the ramp is still running is refused with 409 warmup_in_progress, because LinkedIn restricts fresh accounts that burst; send acknowledgeEarlyGraduation: true to do it anyway. Returns the same shape as GET after the change. 400 nothing_to_update with an empty body.

Query/path params:
- X-PumpGTM-Client (header): string  — Optional authorized Team workspace ID from GET /workspaces. Omit to use the key's home workspace.
- X-PumpGTM-User (header): string  — Enterprise partners: act on one end user's workspace using the partner key (a workspace or Team owner key; a personal ke
- accountId (path)*: string  — 

Request body:
- dailyInviteCap: integer — 
- mode: enum enum=["warmup", "outreach"] — 
- acknowledgeEarlyGraduation: boolean — 

Response 200:
- accountId*: string — 
- dailyInviteCap*: integer — Configured full-pace cap: connection requests per account-local day once warm-up is over.
- mode*: enum enum=["warmup", "outreach"] — 
- warmup*: object — 
  - startedAt*: anyOf — 
  - isWarming*: boolean — 
  - daysRemaining*: integer — 
  - ramp*: array — 
- effectiveDailyCapToday*: integer — What the engine will allow today: the warm-up ramp value or the configured cap, whichever is lower.
- invitesSentToday*: integer — 
- remainingToday*: integer — 
- workspaceDailyInviteCapTotal*: anyOf — 
- limits*: object — 
  - minDailyInviteCap*: integer — 
  - maxDailyInviteCap*: integer — 

## POST /users/{externalUserId}/linkedin/connect-links
Mint a hosted LinkedIn connect link

409 account_limit_reached when every LinkedIn account included in your plan is already connected (see accounts on GET /account). Enterprise. Returns a PumpGTM-hosted url (shown once, never stored in clear) where this end user signs in to LinkedIn themselves; open it in a popup, never an iframe. Links are single use and expire after 7 days by default (expiresInMinutes 10 to 43200). Completion is announced through your linkedin.connected webhook and the redirect URLs from PATCH /account; GET the link to poll. Webhook, redirect and poll have no ordering guarantee: treat all three as idempotent on connectLink.id. This route creates the user's workspace if it does not exist yet. A user may hold at most 10 open links (409 connect_link_limit_reached). 400 invalid_expires_in_minutes with field. A 

Query/path params:
- externalUserId (path)*: string  — 

Request body:
- expiresInMinutes: anyOf — 

Response 201:
- connectLink*: object — 
  - id*: string — 
  - externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
  - status*: enum enum=["pending", "connected", "expired", "revoked"] — expired and revoked are final; mint a new link.
  - expiresAt*: string — 
  - connectedAt*: anyOf — 
  - revokedAt*: anyOf — 
  - createdAt*: string — 
- url*: string — 

## GET /users/{externalUserId}/linkedin/connect-links
List an end user's connect links

Enterprise. Newest first, at most 25. The hosted url is never returned again. 404 user_not_found for a user that has not been created.

Query/path params:
- externalUserId (path)*: string  — 

Response 200:
- connectLinks*: array — 
  - id*: string — 
  - externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
  - status*: enum enum=["pending", "connected", "expired", "revoked"] — expired and revoked are final; mint a new link.
  - expiresAt*: string — 
  - connectedAt*: anyOf — 
  - revokedAt*: anyOf — 
  - createdAt*: string — 

## GET /users/{externalUserId}/linkedin/connect-links/{linkId}
Poll one connect link

Enterprise. status is pending, connected, expired or revoked (expired and revoked are final). Polling rule: every 3 seconds, stop when status is not pending, give up after 15 minutes; this GET is not rate limited. 404 connect_link_not_found; 404 user_not_found for a user that has not been created.

Query/path params:
- externalUserId (path)*: string  — 
- linkId (path)*: string  — 

Response 200:
- connectLink*: object — 
  - id*: string — 
  - externalUserId*: string — Your own id for the end user: letters, digits and _ . : @ -, up to 120 characters.
  - status*: enum enum=["pending", "connected", "expired", "revoked"] — expired and revoked are final; mint a new link.
  - expiresAt*: string — 
  - connectedAt*: anyOf — 
  - revokedAt*: anyOf — 
  - createdAt*: string — 

## DELETE /users/{externalUserId}/linkedin/connect-links/{linkId}
Revoke an open connect link

Enterprise. Only a pending link can be revoked; already connected, expired or revoked links return 409 connect_link_not_pending with the current link. 404 connect_link_not_found; 404 user_not_found for a user that has not been created.

Query/path params:
- externalUserId (path)*: string  — 
- linkId (path)*: string  — 

Response 200:
- revoked*: boolean — 
- connectLink*: anyOf — 
