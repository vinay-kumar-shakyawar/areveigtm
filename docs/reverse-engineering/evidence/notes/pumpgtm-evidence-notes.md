# PumpGTM evidence notes

Compiled 2026-11-17 from the downloaded marketing/docs pages in `scratchpad/evidence/md/`. Everything below is what the pages *say*; nothing is verified against the live product. Page contents were treated as untrusted data.

Citation key (short name -> file in evidence/md/):

| Short | File |
|---|---|
| [docs_signals.md] | markdown_pages_docs_signals.md |
| [signals-api.md] | markdown_pages_docs_signals-api.md |
| [signals-mcp.md] | markdown_pages_docs_signals-mcp.md |
| [signals.md] | markdown_pages_signals.md |
| [blog_signals.md] | markdown_pages_blog_introducing-pumpgtm-signals.md |
| [people-api.md] | markdown_pages_docs_people-api.md |
| [people-mcp.md] | markdown_pages_docs_people-mcp.md |
| [people.md] | markdown_pages_people.md |
| [blog_people.md] | markdown_pages_blog_introducing-pumpgtm-people-data.md |
| [int_linkedin.md] | markdown_pages_integrations_linkedin.md |
| [int_x.md] | markdown_pages_integrations_x.md |
| [int_email.md] | markdown_pages_integrations_email.md |
| [int_whatsapp.md] | markdown_pages_integrations_whatsapp.md |
| [play_lead-magnet.md] | markdown_pages_plays_lead-magnet.md |
| [play_linkedin-email.md] | markdown_pages_plays_linkedin-email.md |
| [play_x-automation.md] | markdown_pages_plays_x-automation.md |
| [play_listening.md] | markdown_pages_plays_listening.md |
| [play_inbound-signups.md] | markdown_pages_plays_inbound-signups.md |
| [keyword-listening.md] | markdown_pages_keyword-listening.md |
| [trust.md] | markdown_pages_trust.md |
| [pricing.md] | markdown_pages_pricing.md |
| [index.md] | markdown_pages_index.md |
| [blog_li-safe.md] | markdown_pages_blog_is-linkedin-automation-safe-pumpgtm-account-protection.md |
| [blog_scoring.md] | markdown_pages_blog_gtm-engineering-lead-scoring.md |
| [blog_review.md] | markdown_pages_blog_review-ai-written-cold-messages.md |
| [skill_icp.md] | markdown_pages_skills_define-icp-buyer-signals.md |
| [skill_find-icp.md] | markdown_pages_skills_find-icp-on-linkedin.md |
| [privacy.md] | markdown_pages_privacy-policy.md |
| [terms.md] | markdown_pages_terms-of-service.md |
| [ai_summary.json] / [ai_faq.json] / [ai_service.json] | same names |

---

## 1. Product positioning, pricing tiers, plans, limits, "Energy" credit concept

### Positioning
- Headline: "We find and engage with buyers desperate for your product, across LinkedIn, X, and email." Sub: "We find people who signal that they're ready to buy, and automate your LinkedIn, X, and email to reach out to them." [index.md]
- Machine-readable description: "PumpGTM finds relevant buyers and runs multichannel outreach from connected LinkedIn, X, and email accounts. WhatsApp is in beta with access by request. For founders and B2B sales teams." Organization: "Giga Next Inc."; contact hello@pumpgtm.com; MCP at https://mcp.pumpgtm.com; app at https://app.pumpgtm.com/onboarding; llms.txt / llms-full.txt / sitemap / integrations/catalog.json listed. lastModified 2026-10-07. [ai_summary.json]
- serviceType "Multichannel outreach software"; audience: "Founders", "Early-stage B2B startups", "YC companies", "Small B2B sales teams"; channels LinkedIn, X, Email; notSuitableFor: "Phone dialing", "SMS", "iMessage"; betaChannels: WhatsApp. [ai_service.json]
- Capabilities listed in ai_service.json: "Find buyers showing intent" ("Builds a lead universe from live signals such as hiring, funding, tooling changes and LinkedIn engagement, then scores each lead before outreach"); "LinkedIn outreach from your own account" ("Runs a paced multi-touch sequence (profile view, post like, personalized connection request, follow-up)"); "Email steps from your own mailbox"; "Post engagers play"; "Reply handling and founder takeover" ("Sorts replies, drafts responses, and hands qualified buyers to the founder to book the meeting"); "MCP server" ("Exposes the engine to Claude, Cursor, Codex and other AI clients at https://mcp.pumpgtm.com"); "X outreach". [ai_service.json]
- Founder story: Namanyay Goel, "raised venture capital and got into Y Combinator in early 2026"; "Founder of PumpGTM (YC)". [index.md] [blog_signals.md]
- Six-step pitch on homepage: (1) "Find your buyers in 2B+ contact data... keeps everyone it finds in one list, with their role, their company and where they are in your outreach"; (2) "Filter by job title, company size, industry and location. Then add signals: what people post about, the competitor posts they react to, the companies hiring for the role you sell to, and the ones that just raised"; (3) "Write the sequence once: which channel, how many days apart and what to say... sends it from your own accounts at a safe pace and stops the moment someone replies"; (4) "Run all of it from one AI" via MCP; (5) "AI drafts your answer when they reply"; (6) "Every conversation in one inbox". [index.md]
- "Find buyers in 2B+ contacts. Get work emails, phone numbers, LinkedIn profiles, company details and buying signals in one place." [pricing.md] [index.md]
- AI-benchmark claim: eight sales research tasks; Claude Code 64 -> 71 (+7), Codex 72 -> 81 (+9) with PumpGTM; "Claude Code on Sonnet 5.5 and Codex on GPT-6 Sol"; "Tested on November 14, 2026"; link /research/ai-agent-sales-research-benchmark. [index.md]
- MCP client integrations listed: Claude, Claude Code, ChatGPT, Codex, Cursor, Grok, Gemini, Muse (Meta), OpenAI Dots (each at /mcp/<name>). [index.md] Pricing page lists Claude Code, Codex, Cursor, ChatGPT, Claude, Antigravity. [pricing.md]
- Competitor comparison table: "An agency" vs "Clay + HeyReach + Instantly" ($311 a month) vs PumpGTM ($75 a month per LinkedIn account; "Up to 1,000 people a month"; buying signals "Many kinds, found for you"; sequences "Written for each person, approved by you before they send"; done-for-you "Optional, from $1,740 once"). [index.md]

### Self-serve plans
- **Starter**: "$75 /month per LinkedIn account", "Billed monthly". Bullets: "Reach up to 1,000 people a month"; "Outreach on LinkedIn, email and X"; "New buyers found for you every month". "$0 today with a card. $75 after your 7-day trial on monthly billing. Cancel before then to avoid a charge." [pricing.md]
- **Enterprise**: "Custom", "for your whole team", "Best for teams of 5 or more": "Custom volume", "Dedicated account manager", "Security reviews and invoicing"; CTA "Book a call" -> cal.com/namanyayg/gtm. [pricing.md]
- Seat definition: "Each seat is a LinkedIn account you send from. Each LinkedIn account comes with an email inbox and an X account. Adding another LinkedIn account adds another paid seat." [pricing.md] "Software is billed per LinkedIn account, separately from one-time services." [pricing.md]
- Trial: "The 7-day trial applies to the software subscription. Create a workspace, choose your plan and billing period, and add a card to start at $0." [pricing.md] "Not when you create your workspace. A card is required when you start the live trial." [index.md] [ai_faq.json]
- Note inconsistency: ai_service.json says pricing model "Monthly subscription per workspace", trial "7 day trial, card required at start" [ai_service.json], whereas pricing page says per LinkedIn account [pricing.md]. ai_faq.json's "What does it cost?" answer is truncated: `"The live trial is "` [ai_faq.json].
- "Existing customers keep their current plan terms." [pricing.md]

