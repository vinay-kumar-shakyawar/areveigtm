# PumpGTM People Data API: Email to LinkedIn, X and Work Email

Canonical URL: https://pumpgtm.com/docs/people-api

[PumpGTM](/) / [Developer docs](/docs)

# People data API

Enrich a person from an email or a LinkedIn URL. Get their LinkedIn, current company, X account and work email, paid in Energy.

Updated October 4, 2026 · [View as Markdown](/markdown/pages/docs/people-api.md)

Enrich one person from an email address or a public LinkedIn URL. The same operation is available as the MCP tool [enrich_person](/docs/people-mcp). It returns data to your workflow without creating a lead or starting outreach.

## Make a request

Use your existing workspace key from MCP in [your PumpGTM workspace](https://app.pumpgtm.com/install-mcp). Keep it on your server. Your workspace must have Energy enabled and available; [billing](https://app.pumpgtm.com/billing#energy) shows your balance. If Energy is not enabled, contact [PumpGTM support](/contact).

curl https://app.pumpgtm.com/api/v1/people/enrich \
-H "Authorization: Bearer $PUMPGTM_KEY " \
-H "Content-Type: application/json" \
-d '{ "email": "arthur@example.com", "find": ["x"] }'

Field Type Meaning

email string An email address. We match it to a LinkedIn profile first.

linkedin string A public LinkedIn person URL, at most 1,500 characters. Company URLs are rejected.

find array, optional Paid extras: "x" for their X account, "work_email" for a work email.

Send exactly one of email or linkedin . One person per request. The body must be valid JSON under 4 KB. Unknown fields are rejected. The credential fixes your workspace; you cannot select another customer in the body or header.

## Read the response

This is a fictional response example , not a live result or a coverage guarantee.

{
"id" : "example-request" ,
"person" : {
"name" : "Arthur Dent" ,
"title" : "Co-founder" ,
"headline" : "Co-founder at Magrathea Labs" ,
"location" : "San Francisco, CA" ,
"company" : { "name" : "Magrathea Labs" , "domain" : "example.com" },
"linkedin" : "https://www.linkedin.com/in/arthur-dent-example" ,
"x" : {
"handle" : "arthurdent" ,
"url" : "https://x.com/arthurdent" ,
"evidence" : "X bio names Magrathea Labs"
},
"workEmail" : null
},
"missing" : { "workEmail" : "not_found" },
"energyUsed" : 1.2
}

person is null when nobody matches, including an email that matches no LinkedIn profile. Fields we could not fill are null ; x and workEmail are null unless you asked for them in find and we found them.

missing appears only when something you asked for in find did not come back. The reason is one of:

Reason Meaning

not_found No confident match. It does not mean the person has no X account or email.

energy_exhausted The workspace ran out of Energy partway through.

unavailable The lookup could not complete.

workEmail is { "address", "matchesCompanyDomain" } . Check matchesCompanyDomain before using an address: a returned address may belong to a different company's domain. A found email is a lookup result, not a delivery guarantee.

## X accounts

With "find": ["x"] , we look for the person's X account by name and return one only when its display name matches theirs and its own bio or profile link points at their LinkedIn profile, their company's domain, or their company's name. x.evidence says which. If two accounts pass, or none do, x is null and missing.x is not_found . The X lookup is usually 0.2 Energy (1 cent).

## Connections

When we have previously observed public follow relationships for this person, person.connections lists up to 100 of them. Without any, the field is absent.

"connections" : [{
"from" : "https://x.com/i/user/123" ,
"to" : "https://x.com/i/user/456" ,
"type" : "follows" ,
"sourceUrl" : "https://x.com/i/user/123/following" ,
"observedAt" : "2026-10-04T12:00:00Z"
}]

This call does not crawl a new social graph. A follow is not a friendship, mutual connection, or endorsement. Expired and suppressed observations are excluded, and customer-private lists, messages, and targeting decisions are never returned.

## Energy and errors

One Energy is $0.05 . Each paid provider lookup reserves Energy before it runs, then settles against the provider cost recorded in the rate book. People-data lookups are priced at twice that cost, rounded up to the next 0.1 Energy per lookup . A matched profile is usually 1 Energy ($0.05) and the X lookup 0.2 Energy, so a profile with X is about 6 cents . A lookup that matches nobody is usually free. These are pricing examples; actual provider rates vary.

energyUsed is the Energy this request spent, including any still held for a call whose final cost is unknown. Paid attempts can cost Energy even when they return no match. Reused email results and existing connections do not add a charge. An uncertain timeout retains its reservation until its cost can be reconciled.

HTTP status Error What to do

400 invalid_request Correct the JSON, email or LinkedIn URL. Send exactly one of email or linkedin .

401 unauthorized Supply a valid workspace key.

402 energy_exhausted Follow the returned refill or team-allocation guidance.

403 energy_required or tenant mismatch Enable Energy or use the correct workspace credential.

404 person_unavailable The person cannot be returned, including suppressed identities.

413 request_too_large Keep the JSON body under 4 KB.

503 people_data_unavailable The lookup could not complete. Completed work may already have used Energy.

This paid operation is not idempotent . Do not automatically retry timeouts or errors: repeated profile lookups can spend Energy again. Save the returned id with your result for support. Responses are private and are not cached by the API.

## Start with an existing dataset

Browse [YC founders](/yc/founders) or [early-stage investors](/yc/investors), then pass an individual public LinkedIn profile to the API. These pages contain existing curated datasets; this endpoint enriches one person and does not export a whole list or perform audience search.

For audience discovery and outreach, use the existing [workspace MCP tools](/docs/mcp). For the launch overview and interactive example, visit the [people data index](/people).

Questions or a missing endpoint: [support@pumpgtm.com](mailto:support@pumpgtm.com).
