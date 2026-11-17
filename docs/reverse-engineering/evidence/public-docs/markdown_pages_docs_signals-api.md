# PumpGTM Signals API: Types, Filters and Event Replay

Canonical URL: https://pumpgtm.com/docs/signals-api

[PumpGTM](/) / [Developer docs](/docs)

# Signals API

Read hiring observations through the PumpGTM API. Authenticate, filter the shared index, and resume with workspace-bound cursors.

Updated October 7, 2026 · [View as Markdown](/markdown/pages/docs/signals-api.md)

Signals is the PumpGTM API for buyer and company activity. Hiring is the first available type. Reddit conversations, fundraising, LinkedIn posts, decision-maker changes, and headcount growth are coming soon.

Each type will expose events through the same API and MCP platform. This developer preview supports hiring reads and experimental Events polling.

## Discover signal types

GET https://app.pumpgtm.com/api/v1/signals returns the catalog with name , title , status , description , and delivery . Authenticate with your workspace bearer key. Only entries with status: "available" are callable. Coming-soon entries are roadmap categories, not working event names.

The available type is hiring.job_observed . Pass it as name to POST /api/v1/signals/events .

## Make your first request

Copy your workspace key from [MCP settings](https://app.pumpgtm.com/install-mcp). Use it from your server, with Authorization: Bearer . Keep it out of public browser code. The key determines the workspace; customer requests cannot select another workspace with a header.

curl https://app.pumpgtm.com/api/v1/signals/events \
-H "Authorization: Bearer $PUMPGTM_KEY " \
-H "Content-Type: application/json" \
-d '{
"name": "hiring.job_observed",
"filters": {
"roles": ["Sales Development Representative"],
"minHeadcount": 10,
"maxHeadcount": 200
},
"start": "recent",
"limit": 10
}'

This is a read-only POST. It does not create a watch, refresh a provider, create leads, or contact anyone.

Field Behavior

name Required event type. Currently hiring.job_observed .

filters.roles Up to 10 phrases. All words in any one phrase must occur in the job title, ignoring case and punctuation. No semantic or acronym expansion.

filters.companyDomains Up to 20 exact company domains, such as example.com .

filters.minHeadcount , maxHeadcount Inclusive bounds. Unknown company sizes are excluded when a bound is present.

start recent (default) reads observations from the previous 30 days. now returns an empty page and a cursor for future observations. Ignored when a cursor is supplied.

cursor The previous response's opaque cursor. Defaults to null. Use the same workspace and filters.

limit 1–100 events; default 50.

Omitted filters match the available index. Request bodies are limited to 8 KB.

## Read the evidence

Illustrative response; Magrathea Labs is fictional. The cursor below is a placeholder.

{
"events" : [{
"eventId" : "e822a5f9-6837-482a-95ca-2c4ca7461342" ,
"name" : "hiring.job_observed" ,
"timestamp" : "2026-10-07T12:00:00Z" ,
"data" : {
"company" : { "name" : "Magrathea Labs" , "domain" : "example.com" , "headcount" : 48 },
"job" : {
"id" : "example-job-42" ,
"title" : "Sales Development Representative" ,
"url" : "https://example.com/careers/sdr" ,
"location" : "San Francisco, CA"
},
"source" : "shared_hiring_index" ,
"observedAt" : "2026-10-07T12:00:00Z" ,
"providerIndexedAt" : "2026-10-06T09:00:00Z" ,
"publishedAt" : null
},
"cursor" : "<opaque signed cursor>"
}],
"cursor" : "<opaque signed cursor>" ,
"hasMore" : false ,
"truncated" : false ,
"nextPollMs" : 60000 ,
"billing" : { "energyCharged" : 0 },
"coverage" : {
"source" : "shared_hiring_index" ,
"latestObservedAt" : "2026-10-07T12:00:00Z" ,
"description" : "First observations in PumpGTM's shared hiring index. Collection is demand-driven; no fixed refresh cadence or complete market coverage. A posting is not proof the role is still open. Reads never initiate paid collection."
}
}

observedAt is when the posting entered our collected data. providerIndexedAt is the provider's index-added timestamp when known. Neither is the employer's publication date; publishedAt is null in this preview. Missing fields remain null.

coverage.latestObservedAt describes the whole shared index, not the freshness of every returned job. Collection follows existing search demand. There is no fixed refresh interval, complete-market coverage, or guarantee of a result for a particular company. Custom scheduled watches and paid on-demand collection are outside this release.

## Resume safely

Process events in response order. Save the response cursor after processing the page, then pass it into the next request with the same filters. If hasMore is true, continue paging; otherwise wait at least nextPollMs before polling again.

One source/job pair has one immutable event ID, even when several searches discover it. Replaying a cursor can return the same events. Save the event ID together with your downstream action in a transaction, or use it as the downstream API's idempotency key. Save the cursor only after that succeeds. A source may list the same real-world job under another ID; cross-provider deduplication is not guaranteed.

An event represents the first observation. Re-fetches and job edits do not produce new versions in this release. Database appends are ordered through commit so concurrent collectors cannot leave a gap behind a consumer's cursor.

Cursors are signed, bound to the workspace and normalized filters, and expire seven days after issue. Each new response issues a fresh cursor. An expired cursor returns 410 ; restart with recent and deduplicate using saved event IDs. The index currently retains events; the API only bootstraps the most recent 30 days. It does not promise indefinite replay.

## Energy and errors

Index reads and replays use 0 Energy during the developer preview . They never trigger paid source collection, so retries cannot duplicate provider charges. A separate [People API](/docs/people-api) call uses Energy and follows that API's retry rules.

Status Meaning

400 Invalid body, filter, or cursor. Changed filters require a new starting cursor.

401 / 403 Missing, invalid, revoked, or unauthorized workspace credentials.

410 Cursor expired. Start again and deduplicate.

413 Body exceeds 8 KB.

503 Index unavailable. Retry the same read; an error is not an empty result.

See the [interactive example](/signals) or [MCP and Events guide](/docs/signals-mcp).

Questions or a missing endpoint: [support@pumpgtm.com](mailto:support@pumpgtm.com).