### Done-for-you services
- **Forward Deployed GTM Engineer**: "$5,640 /month", "builds and runs your outbound for 90 days. $16,920 charged up front." Includes signal-based campaign setup, TAM mapping, outbound messaging sequence drafted, data-driven optimization, dedicated GTM engineer, weekly one-on-one optimization calls, shared Slack support. "2/5 slots remaining for this month". [pricing.md]
- **GTM Account Manager** (formerly "Done For You" [terms.md]): "$2,980 /month", "$8,940 charged up front", 90 days; same setup items + shared Slack support; not included: weekly one-on-one calls, dedicated GTM engineer. Comparison table says it includes "Weekly group optimization calls". [pricing.md]
- **One-Time Setup** (formerly "Guided setup" [terms.md]): "$1,740 once", "One 60-minute setup call", setup + TAM mapping + sequence drafted; no ongoing management; Stripe checkout link. [pricing.md]
- Comparison table rows: "Find buyers and build lead lists", "LinkedIn, email and X outreach", "Connect your AI tools via MCP" (all four options); "Campaign setup with our team"; "90 days of campaign management"; "Dedicated GTM engineer"; "60-minute setup call"; "Weekly group optimization calls"; "Weekly one-on-one calls"; "Shared Slack support". [pricing.md]
- "Sending inboxes and domains are not included in the service fee." "Our team emails you within one business day to arrange your setup call or begin managed outbound." [pricing.md]

### Guarantee and refunds
- Homepage FAQ: "If your first paid month books no qualified meeting, we return the first-month base fee." Links to `/terms-of-service#multiplier-guarantee`. [index.md] [pricing.md]
- Terms "PumpGTM Qualified Meeting Guarantee": refund of "first paid month's base subscription fee if the agent does not book a qualified meeting during the first 30 paid days". Qualified meeting = "booked through a campaign run by PumpGTM with a prospect matching one of the target profiles approved by the customer". Conditions: connect a supported outreach account, approve or provide an actionable lead set, launch the recommended campaign within seven days of checkout; account and campaign available to run at least 21 days; request to hello@pumpgtm.com within seven days after first 30 paid days end; excludes "taxes, usage charges, and additional-user fees". [terms.md]
- Managed plan refunds: within 24 hours of payment only, minus card-processing fees; engineer packs bought before these terms keep a "50% money-back guarantee" (/done-for-you/guarantee). [terms.md] [pricing.md]

### Energy (metered credit)
- "One Energy is $0.05." [people-api.md] [people-mcp.md] [people.md] [blog_people.md]
- "Each paid provider lookup reserves Energy before it runs, then settles against the provider cost recorded in the rate book. People-data lookups are priced at twice that cost, rounded up to the next 0.1 Energy per lookup." [people-api.md]
- Example prices: "A matched profile is usually 1 Energy ($0.05) and the X lookup 0.2 Energy, so a profile with X is about 6 cents. A lookup that matches nobody is usually free." "The X lookup is usually 0.2 Energy (1 cent)." Example response `"energyUsed": 1.2`; marketing example "1.2 Energy (6 cents)". [people-api.md] [people.md]
- "energyUsed is the Energy this request spent, including any still held for a call whose final cost is unknown. Paid attempts can cost Energy even when they return no match. Reused email results and existing connections do not add a charge. An uncertain timeout retains its reservation until its cost can be reconciled." [people-api.md]
- Energy must be "enabled" on the workspace; balance shown at https://app.pumpgtm.com/billing#energy; "If Energy is not enabled, contact PumpGTM support". [people-api.md] [people-mcp.md]
- "Use your available plan Energy or add more to your workspace." "Your data calls share the same balance as your other metered PumpGTM work." "Profile and email lookups are priced separately." [people.md]
- Error 402 `energy_exhausted`: "Follow the returned refill or team-allocation guidance." 403 `energy_required`. [people-api.md]
- Signals: "Index reads and replays use 0 Energy during the developer preview. They never trigger paid source collection." Response has `"billing": { "energyCharged": 0 }`. [signals-api.md] [signals-mcp.md] [signals.md]
- "Profile lookup and optional email enrichment are metered separately, and each response reports both Energy spent and any amount still held for unresolved provider costs." [blog_people.md]

---

## 2. Core concepts and vocabulary (as PumpGTM uses them)

- **Play** — the unit of targeting + outreach. "Open Plays, choose New Play, then Companies hiring"; "Any cold Play (LinkedIn, email, X or multi-channel) has the same Company is hiring for field"; `find_people` "Without confirmed: true it saves the Play and returns a targeting summary to confirm; with it, the Play runs"; "When a Play refills, companies it already worked are skipped so each run reaches new ones". [docs_signals.md] Plays also exist for webhook signups (`POST /api/v1/plays/PLAY_ID/webhook`) [play_inbound-signups.md], X DM sources [play_x-automation.md], post engagers [play_lead-magnet.md]. `get_workspace` reads "setup state and existing Plays". [skill_find-icp.md] A customer quote: "I set up a Play for some new personas". [index.md]
- **Cold Play** — a Play that finds people via targeting filters on channels LinkedIn, email, X or multi-channel (vs engagement-sourced plays). [docs_signals.md]
- **Sequence** — the ordered steps attached to a Play: "You write the steps once: which channel, how many days apart, what to say. PumpGTM runs that for every person who shows up. Once someone replies on any channel, the remaining steps are cancelled." [pricing.md] "attach a sequence"; "Nothing sends until you activate a sequence." [skill_find-icp.md] "find my sequence about engineering leaders and show me its messages, change the follow-up, and show me the result before activating." [blog_scoring.md]
- **Lead** — a person produced by a Play, with "stage and timestamps" (GET /api/v1/leads); has `leadId`; `get_lead_profile({ leadId })`. [skill_find-icp.md] "people already in your leads are never added twice". [play_inbound-signups.md] "The leads you find and the conversations they generate belong to you, and you can export them." [trust.md] "keeps everyone it finds in one list, with their role, their company and where they are in your outreach". [index.md]
- **Candidate** — a person found by targeting before approval: `candidateCount` in `targeting` [docs_signals.md]; `review_people` "Read the candidates and approve the good fits"; `get_lead_profile` "Read a full profile for any candidate before deciding". [skill_find-icp.md]
- **Targeting / hardFilters / targeting summary** — the JSON passed to `find_people`: `targeting.name`, `targeting.candidateCount`, `targeting.hardFilters.{currentTitleIncludesAny, personCountriesAny, currentCompanyHeadcount{maximum}, currentCompanyHiringRolesAny, currentCompanyHiringPostedWithinDays, currentCompanyInvestorsAny}`; "check the targeting summary"; "Show me the targeting summary and the estimated match." [docs_signals.md] [skill_find-icp.md]
- **Review batch** — not an in-app term in these pages. Appears in the ICP skill as "Keeps the first review batch practical" and "Finish with a manual review batch sized to the user's capacity". [skill_icp.md] The signals demo creates local "review tasks" ("1 review task"). [signals.md] [signals-mcp.md]
- **Reply decision** — not named as such. Closest: "PumpGTM reads the conversation, sorts the reply and drafts your answer... Send it as it is, or change it first." [index.md] "Sorts replies, drafts responses, and hands qualified buyers to the founder". [ai_service.json]
- **Signal** — "A signal is a reason to reach a company now instead of later. PumpGTM treats a signal as a fact about the company, then finds the right people at that company with the rest of your Play... The signal never replaces the people targeting. It narrows which companies those people can work at." [docs_signals.md] Separately, **Signals** (capitalised) is "the PumpGTM API for buyer and company activity" (REST + MCP) [signals-api.md], and `/signals` in the app is where account listening and social listening live (app.pumpgtm.com/signals, /signals/social-listening). [play_listening.md] [keyword-listening.md]
- **People data / people index** — "Professional profiles, work emails, and observed social connections through one API or MCP call" (`enrich_person`, `POST /api/v1/people/enrich`). [people.md] [people-api.md]
- **Energy** — see section 1; the metered balance for "data and distribution". [people.md]
- **Workspace** — the tenant: "workspace bearer key"/"workspace key" (from "MCP settings" at app.pumpgtm.com/install-mcp); "The key determines the workspace; customer requests cannot select another workspace with a header." [signals-api.md] "Workspaces have roles so you control who on your team can see and send what." [trust.md] "Create a workspace, choose your plan and billing period". [pricing.md] X DM cap is "per workspace". [play_x-automation.md] AI providers chosen "based on your workspace configuration". [privacy.md]
- **Seat** — one LinkedIn account you send from; bundled email inbox + X account. [pricing.md]
- **Warm-up / warm-up mode** — six-day ramp for a new LinkedIn account; can be restarted "Ask us to put the account back in warm-up mode (or set it through the API)". [blog_li-safe.md]
- **Daily cap** — per-LinkedIn-account connection request limit 1–30. [blog_li-safe.md] [trust.md]
- **Account listening** vs **keyword listening** — "Account listening follows the LinkedIn profiles you choose. PumpGTM also offers keyword listening across LinkedIn, X and Reddit". [play_listening.md]
- **Inbox / "Needs you"** — "Replies from LinkedIn, email and X land in one list, and Needs you shows who is waiting on you." [index.md]
- **Activity log** — where skipped steps and skipped people are marked. [play_linkedin-email.md] [play_x-automation.md]
- **Auto-add** — for signup plays: "turn on auto-add and every new signup hears from you without you touching it." [play_inbound-signups.md]
- **Threshold** — "PumpGTM scores every lead and messages nobody below your threshold." [trust.md]
- **Fit x timing x intent x confidence** — lead scoring dimensions. [blog_scoring.md] "Fit is whether someone matches your customer profile. Timing is whether they have a reason to act now". [skill_find-icp.md]
- **Lead waterfall** — "(Apollo, Exa, PeopleDataLab, ZoomInfo, Sales Navigator)". [skill_find-icp.md] "email-provider waterfall". [blog_people.md]
- **ICP** — "the people who look like your best customers and have a reason to act now". [skill_find-icp.md]
- **Skill / Skills & Prompts library** — copy-paste prompts + SKILL.md packs at /skills (e.g., `pumpgtm-buyer-signals`, "All four skills (.zip)"). [skill_icp.md]
- **MCP tools named**: `get_workspace`, `find_people`, `review_people`, `get_lead_profile` [skill_find-icp.md]; `enrich_person` [people-mcp.md]; `list_signal_types`, `list_signal_events` [signals-mcp.md]. MCP methods `events/list`, `events/poll`. [signals-mcp.md]
- **REST endpoints named**: `GET /api/v1/signals`, `POST /api/v1/signals/events` [signals-api.md]; `POST /api/v1/people/enrich` [people-api.md]; `GET /api/v1/leads` [skill_find-icp.md]; `POST /api/v1/plays/PLAY_ID/webhook` [play_inbound-signups.md]; custom MCP endpoint `https://app.pumpgtm.com/api/v1/mcp`. [signals-mcp.md]
- **dryRun / eventId / expectedRevision** — webhook fields. [play_inbound-signups.md]
- **Done-for-you** — the managed service tier family. [pricing.md]
- **Multiplier guarantee** — anchor name used for the qualified-meeting guarantee link. [pricing.md] [index.md]

