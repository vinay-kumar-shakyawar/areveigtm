# PumpGTM REST API reference: sequences, leads, people search, X, webhooks and the Partner API

Canonical URL: https://pumpgtm.com/docs/api

[PumpGTM](/) / [Developer docs](/docs)

# PumpGTM REST API

Run outreach from your own backend or agent over plain HTTPS: add people to a Play in one call, create sequences, find people, check X followers, decide replies, receive signed webhooks, and run PumpGTM for many clients with the Partner API. Same key as the MCP server.

Updated November 12, 2026 · [OpenAPI 3.1](/openapi.json) · [View as Markdown](/markdown/pages/docs/api.md)

[Browse every endpoint](#reference)[Get your API key](https://app.pumpgtm.com/install-mcp) › Integration guide: authentication, workflows, partners, webhooks and errors

Use REST to manage outreach from your own backend. Actions shared with [MCP](/docs/mcp) follow the same limits, approvals and billing; permanent test-lead deletion is REST-only. The interactive reference below this guide lists every endpoint with request and response schemas. The same spec is at [/openapi.json](/openapi.json) (OpenAPI 3.1) for generating a typed client. Agents: this page is plain Markdown at [/markdown/pages/docs/api.md](/markdown/pages/docs/api.md), and every endpoint with its schema is Markdown at [app.pumpgtm.com/docs/api.md](https://app.pumpgtm.com/docs/api.md).

New here? The [quickstart](/docs/quickstart) gets you to a first response in five minutes. Looking for person profiles or hiring signals? See the [people-data API](/docs/people-api) and the [Signals API](/docs/signals-api).

Using n8n? Install the [n8n-nodes-pumpgtm](https://www.npmjs.com/package/n8n-nodes-pumpgtm) community node from Settings > Community nodes, paste your workspace key into a PumpGTM API credential, and use it in workflows or as an AI Agent tool ([source](https://github.com/pumpgtm/n8n-nodes-pumpgtm)).

## Authentication

Base URLs:

- Workspace API: https://app.pumpgtm.com/api/v1

- Partner API: https://app.pumpgtm.com/api/partner/v1

Send the workspace key on every request as Authorization: Bearer eve_mcp_... . Sign in at [app.pumpgtm.com](https://app.pumpgtm.com), open MCP in the left nav, and copy the key. It is the same key the MCP server takes. Keep it in your server's secret manager and never put it in browser code, URLs, logs or prompts. A missing or unknown key returns 401 .

curl "https://app.pumpgtm.com/api/v1/progress?sinceDays=7" \
-H "Authorization: Bearer $PUMPGTM_KEY "

A workspace key acts on its own workspace. Call GET /workspaces first to see which workspaces the key can reach. A Team owner key can pick one of them with X-PumpGTM-Client: ; the header never grants access to another tenant. The older header names X-Eve-Client and X-Eve-User still work and mean the same thing. Use the same workspace for every call, including webhooks.

Keep numeric X user IDs as strings so they do not lose precision.

## Add people to a Play

This is the call most integrations need. Send people to any Play and they get its sequence on whichever channels you have identities for: LinkedIn, email or X.

curl -X POST https://app.pumpgtm.com/api/v1/plays/ $PLAY_ID /leads \
-H "Authorization: Bearer $PUMPGTM_KEY " -H "content-type: application/json" \
-d '{"requestId": "crm-sync-001", "leads": [{ "person": "Jane Doe", "xUsername": "janedoe", "email": "jane@acme.com" }]}'

- Up to 500 people per call. Each needs at least one of linkedinUrl , email or xUsername .

- They go straight into the Play's sequence and get the first message in the next working window. A paused sequence keeps them waiting until you resume it.

- People already in the workspace (matched by LinkedIn, email or X handle) are skipped, so nobody is messaged twice.

- requestId is optional. Send the same one when you retry and nothing is added twice.

- GET /plays/{id}/leads lists the Play's people and where each one is.

Find a Play's id in its URL in the app, or with GET /x/watches for X Plays.

## LinkedIn senders and InMail credits

Call GET /linkedin/accounts to list your workspace's connected and disconnected LinkedIn senders. Each id is the UUID to use as accountId when adding leads, reading sending limits or checking InMail credits.

curl https://app.pumpgtm.com/api/v1/linkedin/accounts \
-H "Authorization: Bearer $PUMPGTM_KEY "
{
"accounts" : [{
"id" : "00000000-0000-4000-8000-000000000001" ,
"displayName" : "Jane Doe" ,
"status" : "connected" ,
"pictureUrl" : null ,
"connectedAt" : "2026-11-01T09:00:00Z" ,
"timezone" : "Asia/Kolkata" ,
"proxyCountry" : "IN"
}],
"inmailEnabled" : true ,
"nextCursor" : null ,
"hasMore" : false
}

proxyCountry is the last recorded two-letter proxy country, or null when unknown. It is not a live location check or a dedicated-IP guarantee. Account discovery reads saved details without checking every sender's current connection. Set limit from 1 to 100 (default 50), optionally filter by status , and pass nextCursor as cursor until it is null.

Check one sender's live InMail balance with GET /linkedin/accounts/{accountId}/inmail-credits :

{
"accountId" : "00000000-0000-4000-8000-000000000001" ,
"checkedAt" : "2026-11-11T12:00:00.000Z" ,
"credits" : { "premium" : 0 , "recruiter" : null , "salesNavigator" : 42 }
}

The three balances are separate: 0 means zero credits; null means no balance was supplied. A failed lookup returns an error, never an assumed zero. A balance check sends nothing and reserves no credits. inmailEnabled on the account list reports workspace availability separately from the sender's subscription and credits. Contact PumpGTM support if InMail is unavailable for your workspace.

Partners use the same endpoints with X-PumpGTM-User: for a client workspace. Without that header, the key selects the partner's own workspace, unless its account requires a client selector. Use the same selector when listing senders, checking credits and adding leads. An account outside the selected workspace returns 404 ; a disconnected sender returns 409 ; a rate-limited balance check returns 429 with Retry-After .

Use GET /linkedin/accounts/{accountId}/sending-limits for the sender's daily invite cap, warm-up state and remaining allowance. Over MCP, sender UUIDs and countries appear in get_workspace , and get_linkedin_inmail_credits reads a single sender's balance.

## Sequences and leads

Your request is the approval. A sequence created with a workspace or partner key is live when POST /sequences returns, and adding people to a draft approves and starts it. Nothing is sent inside these calls: people enter the paced engine and are contacted within working hours, account limits and reply freezes.

Steps are the complete ordered list: up to 20 for linear or parallel sequences, or 30 with executionModel: "graph" . Supported kinds include connect , message , inmail , engage , email , x_dm , x_engage , instagram_dm and graph-only branch .

- Linear and parallel LinkedIn sequences start with connect . InMail uses a graph and needs a subject and messageTmpl , with no connection request. Workspace availability and the sender's subscription and credits still apply.

- A message needs messageTmpl or text on every variant. email and x_dm need messageTmpl , and the first email needs a subject .

- engage and x_engage need actions .

- To edit, read the sequence with GET /sequences/{id} , then PUT the full step list with its current revision . A 409 means nothing was overwritten.

# Create a sequence (live on return; nothing is sent until people are added)
curl -X POST https://app.pumpgtm.com/api/v1/sequences \
-H "Authorization: Bearer $PUMPGTM_KEY " -H "content-type: application/json" \
-d '{
"name": "Founders in fintech",
"steps": [
{ "kind": "connect", "delayDays": 0 },
{ "kind": "message", "delayDays": 1, "messageTmpl": "Hi {{firstName}}, thanks for connecting." }
]
}'

To add people to a sequence without a Play, use POST /sequences/{id}/leads with one of four methods:

- contacts : 1 to 500 people with any mix of LinkedIn URL, email and X handle. Same rules as adding to a Play.

- manual : 1 to 500 LinkedIn URLs.

- csv : a header row and at most 500 rows.

- sales_navigator : a saved-list URL. Poll GET /leads/imports/{batchId} until status is completed or failed .

Adding LinkedIn people needs a connected LinkedIn account in the workspace ( 409 linkedin_not_connected ). Undo any add with POST /leads/remove , which can also cancel an import or block companies.

Pause, resume or reopen a sequence with PATCH /sequences/{id}/status .

## Delete an unused test lead

To repeat an import test, use a paused sequence. Remove the test lead with POST /leads/remove , then call DELETE /leads/{id} with the lead's ID and no request body or query parameters. This permanently deletes the record and cannot be undone. It is available through REST only.

Deletion requires a current removal and no outreach or processing history. Invitations, messages, replies, opt-outs, linked records and work still running prevent deletion. A removal may need up to ten minutes to settle; follow removal.undoAfter or the Retry-After header on a 409 response.

After 200 confirms deletion, add the same profile with a new requestId . The old import receipt stays unchanged. Retrying DELETE against the old lead ID returns 404 and cannot delete the new lead. A 409 explains why deletion is blocked; a 503 means deletion could not be confirmed, so read the lead or retry with the same lead ID.

Deleting removes that record's duplicate protection, so future approved imports or Plays may add the person again. Other existing records, pending invitations and company exclusions still apply. For someone you want to keep out of outreach, use Remove; to restore their existing progress, use POST /leads/undo-remove .

## Replies and results

Read replies waiting on you with GET /replies and answer one with POST /replies/{id}/decide . Read results with GET /progress , GET /reports/funnel and the append-only GET /activity ledger.

Need new people instead of your own list? POST /people/searches finds them. With run: true it searches and returns a review batch, and requestId is then required because a run spends Energy. Record decisions with POST /people/reviews/{batchId}/decisions and finish: true to enroll the good fits.

## Partners: run PumpGTM for your clients

Agencies and platforms use one partner key and one isolated workspace per client. Clients never need a PumpGTM login. The partner key is the workspace key of the account created with POST /api/partner/v1/signup , also shown on the MCP page. Partner routes identify a client by your own externalUserId : letters, digits and _ . : @ - , up to 120 characters.

Hosted LinkedIn connect and outreach for clients are enabled per partner by PumpGTM. Call GET /api/partner/v1/account and confirm enterprise.linkedinConnect and enterprise.outreach are true . Until then those routes answer 403 enterprise_required . A key belonging to a client workspace gets 403 partner_key_required on partner management routes. Your existing workspace key works as a partner key once partner access is enabled; use the full Partner API base URL above.

- Create the client with POST /api/partner/v1/users . It is idempotent: 201 when created, 200 when it already existed. Store mcpUrl from the response.

- Connect the client's LinkedIn from your own dashboard. Set brandName and the success and failure redirect URLs once with PATCH /api/partner/v1/account . Then mint a link per click with POST .../users/{externalUserId}/linkedin/connect-links and open the returned url in a popup. Never use an iframe, because LinkedIn verification prompts do not work inside frames. Links are single use and expire after 7 days by default.

- Learn when it is done. Use any of three signals: a signed linkedin.connected webhook registered with the partner key, the browser redirect to your success URL, or polling GET .../connect-links/{linkId} every 3 seconds until status is not pending . They arrive in no fixed order, so treat each as idempotent on the connect link's id.

- Run outreach for a client by adding X-PumpGTM-User: to any /api/v1 request made with the partner key. Never send it together with X-PumpGTM-Client ( 400 invalid_request ). Without the header the key means your own partner workspace. Over MCP, point your agent at the client's mcpUrl with the same bearer.

- You pay for what your clients do , and they never see a card prompt. Cap a client with PATCH .../users/{externalUserId} and { "monthlyLeadCap": n } ( 403 user_lead_cap_reached at the cap). GET /api/partner/v1/users lists every client with this period's usage. DELETE disables a client: active sequences pause, requests answer 403 user_disabled , data is kept and nothing more is billed. PATCH { "status": "active" } reactivates.

# Create a client workspace (idempotent: 201 created, 200 existing)
curl -X POST https://app.pumpgtm.com/api/partner/v1/users \
-H "Authorization: Bearer $PARTNER_KEY " -H "content-type: application/json" \
-d '{"externalUserId": "acme", "name": "Acme Robotics"}'

# Mint a hosted LinkedIn connect link, then window.open(url, "connect-linkedin", "popup,width=520,height=720")
curl -X POST https://app.pumpgtm.com/api/partner/v1/users/acme/linkedin/connect-links \
-H "Authorization: Bearer $PARTNER_KEY " -H "content-type: application/json" -d '{}'

## Webhooks

Get an HTTPS POST the moment something happens instead of polling. Each workspace can have up to 10 webhooks, each with its own signing secret and event list.

Event When data

reply.received A prospect replied and the sequence froze. LinkedIn and email replies carry the drafted answer, so your agent can decide it with POST /replies/{id}/decide . An X reply has channel: "x" and replyId , classification and draft set to null : answer it in X. replyId , lead , classification , theirMessage , draft

lead.invited A connection request went out. lead

lead.accepted The prospect accepted the connection. lead

lead.messaged A LinkedIn message, follow-up or X DM was sent. X DMs carry channel: "x" . lead

lead.emailed An email step was sent. lead

lead.meeting_booked A meeting was recorded for the lead. lead

x.followed Someone followed a connected X account. outcome is staged , filtered or no_sink . account , follower , outcome

x.intent_detected An X Play scored a person as showing buying intent. play , person , score , tier , reasons , signals , fit

x.competitor_follower An X Play found a person who follows a competitor you named. play , person , signal

linkedin.connected A LinkedIn account was connected, including through a partner connect link. account , connectLink

linkedin.disconnected A connected LinkedIn account was disconnected. account

linkedin.watched_post A LinkedIn profile you watch published a post. profile , post

ping You called the test endpoint. webhookId , message

lead is { id, person, company, title, email, linkedinUrl, account, sequenceId, stage } .

# Create. The secret is returned once; store it.
curl -X POST https://app.pumpgtm.com/api/v1/webhooks \
-H "Authorization: Bearer $PUMPGTM_KEY " -H "content-type: application/json" \
-d '{"url":"https://example.com/pumpgtm","events":["reply.received","lead.accepted"]}'

GET /webhooks lists subscriptions without secrets. DELETE /webhooks/{id} disables one. POST /webhooks/{id}/test schedules a signed ping ; a 202 means scheduled, not delivered. Registration is not idempotent, so list subscriptions before retrying an uncertain creation.

Receivers must use HTTPS on port 443 at a public address. Private addresses, IP literals, URL credentials and redirects are rejected.

### Delivery and signature

Each delivery is a JSON POST of { id, event, createdAt, data } with these headers:

- X-PumpGTM-Event : the event name.

- X-PumpGTM-Delivery : the event id, the same for every attempt. Deduplicate on it.

- X-PumpGTM-Signature : t= ,v1= , where the signed string is . and the key is the webhook's secret.

import { createHmac, timingSafeEqual } from "node:crypto" ;

// rawBody must be the exact bytes received, BEFORE JSON parsing.
export function verify ( rawBody : Buffer , header : string , secret : string ) {
const match = / ^ t=( \d + ),v1=( [a-f0-9] {64} ) $ / . exec (header);
if ( ! match) return false ;
if (Math. abs (Date. now () / 1000 - Number (match[ 1 ])) > 300 ) return false ;
const expected = createHmac ( "sha256" , secret). update (match[ 1 ] + "." ). update (rawBody). digest ();
return timingSafeEqual (expected, Buffer. from (match[ 2 ], "hex" ));
}
import hmac, hashlib, time

def verify_pumpgtm (raw_body: bytes , signature_header: str , secret: str , tolerance = 300 ) -> bool :
parts = dict (kv.split( "=" , 1 ) for kv in signature_header.split( "," ))
if abs (time.time() - int (parts[ "t" ])) > tolerance:
return False
expected = hmac.new(secret.encode(), f " { parts[ 't' ] } ." .encode() + raw_body, hashlib.sha256).hexdigest()
return hmac.compare_digest(expected, parts[ "v1" ])

Answer with any 2xx within 10 seconds and do slow work in your own queue. A timeout, network error, 429 or 5xx is retried twice, 1 and 4 seconds later, with the same delivery id. Other non-2xx responses end delivery. There is no replay queue yet, so poll lead state and activity to reconcile anything missed.

## X: check whether someone follows you

- Find the connected sender with GET /x/accounts . GET /x/readiness returns saved account, billing and Energy state. It does not contact X or prove a send will succeed.

- If your lead has a known X handle, call POST /x/eligibility . POST /x/users/resolve turns a handle into its numeric ID. POST /leads/enrich bridges emails or LinkedIn URLs to X identities where a match exists.

- Read followsAccount on each result. true means the lead follows your account, false is a verified negative, and null means unknown. Check checkedAt for freshness. A lead following you is different from your account following them.

- Checking never enrolls or sends, and a positive result does not guarantee the recipient accepts DMs. To message them, [add them to a Play](#add-people-to-a-play).

- Track a lead with GET /x/leads/{id} and stop it with POST /x/leads/{id}/stop . Stopping halts future automation across the lead's channels, keeps history, and cannot recall anything already sent.

## Advanced: manual review

Most integrations never need this. It is for Plays where someone approves each person before anyone is messaged. To message people, [add them to a Play](#add-people-to-a-play) instead.

POST /plays/{id}/import puts 1 to 100 numeric X IDs on the Play's review list without messaging anyone. It requires a requestId . GET /plays/{id}/candidates returns the list with the current Play and sequence revisions, and POST /plays/{id}/enroll with both revisions plus candidateIds approves the chosen people into the sequence. POST /plays/{id}/candidates/lookup checks whether someone is already on the list. GET /x/plays shows which Plays have review turned on ( reviewApiEnabled ).

## Retries and idempotency

requestId matches ^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$ . It is optional on most writes and required on manual-review imports and people-search runs. Same requestId and same body returns the stored result with the same ids. Same requestId and a different body is a 409 and changes nothing. Without one, a retry is a new request.

Status Meaning What to do

400 invalid_request The body failed validation; issues says where. Fix the request.

401 Missing, unknown, revoked or expired key. Check or rotate the key.

402 energy_exhausted Not enough Energy for a paid action. Add Energy or lower the count.

403 No access to this workspace, feature or channel. Check the key, the X-PumpGTM-Client or X-PumpGTM-User header or the account's capabilities.

404 not_found The resource is not in this workspace. Check the id and workspace.

409 Not allowed in the current state; error carries the reason and nothing changed. Read current state, then decide. Do not blindly repeat with a new requestId .

429 Rate limited. Respect Retry-After .

5xx Transient failure. Retry reads with exponential backoff and jitter.

Follower checks can return 200 with individual null results when PumpGTM cannot verify a relationship, so inspect each result. Pages use nextCursor : pass it as after and stop when it is null .

## Energy

Energy pays for actions that cost PumpGTM real money per call. Every plan includes Energy each month, and extra packs are $10 for 100 Energy on the billing page of the app. LinkedIn actions, email sends, sequences, replies and webhooks cost no Energy.

Action Energy

A person found by people search and returned to review 2

A liker or follower staged from an X Play 1

An X DM, including the thread check 5

An X DM from a sequence with the thread check off 0.6

An X follow, unfollow, like or repost 1

A people-data enrichment Priced per lookup, see [people-data API](/docs/people-api)

Read the balance with GET /energy or GET /x/readiness . Neither is a quote or reservation. A paid action that would exceed the balance is refused with energy_exhausted and nothing runs.

## Versioning

The path carries the major version ( /api/v1 ). Existing v1 responses stay compatible: new fields may be added, existing ones are not removed or renamed. A breaking change ships under a new major path while v1 keeps working. Anything scheduled for removal answers with Deprecation: true and a Sunset header at least 90 days ahead.

Questions or a missing endpoint: [support@pumpgtm.com](mailto:support@pumpgtm.com).