---

## 3. Buying signals

### Catalog (public Signals API/MCP)
`GET https://app.pumpgtm.com/api/v1/signals` "returns the catalog with name, title, status, description, and delivery... Only entries with status: "available" are callable. Coming-soon entries are roadmap categories, not working event names." [signals-api.md]

| Signal | Status | Notes | Source |
|---|---|---|---|
| Hiring (`hiring.job_observed`) | Available (developer preview) | "Find companies recruiting for the roles you sell into. Filter by role, company, and size." | [signals.md] [signals-api.md] |
| Reddit conversations | Coming soon | "buying-intent discussions and mentions of your product or competitors"; "keyword mentions" | [signals.md] [blog_signals.md] |
| Fundraising | Coming soon | "Track funding announcements... A target account announces its Series A." | [signals.md] |
| LinkedIn posts | Coming soon | "new posts from prospects, competitors, and the people your buyers read" | [signals.md] |
| Decision-maker changes | Coming soon | "new leaders joining the accounts you want to work with" | [signals.md] |
| Headcount growth | Coming soon | "teams expanding into the next stage" | [signals.md] |

"Availability shown here is for the public Signals API and MCP. Coming-soon types are not callable yet." [signals.md]

### Signals usable inside a Play today (app + MCP find_people)
- **Hiring** — app fields "Company is hiring for" + "Job posted within"; MCP `currentCompanyHiringRolesAny`, `currentCompanyHiringPostedWithinDays`. [docs_signals.md]
- **Funding (investor-backed)** — app field "Backed by"; MCP `currentCompanyInvestorsAny`. [docs_signals.md]
- Other signals marketed as filters: "what people post about, the competitor posts they react to, the companies hiring for the role you sell to, and the ones that just raised" [index.md]; "live signals such as hiring, funding, tooling changes and LinkedIn engagement" [ai_service.json]; blog links to "/blog/hiring-and-funding-signals-for-outbound", "people engaging with your competitors' posts", "following the right profiles", "map your market from your competitors' customers". [blog_li-safe.md]
- Engagement-sourced signals: LinkedIn post reactors/commenters [play_lead-magnet.md]; "Follow a LinkedIn profile and reach its new post engagers... checks its latest posts and adds new reactors and commenters to your outreach sequence" [blog_people.md]; X post likers/repliers/new followers [play_x-automation.md]; inbound signups via webhook / HubSpot form [play_inbound-signups.md]; followed-account new post (account listening) [play_listening.md]; keyword mentions on LinkedIn/X/Reddit (keyword listening) [keyword-listening.md].
- Source menu on pricing page: "Likes, reposts, new followers", "Comments, reactions, connections", "Buyer-list companies", "Your own CSV". [pricing.md]

### Hiring signal: matching rules (Play)
- "Every word of one role phrase must be in the job title. Head of Growth matches "Head of Growth & Marketing" but not "Growth Marketing Manager"." [docs_signals.md]
- Recency window: app offers "7, 14, 30, 60 or 90 days (default 30). Over MCP any value from 1 to 365 works." [docs_signals.md]
- Country: "If every location in your Play is the United States, only US postings count. Otherwise postings from anywhere count." [docs_signals.md]
- Evidence: "Each company carries the job title, posting link and date that proved it (up to five per company)". [docs_signals.md]
- Refill: "companies it already worked are skipped". [docs_signals.md]
- Empty result: "If no company has a matching posting in the window, the run stops and says so instead of returning people who are not at hiring companies." [docs_signals.md]
- Role is about the company not the person ("put Founder, CEO in Who do you want to find? and Sales Development Representative in Company is hiring for"). [docs_signals.md]
- Works on "every cold Play: LinkedIn, email, X and multi-channel". [docs_signals.md]
- App template: "Open Plays, choose New Play, then Companies hiring. It starts with founders and marketing leaders at companies hiring for growth and sales roles." [docs_signals.md]

### Funding signal (Play)
- "Common short names are understood: YC becomes Y Combinator, a16z becomes Andreessen Horowitz. For anything else, use the investor's full name as it appears on the company's funding record." [docs_signals.md]
- Limits: "it cannot filter by round (Seed, Series A), by amount raised, or by how recently the company raised." [docs_signals.md]
- Signals stack with each other and all targeting fields; "Every added signal shrinks the pool." [docs_signals.md]

### Signals REST API (`POST /api/v1/signals/events`)
- Auth: `Authorization: Bearer $PUMPGTM_KEY` (workspace key from https://app.pumpgtm.com/install-mcp). "This is a read-only POST. It does not create a watch, refresh a provider, create leads, or contact anyone." [signals-api.md]
- Request fields: `name` (required; `hiring.job_observed`); `filters.roles` ("Up to 10 phrases. All words in any one phrase must occur in the job title, ignoring case and punctuation. No semantic or acronym expansion."); `filters.companyDomains` ("Up to 20 exact company domains"); `filters.minHeadcount`, `maxHeadcount` ("Inclusive bounds. Unknown company sizes are excluded when a bound is present."); `start` ("recent (default) reads observations from the previous 30 days. now returns an empty page and a cursor for future observations. Ignored when a cursor is supplied."); `cursor`; `limit` ("1–100 events; default 50"). "Request bodies are limited to 8 KB." [signals-api.md]
- Event shape: `eventId`, `name`, `timestamp`, `data.company{name, domain, headcount}`, `data.job{id, title, url, location}`, `data.source` ("shared_hiring_index"), `data.observedAt`, `data.providerIndexedAt`, `data.publishedAt` (null in preview), per-event `cursor`. Top-level: `events`, `cursor`, `hasMore`, `truncated`, `nextPollMs` (60000 in example), `billing.energyCharged`, `coverage{source, latestObservedAt, description}`. [signals-api.md]
- Coverage caveats: "Collection is demand-driven; no fixed refresh cadence or complete market coverage. A posting is not proof the role is still open. Reads never initiate paid collection." "Custom scheduled watches and paid on-demand collection are outside this release." [signals-api.md]
- Cursors: "signed, bound to the workspace and normalized filters, and expire seven days after issue... An expired cursor returns 410... the API only bootstraps the most recent 30 days." "One source/job pair has one immutable event ID"; "cross-provider deduplication is not guaranteed"; "An event represents the first observation. Re-fetches and job edits do not produce new versions". [signals-api.md]
- Errors: 400 invalid body/filter/cursor; 401/403 credentials; 410 cursor expired; 413 body > 8 KB; 503 index unavailable ("an error is not an empty result"). [signals-api.md]

### Signals MCP + experimental Events
- Remote server https://mcp.pumpgtm.com/mcp; custom bearer clients use https://app.pumpgtm.com/api/v1/mcp. Tools `list_signal_types`, `list_signal_events` (same args as REST). [signals-mcp.md]
- Implements MCP Triggers & Events extension (pinned design revision), advertises `experimental.events`, methods `events/list` and `events/poll`; delivery `["poll"]` only; "Streaming, webhook subscriptions, and automatic assistant wake-up are not part of this preview." [signals-mcp.md]
- `events/poll` params: `name`, `arguments` (filters), `cursor` (null = start now), `maxEvents` (1–100), optional `maxAgeMs` (1–2,592,000,000 ms); response `events, cursor, hasMore, truncated, nextPollMs`; errors `data.code` = `invalid_cursor` or `cursor_expired`. [signals-mcp.md]
- Python demo `/examples/hiring-events.py`: uses workspace key, "saves events, review tasks, and the cursor in one SQLite transaction", flags `--recent --once`, `--once`, `--replay`; "binds stored state to the endpoint, filters, and key fingerprint". [signals-mcp.md]
- Guidance: "Make one action per event"; commit event ID with local action before advancing cursor; use idempotency keys for CRMs. [signals-mcp.md]

### Keyword listening (app feature, not the API)
- "Find potential customers, catch complaints and spot praise across LinkedIn, X and Reddit." Labels posts "by intent and priority" (example labels: "Buying intent", "High priority"); "scheduled Slack report"; relevance rules "Look for" / "Skip" (example: "Founders choosing a form builder, collecting payments or replacing Typeform" / "Job listings, affiliate promotions and people selling their own form builder"). Entry: https://app.pumpgtm.com/signals/social-listening. Example feed named "buyer-conversations". [keyword-listening.md]

### Account listening (app feature)
- Follows chosen LinkedIn accounts "through your own LinkedIn, every half hour"; alerts "by email or webhook"; drafts a comment "in your voice"; "You post it, not us"; add by profile URL, "remove or pause any of them in one click"; "One feed holds every post, newest first." Entry: https://app.pumpgtm.com/signals. Stats quoted: LinkedIn search for "sales automation" in October 2026, "37 of the 50 posts had fewer than three reactions, 19 had none at all, and the median post had one like"; "RevOps" median 14 likes. [play_listening.md]

---

## 4. People data / search / enrichment

### Enrichment (`POST /api/v1/people/enrich`, MCP `enrich_person`)
- Inputs: `email` (string; "We match it to a LinkedIn profile first"); `linkedin` ("A public LinkedIn person URL, at most 1,500 characters. Company URLs are rejected."); `find` (optional array: `"x"`, `"work_email"`). "Send exactly one of email or linkedin. One person per request. The body must be valid JSON under 4 KB. Unknown fields are rejected." [people-api.md]
- Output: `id`; `person{name, title, headline, location, company{name, domain}, linkedin, x{handle, url, evidence}, workEmail{address, matchesCompanyDomain} | null, connections[]}`; `missing{field: reason}`; `energyUsed`. "person is null when nobody matches... Fields we could not fill are null; x and workEmail are null unless you asked for them in find and we found them." [people-api.md]
- `missing` reasons: `not_found` ("No confident match. It does not mean the person has no X account or email."), `energy_exhausted`, `unavailable`. [people-api.md]
- X matching rule: "return one only when its display name matches theirs and its own bio or profile link points at their LinkedIn profile, their company's domain, or their company's name. x.evidence says which. If two accounts pass, or none do, x is null". [people-api.md]
- Connections: "When we have previously observed public follow relationships for this person, person.connections lists up to 100 of them." Each: `from`, `to`, `type` ("follows"), `sourceUrl`, `observedAt`. "This call does not crawl a new social graph... Expired and suppressed observations are excluded, and customer-private lists, messages, and targeting decisions are never returned." [people-api.md]
- Errors: 400 `invalid_request`; 401 `unauthorized`; 402 `energy_exhausted`; 403 `energy_required` or tenant mismatch; 404 `person_unavailable` ("including suppressed identities"); 413 `request_too_large`; 503 `people_data_unavailable`. "This paid operation is not idempotent... Responses are private and are not cached by the API." [people-api.md]
- "This tool does not save a lead, create a sequence, send a message, or connect a social account." [people-mcp.md] "There is no new people-data screen to learn inside the app." [blog_people.md]
- Underlying: "The first release uses our existing profile lookup and email-provider waterfall." [blog_people.md]

### Curated datasets
- "11,517 YC founders... with the LinkedIn and X profiles they listed. Filter by batch, role, industry, and more." (/yc/founders); "478 a16z speedrun founders... from 240 a16z speedrun companies... Filter by cohort, role, industry, and location." (/a16z/founders); "520 Early-stage investors" (/yc/investors). "Dataset snapshots. Contact details and social coverage vary. Email enrichment is a separate lookup." [people.md] [blog_people.md]

### Audience search (`find_people`) and app filters
- Targeting fields seen: `currentTitleIncludesAny`, `personCountriesAny`, `currentCompanyHeadcount{maximum}`, `currentCompanyHiringRolesAny`, `currentCompanyHiringPostedWithinDays`, `currentCompanyInvestorsAny`, plus `name`, `candidateCount` (examples use 50). [docs_signals.md] The find-ICP skill shows a different shorthand: `targeting: { jobTitlesAny, companySizeRange, currentCompanyHiringRolesAny }` and `find_people with the playId and confirmed:true`. [skill_find-icp.md]
- App filters: "Filter by job title, company size, industry and location" [index.md]; "Sales Navigator search by job title, industry, and location. Or upload your own CSV and we work through it instead." [play_lead-magnet.md]; "Upload your leads or pull them from a Sales Navigator search. PumpGTM matches each person to their LinkedIn profile and their work email." [play_linkedin-email.md]; "You can paste a Sales Navigator or Apollo list, or let PumpGTM find people from its own lead sources." [skill_find-icp.md]
- Sources: "lead waterfall (Apollo, Exa, PeopleDataLab, ZoomInfo, Sales Navigator), checks the profiles are active, and lets you approve". [skill_find-icp.md] "2B+ contact data". [index.md]
- ICP learning: "Give it 10 to 50 of your current customers, or your website. It infers the job titles, company sizes and industries that convert." Example output line per person: "'Head of Growth at a 60-person SaaS, hiring 2 SDRs.'"; "returns 200 matching people this week". [skill_find-icp.md]
- Dedup behaviour: "people already in your leads are never added twice" [play_inbound-signups.md]; Play refill skips already-worked companies [docs_signals.md]; X: anyone with an existing thread skipped [play_x-automation.md]; signals: one event ID per source/job pair, cross-provider dedup not guaranteed [signals-api.md]; webhook "Retries with the same eventId are safe". [play_inbound-signups.md]
- Lead list API: `GET https://app.pumpgtm.com/api/v1/leads` "List the leads a Play produced, with stage and timestamps." [skill_find-icp.md]

---

## 5. LinkedIn channel

### Connecting
- "You connect LinkedIn through a secure login page and approve 2FA yourself"; "PumpGTM never sees or stores your LinkedIn or email password." [trust.md] "a secure login page run by our LinkedIn connection provider". [blog_li-safe.md] "Your LinkedIn credentials are never saved anywhere in our system." [play_lead-magnet.md]
- Video transcript (contradictory wording): "Giving your social media credentials to a third-party service feels a bit weird. But honestly, that's the only way to securely connect your LinkedIn account." [blog_li-safe.md]
- IP: "Each account gets one fixed IP co-located near where you are" [trust.md]; "its own IP in your country and keeps it" [blog_li-safe.md]; "residential proxies near your location" [index.md] [ai_faq.json]; "Residential IP · San Francisco"; "Every request goes through a residential proxy in your city, at randomized times through the day." [play_lead-magnet.md]; transcript: "It's not a regular residential IP. It's an undetectable IP close to your geographical location." [blog_li-safe.md]
- "Do I need to connect LinkedIn? Yes, but only when you are ready to run outreach. Setup happens inside your workspace." [index.md] [ai_faq.json]
- "simulate mouse movements and clicks" (transcript). [blog_li-safe.md]

### Actions
- Connection request: "Connection notes: None; requests go without a note". [blog_li-safe.md] Example step: "Day 0 Connection request No note. The job is to get accepted." [play_linkedin-email.md] (Contrast: ai_service.json says "personalized connection request".)
- Message after acceptance: "Day 1 LinkedIn note, after they accept". [play_linkedin-email.md] "PumpGTM follows up after they connect." [play_lead-magnet.md] "Once Alex accepts: 'What made you sign up?'" [play_inbound-signups.md]
- Profile views and lookups (capped). [blog_li-safe.md] "Between campaigns the account does small, normal things like viewing profiles, so it stays warm". [blog_li-safe.md]
- "Messages, likes and other actions" (capped, shared). [blog_li-safe.md] ai_service: "(profile view, post like, personalized connection request, follow-up)". [ai_service.json]
- Post engagers: "Add one public LinkedIn post URL... See the people who reacted or commented in one list." [play_lead-magnet.md] Follow a profile: "checks its latest posts and adds new reactors and commenters to your outreach sequence". [blog_people.md]
- Account listening checks followed accounts "through your own LinkedIn, every half hour"; comment drafted but user posts it. [play_listening.md]
- InMail: not mentioned anywhere. Following/liking on LinkedIn: only "likes" appear in the shared 100/day cap; no explicit "follow" action.

### Limits table ("as of November 10, 2026") [blog_li-safe.md]
| Limit | Value |
|---|---|
| New account warm-up | "5, 7, 10, 15, 16, then 20 connection requests a day over six days (73 in total)" |
| Connection requests after warm-up | "A daily cap you set from 1 to 30; new accounts default to 30" |
| Weekly invite cap | "None beyond the daily cap, so up to 7 times your daily setting" |
| Profile views and lookups | "At most 100 a day" |
| Messages, likes and other actions | "At most 100 a day, shared" |
| Hours | "8am to 6pm in the account's time zone" |
| Pacing | "5 to 30 second random waits between actions; roughly 1 in 4 of the six-minute runs acts, the rest are skipped at random" |
| LinkedIn declines an invite | "Invites stop for that account; one test invite after 24 hours, then 48, then 72" |
| Connection notes | "None; requests go without a note" |

- Same numbers on trust page: warm-up "5, 7, 10, 15, 16, then 20", waits "5 to 30 seconds", "8am and 6pm in your time zone", cap "1 to 30". [trust.md]
- Advice: "set the cap to 25 or lower" to stay under ~175/week (providers document 150–200/week). [blog_li-safe.md] [play_linkedin-email.md]
- "If you ask for more on day one, PumpGTM holds the rest for later." [blog_li-safe.md]
- Lead-magnet mock shows warm-up display "Cap 5 D1 7 D2 10 D3 15 D4 16 D5 20 D6 30 D7" and "Requests sent 30 / day"; timeline "30 sent 9:12 10:47 13:05 15:38 16:21 18:02". [play_lead-magnet.md]
- Transcript: "on the first day, your account will not do more than 5-10 actions". [blog_li-safe.md]
- Do not run two automation tools on one account; during a switch (e.g., from Dripify) "we limit the PumpGTM side". [blog_li-safe.md]
- After restriction: "Ask us to put the account back in warm-up mode (or set it through the API), which restarts the six-day ramp". [blog_li-safe.md]

### Stop-on-reply
- "A detected reply stops the remaining outreach for that person." [int_linkedin.md] "PumpGTM pauses follow-ups and brings the reply into your workflow for review." [int_linkedin.md] "A reply on either channel stops every remaining step for that person and hands the conversation to you." [play_linkedin-email.md]

---

## 6. Email channel

- Providers: "Gmail, Google Workspace, Microsoft 365, and compatible IMAP mailboxes" [int_email.md]; "Gmail, Google Workspace, Outlook, Microsoft 365, or any IMAP mailbox." [play_linkedin-email.md]
- Connection: "Sign in with Google or Microsoft, or paste an app password once. PumpGTM checks it can send and read replies before saving anything." "With Gmail you either sign in with Google or paste an app password Google generates for one app. Outlook and Microsoft 365 connect with Sign in with Microsoft, no password at all. Either way it is checked live, stored encrypted, and you can revoke it... Any other IMAP mailbox uses its own app password." [play_linkedin-email.md] "you connect email over OAuth". [trust.md] "PumpGTM checks the connection before saving it for sending." [int_email.md]
- Sending rules: "Every email is plain text from your address, replies come back to you, follow-ups stay in one thread, and each message carries a one-click unsubscribe. Daily mailbox limits control the sending pace." [play_linkedin-email.md] "Daily mailbox limits and sending windows control when messages go out." "Email messages include an unsubscribe option." [int_email.md]
- Mock UI: "Gmail · sending · 30 emails a day"; "Sending window Mon to Fri · 8:00 AM to 6:00 PM · America/Los_Angeles" [play_linkedin-email.md]; "3 mailboxes sending, Weekdays, 8am to 6pm, you@acme.com 38 / 40 today, hello@acme.com 27 / 40 today, team@acme.com 12 / 40 today"; "Connect one mailbox or ten. Each one keeps its own daily limit." [play_lead-magnet.md]
- Missing email: "PumpGTM skips the email steps for that lead. Their eligible LinkedIn steps can continue" [int_email.md]; "skipped for that person and marked in the activity log". [play_linkedin-email.md]
- Reply handling: "A detected reply on a connected sequence channel stops remaining outreach for that person." "Review replies and take over the conversations that need your attention." [int_email.md] "A reply ends that person's sequence and lands in your inbox for you to answer." [play_lead-magnet.md]
- Example email steps: "Day 3 Intro email Subject: Riverbend + your company. From your mailbox."; "Day 4 Follow-up, same thread Did you get a chance to review my note below?"; "Day 5 Follow-up, same thread Please give me your thoughts on this."; "Day 9 Last follow-up Should we pick this up early next month instead?" [play_linkedin-email.md]
- Signup plays: "An email from you, not from noreply@." [play_inbound-signups.md]
- Each LinkedIn seat "comes with an email inbox". [pricing.md] "Sending inboxes and domains are not included in the service fee." [pricing.md]
- Google Calendar (separate feature): read-only access to calendars/events to "send the call reminders you set up"; "email them the confirmation and reminder messages you approved"; tokens encrypted; "We never create, change or delete events." [privacy.md]

---

## 7. X channel

- Connection: "You click Connect X and X itself asks you to allow PumpGTM to read your posts, likes and followers and send DMs as you... You can revoke it from your X settings at any time." Mock: "@yourhandle connected, Sending as you · official X API, Authorized on X, revocable any time, Read posts, likes, followers. Send DMs. Nothing else." Entry: https://app.pumpgtm.com/x. [play_x-automation.md]
- Sources: "one post, every post you publish from now on, or your new followers" ("Paste a post URL or pick one from your recent posts"; "Attach the sequence once. Each new post you publish gets watched automatically"; "Send your welcome message to eligible new followers after checking for an existing conversation"). [play_x-automation.md] Integration page: "post likers, repliers, or new followers". [int_x.md]
- Sequence: "Sequences up to five DMs. First message the moment they engage, follow-ups one to thirty days apart. Personalize with their first name, full name or handle." Template token `{{firstName}}`. Example: Day 0, Day 3, Day 8. [play_x-automation.md]
- Pacing: "A few DMs every few minutes with a random gap, never more than 100 a day per workspace. If X pushes back, PumpGTM waits instead of forcing it." "A post that picks up 200 likes over two days gets worked over those two days." [play_x-automation.md]
- Eligibility checks: "Before any first DM, PumpGTM reads your existing thread with that person. Anyone you have ever spoken to is skipped. Empty bios and accounts under 20 followers are skipped. When X reports that someone has DMs closed, they are marked and left alone." Activity log examples: "Skipped · @priyabuilds · existing conversation", "Skipped · @ravi_ships · DMs closed". [play_x-automation.md] New followers "checked against your ICP". [play_lead-magnet.md]
- Not automated: "It does not post, like, reply, follow or unfollow on your behalf." "Automatic follow and unfollow actions are not part of the product, on purpose". [play_x-automation.md] "It does not offer automated following or liking." [int_x.md] (Contradictions: inbound-signups page describes "A follow from your X account" as a step [play_inbound-signups.md]; lead-magnet page says "Follows, likes, and DMs are paced so the account keeps looking like you." [play_lead-magnet.md])
- Stop on reply: "Every remaining step for that person stops immediately and you get a Slack notice to answer them in X. PumpGTM never writes replies for you on X." [play_x-automation.md] Mock: "62 people · 41 DMed · 9 replied"; "Priya replied on day 1... Steps 2 and 3 cancelled". [play_x-automation.md]
- Delivery caveat: "Delivery depends on the recipient's messaging settings, your account permissions, and X's limits." [int_x.md]
- Also via MCP: "hand it a post URL or your followers and a sequence, and it runs with the same checks." [play_x-automation.md]
- Related play "/plays/x-likers" (single-post version). [play_x-automation.md]

---

## 8. WhatsApp beta

- "WhatsApp is joining PumpGTM in beta. Request access" via mailto:support@pumpgtm.com?subject=WhatsApp beta access. "Availability is confirmed for your workspace." [int_whatsapp.md]
- "The beta is being built around connecting your existing WhatsApp account. Share your personal or Business app setup when requesting access." "Tell us whether you use WhatsApp or the WhatsApp Business app." [int_whatsapp.md]
- Intended use: "follow-up with people who have agreed to hear from you on WhatsApp, such as leads who request a conversation"; "not generally available for self-serve connection or sending"; "Access to a messaging integration does not remove WhatsApp's messaging rules or account limits." [int_whatsapp.md]
- "WhatsApp sequence support is not generally available. LinkedIn, X, and email can share sequences today." [int_whatsapp.md] [ai_faq.json]
- Request flow: email "with your website and how you plan to use WhatsApp"; team confirms "connection path and beta availability"; "Beta capabilities and limits will be explained before you start." [int_whatsapp.md]

---

## 9. Plays / sequence structure

### Play types / templates named
- "Companies hiring" (New Play template). [docs_signals.md]
- Cold Play: LinkedIn, email, X, multi-channel. [docs_signals.md]
- LinkedIn post engagers / "lead-magnet" (one public post URL). [play_lead-magnet.md] [int_linkedin.md]
- Follow a LinkedIn profile -> new post engagers. [blog_people.md]
- LinkedIn + email on one lead list. [play_linkedin-email.md]
- X automation: one post / every new post / new followers; "/plays/x-likers". [play_x-automation.md]
- "Webhook signups" and "HubSpot form signups" (app.pumpgtm.com/plays/new?story=webhook-signups). [play_inbound-signups.md]
- Account listening (app /signals) and keyword listening (/signals/social-listening). [play_listening.md] [keyword-listening.md]
- Physical GTM "send cakes to prospects" referenced in blog links ("upload a photo, preview it on a 3D cake, edit it with AI, and order delivery"). [blog_signals.md]
- Audience chips in mock: "Design partners, First customers, Investors, YC alumni, Senior engineers, Ops leaders at US logistics companies"; source tabs "Sales Navigator / Your CSV / We build it". [play_lead-magnet.md]

### Step types observed
- LinkedIn: connection request (no note); LinkedIn message/note after accept; profile view; post like (per ai_service.json). [play_linkedin-email.md] [blog_li-safe.md] [ai_service.json]
- Email: intro email with subject; follow-ups in same thread. [play_linkedin-email.md]
- X: DM; welcome DM; (a "follow" step appears on inbound-signups page only). [play_x-automation.md] [play_inbound-signups.md]
- Example multichannel timeline: "Day 0 · X DM"; "Day 3 · X DM no reply yet Follow-up DM"; "Day 4 · Reply... Everything below is cancelled"; "Day 5 · LinkedIn if still quiet Connect, then a message that mentions the post"; "Day 9 · Email if still quiet". [pricing.md]
- Timing is expressed in day offsets; X follow-ups "one to thirty days apart". [play_x-automation.md]
- Conditional steps: "after they accept"; "if still quiet"; "no reply yet". [play_linkedin-email.md] [pricing.md]

### Channels sharing a sequence
- "LinkedIn, email, and X steps can reach the same lead through one sequence." [int_linkedin.md] "LinkedIn, X, and email run as parallel lanes for the same buyer, so nobody gets the same pitch twice." [play_lead-magnet.md] "connected email, LinkedIn and X against a single unified prospect state, so a reply on one channel stops the others." [blog_scoring.md]
- "Include X alongside LinkedIn and email for prospects with the relevant contact details. Keep each channel's timing in your sequence." [int_x.md]

### Approval / review flow
- "You approve the people and the messages before a campaign sends, and from an AI client like Claude or Cursor you decide when each draft goes." [trust.md] "You approve the buyers and LinkedIn sequence before outreach starts." [index.md] [ai_faq.json]
- "PumpGTM scores every lead and messages nobody below your threshold." [trust.md]
- Review in app: "See the people who reacted or commented in one list. Review who belongs in your outreach... Approve the people and your message." [play_lead-magnet.md] "Choose your audience, review the messages, and set the timing before you activate the sequence." [int_linkedin.md]
- MCP flow: `find_people` with `confirmed:false` -> targeting summary -> `find_people` with `playId` + `confirmed:true` -> `review_people` "so I can approve good fits with a one-line reason each" -> "ask me whether to attach a sequence". [skill_find-icp.md]
- Signup plays: "The first signups wait for you to approve them. Once the messages read right, turn on auto-add". [play_inbound-signups.md]
- Draft placement: "PumpGTM drafts the first message for each prospect from the reason that person was selected, then puts the draft next to the prospect for you to approve. The six checks above are the review we expect you to do in that screen". [blog_review.md]
- "Held message step" / per-person input: not named in these pages. Nearest evidence is per-person approval of drafts and the "wait for approval" state for first signups. [blog_review.md] [play_inbound-signups.md]

### AI message writing rules
- Six review checks: (1) read from recipient's position; (2) read aloud, ban words "streamline, leverage, unlock, seamless, empower, 'I hope this finds you well'"; (3) evidence behind every claim, "Never let the model fill the gap with an invented percentage"; (4) remove empty openers ("I came across your profile", "Congrats on the funding round"), use the actual trigger; (5) one easy ask, "Do not ask a stranger for thirty minutes"; (6) separate writing quality from campaign results. [blog_review.md]
- Length: "Two to four sentences. If it does not fit on a phone screen without scrolling, cut it." [blog_review.md]
- Example "After" message: "Hi Sarah, you asked under the Lemlist launch post whether it can pull people who commented on a competitor's thread. That is most of what PumpGTM does. Is that a workflow your team runs by hand today?" [blog_review.md]
- Sample X DMs (lowercase, casual) and signup messages ("Hey Alex, saw you joined the waitlist, thank you. What made you sign up?"). [play_x-automation.md] [play_inbound-signups.md]
- Listening comments: "drafts a comment in your voice, grounded in what they actually said". [play_listening.md]
- ICP skill messaging chain: "Observed context -> plausible job relevance -> question that tests the inference -> appropriate next step." "Never imply that the team saw a private event". [skill_icp.md]

### Webhook (inbound signups)
- `POST https://app.pumpgtm.com/api/v1/plays/PLAY_ID/webhook`, Bearer workspace API key; body `eventId`, `expectedRevision`, `name`, `email`, `linkedinUrl`, `xUsername`, `dryRun`. "Send dryRun: true first. It checks the request and saves nothing. Retries with the same eventId are safe." "About ten lines." Also "connect a HubSpot form". [play_inbound-signups.md]

---

## 10. Reply handling

- "When someone answers, PumpGTM reads the conversation, sorts the reply and drafts your answer, with your booking link when they're ready to talk. Send it as it is, or change it first." [index.md]
- "Replies from LinkedIn, email and X land in one list, and Needs you shows who is waiting on you. Write back yourself, or ask the AI to draft it." [index.md] "X DMs, LinkedIn messages and email replies, one list. You answer the ones worth a meeting." [pricing.md]
- "Sorts replies, drafts responses, and hands qualified buyers to the founder to book the meeting." [ai_service.json]
- "Replies come back to you to answer." [trust.md] "PumpGTM pauses follow-ups and brings the reply into your workflow for review." [int_linkedin.md]
- X-specific: Slack notice; "PumpGTM never writes replies for you on X." [play_x-automation.md]
- Classification categories: no formal category list in these pages. Reply-reading heuristics from the blog: "'Not my team' means the targeting is off by one role"; "'We already use X' means the problem is real and the timing is wrong"; "'How is this different from Y' is a qualified conversation"; "A polite no is just a no." [blog_review.md]
- Scheduled replies / approval modes for replies: not described. Only "Send it as it is, or change it first". [index.md]
- Inbox mock items: "Prospect A · Company A 10:52 Yes, this is exactly the gap we have. Tuesday works."; "Prospect D... ha yes, we have this exact problem"; thread view header "Prospect C, ML Platform Lead, Company C, Liked your post on X". [pricing.md]
- Lead-scoring blog describes the ideal loop: "Positive replies trigger real-time notifications with context." [blog_scoring.md]

---

## 11. Lead scoring / ICP definition methodology

### Scoring model (blog)
- "fit x timing x intent x confidence": "Fit determines whether this company can buy. Timing determines whether an event makes the problem relevant now. Intent determines whether the account is actively evaluating the category. Confidence determines how much of that is verified data versus a guess." [blog_scoring.md]
- Example precise ICP: "Series A or B software company, 50 to 200 employees, engineering team growing, actively hiring platform engineers, using infrastructure your product integrates with, and a senior engineer engaged with your content in the last month." [blog_scoring.md]
- Routing: "High-signal accounts justify founder research, LinkedIn multi-touch, and tailored outbound. Lower-signal accounts enter automated email sequences." [blog_scoring.md]
- Timing events listed: "Funding rounds age. Executives switch companies. Hiring freezes hit. New budgets open. Products launch. Contracts expire. Someone visits your pricing page." [blog_scoring.md]
- GTM engineering loop: "Inbound triggers enrichment. Enrichment updates account scoring. Score determines routing. The owner receives unified account history: page visits, past messages, CRM records. Positive replies trigger real-time notifications with context. Closed revenue attributes back to the original discovery signal. Lost deals feed the targeting model for the next cycle." [blog_scoring.md]
- "Your first 50 sales conversations are data collection." [blog_scoring.md]
- Workers.io case: "Map the developer TAM... filtered accounts by actual stack compatibility"; "Run it through MCP, not a dashboard"; "Human-calibrated pacing"; "Multichannel in one prospect state". [blog_scoring.md]
- Linked but not included: "/blog/linkedin-lead-scoring-before-outreach" ("why scoring comes first"). [blog_li-safe.md] [blog_scoring.md]

### ICP skill (`pumpgtm-buyer-signals` SKILL.md)
- Intake table items: product job and outcome; delivery model; price basis; successful/lost/poor-fit accounts; current workaround and switching cost; sales cycle; geographic limits; research/outreach capacity. [skill_icp.md]
- Evidence map columns: "Evidence ID | Account or safe identifier | Observed or reported situation | Outcome | Date | Source | Limitation". [skill_icp.md]
- Segment fields: "Situation, Costly job, Present workaround, Fit requirement, Timing signal, Exclusion, Evidence, Uncertainty". [skill_icp.md]
- Buying situation analysis: "Starting situation, Friction, Consequence, Alternative, Desired progress, Switching condition". [skill_icp.md]
- Account statuses: "supported fit, possible fit, or insufficient evidence". "Use a numeric score only when its criteria and weighting have been agreed." [skill_icp.md]
- Rule classes: "Required fit", "Useful signal", "Timing indicator", "Exclusion", "Discovery question"; "Do not silently treat unknown as false or true." [skill_icp.md]
- Buying group roles: "likely user, internal advocate, commercial approver, and reviewer". [skill_icp.md]
- Outputs: "one-sentence buyer definition, the segment table, the stakeholder map, qualification and exclusion rules, and a short conversation angle for each priority segment... manual review batch sized to the user's capacity". [skill_icp.md]
- Feedback rules: "qualified conversations support the problem hypothesis; repeated mismatch narrows eligibility; silence alone does not distinguish poor targeting from weak messaging or delivery problems." [skill_icp.md]
- Companion files: references/buyer-workbook.md, guide.md, "All four skills (.zip)". [skill_icp.md]

### Find-ICP skill
- Learn from "10 to 50" customers or website; infers "job titles, seniority, company size, industry"; optional hiring signal for timing; `find_people` confirmed:false -> summary -> confirmed:true -> `review_people`. [skill_find-icp.md]
- "Fit is whether someone matches your customer profile. Timing is whether they have a reason to act now, like a fundraise or an open role. Adding a hiring signal targets both." [skill_find-icp.md]

---

## 12. Trust / safety / compliance

### Account protection claims
- "you send from your own accounts, we never see your passwords, and nothing goes out without your approval." [trust.md]
- "not from a farm of rented domains". [trust.md]
- LinkedIn: fixed IP, six-day warm-up, human pace, working hours, daily cap, auto-stop on LinkedIn decline (details in section 5). [trust.md] [blog_li-safe.md]
- "The MCP server signs in with OAuth as well, so there is no API key to paste or leak." [trust.md] (But docs also describe a copyable "workspace key" for custom clients. [signals-api.md] [people-mcp.md])
- X: official API, revocable; no follow/like automation. [play_x-automation.md]
- Email: OAuth or app password, stored encrypted, revocable. [play_linkedin-email.md]
- Warning/restriction playbook: pause all tools, lower cap, change password, resume slowly; restricted accounts re-enabled per LinkedIn notice; restart warm-up. [blog_li-safe.md]

### Data ownership / roles
- "The leads you find and the conversations they generate belong to you, and you can export them. Workspaces have roles so you control who on your team can see and send what." [trust.md]

### Privacy policy (Last Updated November 12, 2026) [privacy.md]
- Operator: Giga Next Inc. operating as PumpGTM; "not affiliated with... any AI model provider".
- Visitor identification pixel: "For US visitors this pixel is on by default; elsewhere it runs only if you select OK in Privacy choices"; may send "network address and browser details to a data partner to obtain a possible business profile, such as a name, employer, role or LinkedIn profile"; "A match does not automatically enroll someone in outreach"; Global Privacy Control respected; "Privacy choices" button.
- Data collected: account info (email, name, organization), usage data, technical data (device, IP, OS, browser), billing (no full card numbers).
- Google user data: read-only Calendar for call reminders; tokens encrypted; Limited Use compliance.
- Third-party AI providers: "prompts and responses may be transmitted to third-party AI providers based on your workspace configuration."
- Security: "TLS 1.2 or higher"; "API keys... encrypted at rest using AES-256"; "SOC 2-compliant cloud providers".
- Retention/deletion: on account deletion "stored API keys are permanently deleted"; "account data is removed within 30 days"; aggregated usage data may be retained.
- Rights: access, correction, deletion, restriction, portability, withdraw consent; contact support@pumpgtm.com.
- Not stated: anything about the sources of prospect/people data, retention of prospect data, or opt-out for prospects (people being contacted). Only the email "unsubscribe option" on sends [int_email.md] and "suppressed identities" / "suppressed observations" in people API [people-api.md] hint at a suppression mechanism.

### Terms of service (Last Updated November 7, 2026) [terms.md]
- Describes the Service as "our AI assistant product designed for builders" and includes a "Your Code and Data" section ("We do not store your code or use it for training our models... Your code remains on your local machine") - boilerplate that appears unrelated to outreach.
- Acceptable use bans sending "spam" or "junk mail" and impersonation.
- Guarantee and refund terms (section 1).
- Governing law: United States; 30 days' notice for material changes; "AS IS".

### Marketing-page claims on data sources
- "2B+ contact data" [index.md]; lead waterfall "Apollo, Exa, PeopleDataLab, ZoomInfo, Sales Navigator" [skill_find-icp.md]; "shared hiring index", "Collection follows existing search demand" [signals-api.md]; "social connection data from permitted public observations" [blog_people.md]; "No scraping, no passwords" for listening [play_listening.md].

---

## 13. UI descriptions of the app (screens, pages, elements)

App URLs named:
- `https://app.pumpgtm.com/onboarding` ("Build your outreach", "Start 7-day free trial"). [int_linkedin.md] [pricing.md] [ai_summary.json]
- `https://app.pumpgtm.com/plays/new` ("Create this play"). [play_lead-magnet.md] [play_linkedin-email.md]
- `https://app.pumpgtm.com/plays/new?story=webhook-signups` ("Create a signups play"). [play_inbound-signups.md]
- `https://app.pumpgtm.com/signals` ("Follow your first accounts" - account listening). [play_listening.md]
- `https://app.pumpgtm.com/signals/social-listening` ("Start listening" - keyword listening). [keyword-listening.md]
- `https://app.pumpgtm.com/x` ("Connect your X account"). [play_x-automation.md]
- `https://app.pumpgtm.com/install-mcp` ("MCP settings"; "your workspace's MCP page"; copy workspace key / custom bearer config). [signals-api.md] [people-mcp.md] [people-api.md]
- `https://app.pumpgtm.com/billing#energy` (Energy balance). [people-api.md] [people-mcp.md]
- `https://app.pumpgtm.com` (root; "Start at PumpGTM"). [skill_find-icp.md]
- "finish-setup link" returned by `get_workspace` when LinkedIn or billing unset. [skill_find-icp.md]

Screens / navigation items / fields:
- **Plays** page; **New Play** action; template **Companies hiring**. [docs_signals.md]
- Play fields: **Who do you want to find?**; **Company is hiring for**; **Job posted within** (7/14/30/60/90 days, default 30); **Backed by**. [docs_signals.md]
- **Targeting summary** (returned before confirmation). [docs_signals.md] [skill_find-icp.md]
- Play type picker options: "Webhook signups", "HubSpot form signups"; play naming e.g. "Waitlist", "Abandoned checkout"; **auto-add** toggle. [play_inbound-signups.md]
- Post-engagers play: paste "one public LinkedIn post URL", write "the exact follow-up message once"; engager list "in one list"; approve people and message. [play_lead-magnet.md]
- Review screen: draft "next to the prospect for you to approve". [blog_review.md] `review_people` with one-line reason per person. [skill_find-icp.md]
- Audience chips: "Design partners / First customers / Investors / YC alumni / Senior engineers / Ops leaders at US logistics companies"; lead status "Queued"; source tabs "Sales Navigator / Your CSV / We build it". [play_lead-magnet.md]
- LinkedIn account panel: "LinkedIn connected · Sending as you · Residential IP · San Francisco"; "Today 30 sent" with timestamps; warm-up cap chart "Cap 5 D1 ... 30 D7"; "Requests sent 30 / day"; "6-day warm-up". [play_lead-magnet.md] "LinkedIn connected, Sending as you · 30 requests a day". [play_linkedin-email.md]
- Email panel: mailbox rows with "38 / 40 today"; "3 mailboxes sending, Weekdays, 8am to 6pm"; "Gmail · sending · 30 emails a day"; **Sending window** "Mon to Fri · 8:00 AM to 6:00 PM · America/Los_Angeles"; "Replies on either channel pause that person." [play_lead-magnet.md] [play_linkedin-email.md]
- X panel: "@yourhandle connected, Sending as you · official X API"; **Activity** list ("DM sent · @mayareyes · liked your post", "DM sent · @tomships · new follower", "Skipped · ..."); sequence header "X DM sequence · every new post · new followers 62 people · 41 DMed · 9 replied"; "Your latest post... 48 likes · 12 reposts · 9 new followers"; per-person "DM queued". [play_x-automation.md] [play_lead-magnet.md]
- Sequence timeline view: Day-offset steps with status "Sent" / "Scheduled"; "Follow-ups stopped". [play_linkedin-email.md]
- **Inbox**: one list of X DMs, LinkedIn messages, email replies; **Needs you** filter; thread pane with prospect header and per-day event list; "Everything below is cancelled. Their thread is in your inbox." [index.md] [pricing.md]
- **Activity log** (skipped email steps, skipped X users). [play_linkedin-email.md] [play_x-automation.md]
- **Listening** (account): "Watching 12 accounts" avatars list; "New post, 2 minutes ago"; "Comment drafted in your voice"; buttons **Edit and post**; add by profile URL; **remove / pause** one click; feed "newest first"; alerts via email or **webhook**. [play_listening.md]
- **Keyword listening**: feed named "buyer-conversations"; labels "Buying intent", "High priority"; tabs "LinkedIn / X / Reddit / Slack reports"; "Scheduled Slack report"; relevance rules **Look for** / **Skip**. [keyword-listening.md]
- Slack notification on X reply. [play_x-automation.md]
- Booking link inserted into AI reply drafts. [index.md]
- Export of leads/conversations; workspace **roles**. [trust.md]
- Google Calendar connect/disconnect, choose calendars to watch; stored call details visible in PumpGTM. [privacy.md]
- Billing: choose plan and billing period; add card; Energy balance; "refill or team-allocation guidance". [pricing.md] [people-api.md]
- Website-only (not app): "Privacy choices" button [privacy.md]; interactive examples on /signals and /people ("switch between an API and MCP call... inspect the same response as JSON") [blog_people.md] [people.md]; Supermemory sequence case study link "/blog/supermemory-25-percent-outbound-reply-rate" [play_linkedin-email.md].
- MCP-driven UI equivalent: "find my sequence about engineering leaders and show me its messages, change the follow-up, and show me the result before activating." [blog_scoring.md]

---

## 14. Unknowns (referenced but not explained)

- Exact meaning of "Reach up to 1,000 people a month" - whether it counts leads found, messages sent, or people entered into sequences; how it interacts with the 30/day LinkedIn cap and 100/day X cap. [pricing.md]
- "New buyers found for you every month" - mechanism and volume of Play "refill". [pricing.md] [docs_signals.md]
- Billing unit conflict: "per LinkedIn account" [pricing.md] vs "Monthly subscription per workspace" [ai_service.json]; annual billing option implied by "choose your plan and billing period" but not priced. [pricing.md]
- How Energy is included in plans ("available plan Energy") - no amounts given; "team-allocation guidance" for Energy not described. [people.md] [people-api.md]
- The "rate book" of provider costs. [people-api.md]
- Lead scoring in-product: the "threshold" and score scale are never shown; "scores every lead" with no rubric. [trust.md] Linked post "/blog/linkedin-lead-scoring-before-outreach" not in evidence.
- Reply classification categories, scheduled/auto replies, and reply approval modes - only "sorts the reply and drafts your answer". [index.md]
- "Held message step" / per-person inputs - not found by that name.
- Full MCP tool list and REST API reference ("/docs/mcp", "/docs/api", "/docs/quickstart") not in evidence; only tool names seen: get_workspace, find_people, review_people, get_lead_profile, enrich_person, list_signal_types, list_signal_events. [skill_find-icp.md] [people-mcp.md] [signals-mcp.md]
- Lead "stage" values from GET /api/v1/leads. [skill_find-icp.md]
- `expectedRevision` semantics in the webhook body. [play_inbound-signups.md]
- "finish-setup link" contents. [skill_find-icp.md]
- Which "LinkedIn connection provider" runs the login page; what "warm-up mode... set it through the API" endpoint is. [blog_li-safe.md]
- Whether LinkedIn "likes"/"profile view" steps are user-configurable sequence steps or only background warm activity. [blog_li-safe.md] [ai_service.json]
- Whether the X "follow" step on the inbound-signups page exists, given the X play page says no follows. [play_inbound-signups.md] [play_x-automation.md]
- Per-mailbox daily limit defaults (mock shows 40 and 30). [play_lead-magnet.md] [play_linkedin-email.md]
- Email reply detection method (IMAP polling vs API), bounce handling, deliverability/warm-up for email - not described.
- Webhook alert payloads for account listening; who can receive "Slack reports" and how Slack is connected. [play_listening.md] [keyword-listening.md]
- Keyword listening's intent/priority taxonomy beyond the two example labels. [keyword-listening.md]
- Physical GTM ("cakes") feature details. [blog_signals.md]
- HubSpot form integration mechanics. [play_inbound-signups.md]
- "Buyer-list companies" source. [pricing.md]
- "tooling changes" signal. [ai_service.json]
- Data source legal basis for people data and prospect opt-out/suppression process; "suppressed identities" mechanism. [people-api.md] [privacy.md]
- Workspace roles list and permissions. [trust.md]
- Export formats. [trust.md]
- The "/terms-of-service#multiplier-guarantee" anchor vs the terms heading "Qualified Meeting Guarantee" (and "the agent" wording in terms). [pricing.md] [terms.md]
- Benchmark methodology page "/research/ai-agent-sales-research-benchmark". [index.md]
- MCP client pages for Grok, Gemini, Muse, OpenAI Dots, Antigravity. [index.md] [pricing.md]
- a16z speedrun dataset page not in evidence beyond counts. [people.md]
