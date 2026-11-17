# AREVEI GTM — Feature inventory (reverse-engineered from PumpGTM public surfaces)

Status: working document, 2026-11-17. Companion documents: `user-flows.md`, `ui-analysis.md`.

## How to read this document

AREVEI GTM is an independent B2B go-to-market product. This inventory records what the reference product (PumpGTM) exposes publicly so that we can build a **functional equivalent**, not a copy. Every row carries one of three labels:

| Label | Meaning |
|---|---|
| **OBSERVED** | Directly present in the evidence: marketing/docs page text, OpenAPI/MCP catalogues, UI strings extracted from the public app bundle, screenshots, or the unauthenticated sign-in page. |
| **INFERRED** | A reasonable inference from evidence; the citation says from what. Not verified against a logged-in screen. |
| **ASSUMPTION** | A design choice for AREVEI with no direct evidence about the reference product. |

Scope of the investigation: the public marketing site, public developer docs, the public OpenAPI and MCP catalogues, and the **unauthenticated** sign-in page at `app.pumpgtm.com/onboarding`. No authenticated screens were accessed. Everything about the logged-in dashboard is therefore OBSERVED only through bundle strings and docs, or INFERRED. Citations are paths relative to `docs/reverse-engineering/evidence/`.

Abbreviations used in citations:

- `NOTES` = `notes/pumpgtm-evidence-notes.md` (section numbers refer to its headings)
- `API-NOTES` = `notes/pumpgtm-api-model-notes.md` (section numbers refer to its headings)
- `STRINGS` = `rea/app-bundle-ui-strings.txt`
- `ROUTES` = `rea/app-bundle-static-routes.json`
- `ENDPOINTS` = `rea/app-bundle-fetch-endpoints.json`
- `HEADERS` = `rea/app-response-headers.txt`
- `A11Y-APP` = `rea/app-onboarding-page-inspection.json`
- `A11Y-HOME` = `rea/marketing-home-page-inspection.json`
- `OPENAPI` = `public-docs/pumpgtm-openapi-condensed.md`
- `MCP-DOCS` = `public-docs/pumpgtm-docs-mcp.md`
- `QUICKSTART` = `public-docs/pumpgtm-docs-quickstart.md`

AREVEI decision vocabulary: **Build P1** (MVP), **Build P2**, **Build P3**, **Adapt** (functional equivalent with a deliberate change), **Skip**.

Global AREVEI constraints (apply to every row):

1. No PumpGTM branding, copy, or asset reuse. All UI copy is original.
2. All third-party provider keys (people data, email OAuth apps, X API, LinkedIn connection provider) are AREVEI's own.
3. **No stealth LinkedIn automation.** No residential proxies, no session-cookie capture, no simulated mouse movement. LinkedIn steps run only through an authorized hosted-auth provider (Unipile-style API) or are marked **manual** (the user performs the action and confirms it).

---

## 1. Workspace, auth and onboarding

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Sign in with password or emailed one-time code | OBSERVED: `A11Y-APP` (heading "Sign in to PumpGTM", textboxes "Work email", "Password", buttons "Sign in", "Email me a sign-in code", "Forgot password?", "Create account"); `screenshots/app_pumpgtm_com_onboarding.png`; `ENDPOINTS` (`/api/auth/sign-in-code`) | Enters work email + password, or requests a code | email, password or 6-digit code → session | "Too many attempts. Wait 15 minutes before trying again." [`STRINGS`]; "If this email is linked to an account, a sign-in code is on its way to" (no account enumeration) [`STRINGS`] | **Build P1.** Same two methods. Add passkeys later (`STRINGS` contains WebAuthn error text, but it may be library boilerplate — INFERRED, low confidence). |
| Email confirmation | OBSERVED: `STRINGS` ("Confirm your email before creating the workspace.", "Open the confirmation link we emailed you when you created your account, or sign in with a code below. The code confirms your email too.", "Resend confirmation link"); `ROUTES` (`/onboarding/verify-email`) | Clicks emailed link, or signs in with a code which doubles as confirmation | token or code → verified email | Workspace creation blocked until confirmed | **Build P1.** Code-as-confirmation shortcut is a good pattern; keep it. |
| Password reset | OBSERVED: `STRINGS` ("Reset your password", "Email me a reset code", "Password reset code", "New password", "Confirm new password", "Reset password and sign in") | Requests a code, sets a new password | email → code → new password | "If the address is registered, a new code is on its way." | **Build P1.** |
| Auth backend | INFERRED from `HEADERS` (CSP `connect-src https://*.supabase.co wss://*.supabase.co`) and `STRINGS` ("Auth session or user missing", "JWT has expired", "Edge Function returned a non-2xx status code") | — | — | — | **Adapt.** AREVEI uses its own auth (Supabase Auth or equivalent is acceptable; no evidence constrains us). |
| Workspace creation, one per company | OBSERVED: `STRINGS` ("A workspace for this company already exists. Ask its owner to invite you instead of creating a new one.", "Your workspace could not be created. Try again shortly.", "Preparing your workspace") | Creates a workspace from company website/name | company → workspace | Duplicate company domain blocked | **Build P1.** Same rule, keyed by verified company domain. |
| Workspace roles | OBSERVED: `API-NOTES` §1.1 (`role` enum `owner`, `admin`, `member`); `STRINGS` ("Only workspace owners and admins can connect X.", "Ask a workspace admin to connect an email account.") | Owner invites teammates | emails → invitations | Roles gate channel connection | **Build P1** with `owner / admin / member`. |
| Team invitations | OBSERVED: `STRINGS` ("Invite your team", "Teammate emails", "Emails, separated by commas", "Teammates get their own workspace on your team. You see everyone's results in one place.", invitation error family: expired / already used / revoked / invalid); `ROUTES` (`/team`) | Pastes emails; teammates accept via link | emails → invites → member workspaces | Team = many workspaces; invites expire and can be revoked | **Adapt.** P1: invite members into **one** shared workspace. P3: multi-workspace "team" roll-up (reference model: `scope=team` analytics, `API-NOTES` §1.2). |
| Session/attribution cookies | OBSERVED: `HEADERS` (`giga_eve_session_hint_v1`, `giga_attribution`, `giga_attribution_history` with first-touch UTM) | — | — | 90-day attribution cookie | **Adapt.** First-touch attribution stored server-side at signup; no third-party pixel. |
| Visitor identification pixel on marketing site | OBSERVED: `NOTES` §12 (privacy policy: US visitors on by default, "Privacy choices" button) | — | — | — | **Skip.** |
| Guided onboarding wizard | OBSERVED: `STRINGS` ("Onboarding progress", "Continue your workspace setup", "Finish later", "I'll do this later", "Skip for now", "Optional · finish setup from your dashboard."); `ENDPOINTS` (`/api/onboarding/*`) | Walks through company → audience → leads → sequence → accounts → trial | see `user-flows.md` flow 2 | Resumable; "Your setup is saved" | **Build P1.** See flow 2 for the AREVEI variant. |
| Onboarding via AI client hand-off | OBSERVED: `STRINGS` ("Set up with AI", "Choose your AI tool", "Setup is done. Go back to your chat and tell your AI to continue. It picks up right where you left off.", "Signup changed your existing PumpGTM connection from preview mode to your private PumpGTM workspace."); `ROUTES` (`/api/onboarding/gigacatalyst/claim`, `/api/onboarding/context/claim`) | Starts in an MCP client, finishes billing/account connection in the browser, returns to chat | — | — | **Build P2** (after the MCP server exists). |
| Founder video / testimonials in onboarding | OBSERVED: `ROUTES` (`/onboarding/pumpgtm-intro.mp4`, `/onboarding/trial/start-trial-v2.mp4`); `STRINGS` ("A two-minute hello from our founder", "Watch your trial walkthrough") | Watches optional video | — | — | **Skip** (brand-specific). |

---

## 2. Company profile and setup answers

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Website → AI company profile | OBSERVED: `STRINGS` ("Company name or website", "We use your site to find your buyers.", "Working out who buys from you", "What you sell", "Who do you sell to?", "Why they'd buy, in a line", "Confirm company", "Confirm your company details before starting discovery.", "will read the new website and redo your audience."); `ENDPOINTS` (`/api/onboarding/company-profile`, `/api/company-profile`, `/api/onboarding/company`) | Enters website; reviews generated offer/buyers; confirms | website URL → `{name, website, offer, buyers, audiences, proof}` (`API-NOTES` §1.26) | "Enter a valid company website."; "Generated targeting and copy are proposals, not verified facts." | **Build P1.** Our own crawler + LLM summariser; user must confirm before discovery. |
| Setup answers (GTM profile) | OBSERVED: `API-NOTES` §1.26 (`answers`: proof, best customer, warm sources, audiences, signals, channels; stored profile: proof, warm sources, ideas, channels, exclusions, goal, team); `STRINGS` ("Describe the smallest useful trial, setup required, time to value and what would count as a win.", "Describe the team, workflow or situation where you win. Where is another tool a better fit?", "When is your product the better choice?", "Why switch if they have already paid?", "Customer results and testimonials", "Choose a customer testimonial", "Add the experience PumpGTM may mention, in your own words.") | Answers short prompts used to ground message writing | free text per prompt → profile fields | Owner/admin only (`API-NOTES` §9) | **Build P1** with a reduced set: offer, best customer, proof, exclusions, goal. Rest in P2. |
| Setup review (AI reviewer) | OBSERVED: `API-NOTES` §9 (`preview_workspace_setup` → `reviewed`, `reviewerChanges`, `reviewToken`; `save_workspace_setup` requires token; `setupRevision`); `ENDPOINTS` (`/api/onboarding/setup-review`); `STRINGS` ("Review updated setup", "Your website or audience changed. Review your updated setup to prepare a new campaign. Your previous draft is saved.", "Your setup changed in another tab. Review the latest version.") | Sees what the reviewer changed and why; saves | profile → reviewed profile + revision | Optimistic concurrency on `setupRevision` | **Adapt.** P1: simple revision counter and "changed in another tab" guard. P2: reviewer pass that normalises audiences. |
| Target audiences (chips) | OBSERVED: `STRINGS` ("Target audiences", "Pick at least one audience, or type your own.", "Selected audiences", "Audience choices saved", "What shapes your audience suggestions", examples "Engineering managers at B2B SaaS companies", "Founders of 10 to 50 person agencies in the US", "VPs of engineering at Series A to C fintech startups") | Picks suggested audiences or types one | audience sentences → targeting seeds | At least one required | **Build P1.** |

---

## 3. ICP and targeting (`hardFilters` schema)

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Targeting object | OBSERVED: `API-NOTES` §4.1 (`schemaVersion 1`, `name` 1–120, `candidateCount` 5–100, `semanticQuery` ≤2000, `defaultSequenceId`, `hardFilters`) | Fills a form or lets AI propose | targeting JSON → saved Play | `candidateCount` 5–100 per run | **Build P1** with the same shape (our own schema, same semantics). |
| `currentTitleIncludesAny` (required) | OBSERVED: `API-NOTES` §4.1 (string[1..40], 1–120 chars) | Lists title phrases | — | Required | **Build P1.** |
| Functions / seniorities (include + exclude) | OBSERVED: `API-NOTES` §4.1 (12 function enum values; 10 seniority enum values; "put finer wording such as Head of or SVP in semanticQuery") | Picks from enums | — | ≤40 each | **Build P1.** Enum lists depend on our data provider; map to provider taxonomy. |
| `personCountriesAny` | OBSERVED: `API-NOTES` §4.1 | Picks countries | — | ≤40 | **Build P1.** |
| Company filters: names, domains, LinkedIn URLs, industries, types, headcount min/max, exclusions | OBSERVED: `API-NOTES` §4.1 (`currentCompanyNamesAny`, `currentCompanyDomainsAny`, `currentCompanyLinkedInUrlsAny`, `currentCompanyIndustriesAny`, `currentCompanyTypesAny`, `currentCompanyHeadcount{min,max}` 1–10,000,000, `excludedCurrentCompanyNamesAny`, `excludedCurrentCompanyTypesAny`); `STRINGS` ("Some industries can't be searched. Edit to review.", "Most employees", "Fewest employees") | — | — | Name resolution never blocks; "a domain pins one company exactly" | **Build P1.** Domain-pinning rule kept. |
| Hiring signal filters | OBSERVED: `API-NOTES` §4.1 (`currentCompanyHiringRolesAny`, `currentCompanyHiringPostedWithinDays` 1–365, default 30); `NOTES` §3 (app fields "Company is hiring for", "Job posted within" 7/14/30/60/90; every word of a role phrase must be in the job title; US-only rule) | Adds roles and a window | — | Role phrase is about the company, not the person | **Build P2** (needs a jobs index). |
| Funding filters | OBSERVED: `API-NOTES` §4.1 (`currentCompanyInvestorsAny`; MCP-only `currentCompanyRaisedWithinDays`, `currentCompanyRoundTypesAny`, `currentCompanyMinRaisedUsd`, "re-runs once a day"); `STRINGS` ("Backed by Y Combinator", "Companies that just raised", "Nobody in this audience works at a company that raised money in the last 90 days.") | Adds investors / recency | — | Investor short names expanded ("YC" → "Y Combinator") | **Build P2** (needs a funding data source). |
| Search method | OBSERVED: `API-NOTES` §4.1 (`searchMethod` `auto | connected_account | professional_database`) | — | — | — | **Adapt.** P1: `professional_database` only (our provider). `connected_account` only via authorized provider search in P2. |
| Size check before run | OBSERVED: `API-NOTES` §4.2 (`check_campaign`: counts matching profiles, no Energy, ≤3 counted checks/day, `audience.say`, up to 3 sample people); `STRINGS` ("Audience size not checked yet.", "Finds about", "Sample matches", "No sample people found for this audience yet.", "Shorten this audience to load sample people.") | Clicks "check size" | targeting → estimated count + sample | 3 per day | **Build P1.** Rate limit configurable. |
| Exclusion list (do-not-contact companies) | OBSERVED: `API-NOTES` §10.7 (`remove_leads target=companies`; "Plays stop finding people there"); `STRINGS` ("Removal pending…") | Removes a company | companies[1..100] → excluded | 1–240 chars each | **Build P1.** Also honour per-person opt-out (§9). |

---

## 4. Lead discovery

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| People search Play ("find people") | OBSERVED: `API-NOTES` §1.6, §4.2 (`POST /people/searches` with `run:false` → plan + `targetingSummary`; `run:true` → batch + candidates; MCP `find_people` background op polled by `get_people_search`); `QUICKSTART` §4; `STRINGS` ("Start finding people", "Finding people who match…", "Looking for people who fit…", "Matching titles, company size and location", "Keeping people whose current role fits", "Checking each person") | Confirms targeting summary, runs, waits | targeting → candidates (≤100) | 2 Energy per person found; "a company where nobody matches costs nothing" (`API-NOTES` §4.2) | **Build P1.** Two-phase (preview → run) with a background job and progress states. |
| Review batch | OBSERVED: `API-NOTES` §1.13, §2.4 (status `draft → sample_ready → approved → imported | rejected`; candidate fields incl. `matchReason`, `evidence`, `linkedinVerified`, `recentActivityAt`, `decision`); `STRINGS` ("Review leads", "Leads approved", "Getting your first leads ready to review") | Reads each candidate with reason, marks good fit / not a fit | decisions[1..100] (+ `feedbackReason` 1–120, `feedbackNote` ≤1000) → enrolled leads | `finish:true` needs every candidate decided | **Build P1.** Keep match reason + evidence per row; feedback feeds targeting (P2). |
| Lookalike (companies like your best customer) | OBSERVED: `API-NOTES` §4.1 (`play.type lookalike_accounts`, `inputs.seedCompany`); `STRINGS` ("Companies like your best customer", "We find companies like this one, then the right people at each.", "We research your example and find people for you to review.") | Names a seed company | seed → similar companies → people | Reviewer removes the customer's own company | **Build P2.** |
| Named account list / target accounts | OBSERVED: `API-NOTES` §4.1 (`accounts` ≤5,000 companies + titles; `play.type target_accounts`, `role_at_company`) | Pastes company list + titles | — | ≤5,000 | **Build P1** (small cap, e.g. 500) → P2 full. |
| Competitor research / account universe | OBSERVED: `API-NOTES` §1.28 (`research_competitor { websiteUrl, competitorName, roles[], maxCaseStudies 1–80, maxPeopleTotal 1–500 }`, `reach_universe`, `add_to_sequence`); `STRINGS` ("Your competitors' customers", "Companies already paying for something like yours.") | Names a competitor | competitor → case-study companies → people | Feature-gated on the reference | **Build P3.** |
| Competitor engagers (LinkedIn) | OBSERVED: `API-NOTES` §4.1 (`play.type competitor_engagers`); `STRINGS` ("Your competitors' engagers", "People who like and comment on competitors' or creators' posts.", "This needs the LinkedIn pages of competitors to watch.") | Adds competitor pages | pages → engagers | Needs a LinkedIn sender | **Adapt P2.** Only via authorized provider APIs that expose post reactions; otherwise manual CSV of engagers. |
| Post engagers (own LinkedIn post / profile watch) | OBSERVED: `API-NOTES` §5.2 (post URL → up to 500 reactors/commenters; profile watch every six hours, 10 posts, ≤500 per collection); `NOTES` §9; `screenshots/pumpgtm_com_plays_lead-magnet.png` | Pastes a post URL | post URL → people list | — | **Adapt P2.** Same constraint as above. |
| Lists: CSV / Excel / PDF / pasted text | OBSERVED: `STRINGS` ("Drop CSV, Excel, or PDF here", "or paste CSV text", "Parse pasted text", "Upload a list, even emails only.", "Extra columns", "Each column fills a token you can write in any message…", "Imports skip people already in your workspace. You can find them in Leads.", "This file is too large to import at once."); `ENDPOINTS` (`/api/campaign/parse-pdf`, `/api/campaign/leads`); `API-NOTES` §10.1 (CSV ≤500 rows, ≤100 columns, ≤200,000 chars) | Uploads or pastes | file → contacts + custom columns → tokens | ≤500 rows per import; dedup on LinkedIn URL / email / X handle | **Build P1** (CSV + paste). Excel P1, PDF P2. |
| Email-only rows → LinkedIn match | OBSERVED: `STRINGS` ("Find LinkedIn profiles from email", "Emails with no match are free, and anyone without a confident match is skipped. Turned off, people with only an email are added only when this sequence has an email step.") | Toggles matching | emails → profiles | Metered | **Build P2.** |
| Sales Navigator / Recruiter import | OBSERVED: `API-NOTES` §1.34 (`importStatus` `processing → waiting → finalizing → completed | failed`, `listUrl` ≤500); `STRINGS` ("Using Sales Navigator?", "Export from the Sales Navigator tab where you are signed in so that session is included.", "Add this only for an existing Sales Navigator or Recruiter session.") | Pastes a search URL | URL → async import | Requires a connected LinkedIn session | **Adapt.** Only if the authorized provider supports Sales Navigator search; otherwise CSV export is the path. |
| Network leads (own connections, friends of friends) | OBSERVED: `STRINGS` ("Your LinkedIn connections", "Friends of friends", "Finding people you already know", "Message people you already know", "We message connections who match your target audiences.", "We reach people your connections know."); `ENDPOINTS` (`/api/onboarding/network-leads`); `API-NOTES` §4.1 (`play.type new_connections`) | Picks this source in onboarding | connected account → matching connections | — | **Adapt P2.** Via authorized provider's connection list; never by scraping. |
| Webhook / form signups Play | OBSERVED: `API-NOTES` §1.6, §2.15 (`POST /plays/{id}/webhook { eventId, expectedRevision, name, email, linkedinUrl, xUsername, dryRun }` → `validated | review | queued | reused`); `STRINGS` ("Follow up with signups", "Send each signup to one URL.", "HubSpot forms", "Your app or Zapier", "Upload past signups", "Automatically add new matches", "Turn off to review each person before they join a campaign.") | Points a form at the Play URL; optionally auto-add | signup → candidate or lead | body ≤8 KB; idempotent on `eventId` | **Build P1** (webhook + auto-add toggle). HubSpot forms P3. |
| GitHub stargazers source | OBSERVED: `API-NOTES` §1.6 (`play.type github_stargazers`) | — | — | — | **Build P3** (GitHub API is public and authorized). |
| Curated founder lists | OBSERVED: `API-NOTES` §4.1 (`list: yc_founders_2026_09 | a16z_speedrun_founders_2026_10`); `NOTES` §4; `STRINGS` ("Start reaching YC investors") | Picks a dataset | list + filters → people | Snapshot datasets | **Skip.** Brand-specific datasets; we may add our own curated lists later. |
| X follower / liker / replier sources | OBSERVED: `API-NOTES` §1.6, §5.2 (`POST /x/watches` `source` `followers | every_post | post`; `engagements[]` `liked | replied`) ; `STRINGS` ("Engagers on your X posts", "People who engage on X", "Followers who match your buyers get a DM.") | Picks a post or "every post" or "new followers" | watch → candidates | Review before enrollment by default | **Build P2** via official X API with our own app credentials. |
| X buying-intent Plays | OBSERVED: `API-NOTES` §5.1 (`signal` enum `competitor_followers`, `competitor_post_engagers`, `asks`, `complaints`, `reddit`; `criteria` sentence; collects once a day; never enrolls by itself) | Names competitors / phrases | — | `minShared` 2–10; `postsPerCompetitor` 1–10 | **Build P3.** |
| Keyword listening (LinkedIn / X / Reddit) | OBSERVED: `NOTES` §3 ("buyer-conversations" feed, labels "Buying intent", "High priority", "Look for" / "Skip" rules, scheduled Slack report; app URL `/signals/social-listening`) | Writes relevance rules | keywords + rules → labelled feed | — | **Build P3** (X and Reddit via official APIs; LinkedIn only via provider or manual). |
| Account listening (follow LinkedIn profiles) | OBSERVED: `NOTES` §3 ("every half hour", alerts by email or webhook, comment drafted "in your voice", "You post it, not us"; app URL `/signals`) | Adds profile URLs | profiles → new-post feed + drafted comment | User posts the comment | **Adapt P3.** Draft comment; posting is always manual. |
| Lead removal / undo / delete | OBSERVED: `API-NOTES` §1.35, §2.14 (`POST /leads/remove` by leads / import / companies; undo within `undoAfter`; hard `DELETE` only when no history); `STRINGS` (". Undo available for five seconds.", "Removal pending…") | Removes leads, undoes | — | ≤500 per call; "historyPreserved: true, sentActionsReversed: false" | **Build P1.** |
| Move leads between sequences | OBSERVED: `API-NOTES` §1.33, §2.7 (preview → operation with 5-second cancel window → per-lead `moved | blocked`); `STRINGS` ("Could not check who can move.", "Each person's move was checked again before changing their sequence.", "Move cancelled", "Undoing move") | Selects leads, chooses target sequence | — | ≤500; archived sequences not allowed | **Build P2.** |

---

## 5. Buying signals

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Signal catalogue | OBSERVED: `NOTES` §3 (`GET /api/v1/signals` returns `name, title, status, description, delivery`; only `available` entries callable); `screenshots/pumpgtm_com_signals.png` ("Hiring available now · API + MCP · More signals coming soon") | Reads catalogue | — | Coming-soon = roadmap only | **Build P2** as a typed registry in our API. |
| Hiring (`hiring.job_observed`) | OBSERVED: `NOTES` §3 (event shape: `company{name,domain,headcount}`, `job{id,title,url,location}`, `source shared_hiring_index`, `observedAt`; filters `roles` ≤10, `companyDomains` ≤20, head-count bounds; `start recent|now`; signed cursors expire in 7 days; 0 Energy in preview) | Polls events or uses the Play filter | filters → events | "A posting is not proof the role is still open." | **Build P2** with our own jobs feed provider. |
| Funding / investors | OBSERVED: `NOTES` §3 (Play field "Backed by"; cannot filter by round/amount/recency in app; MCP adds recency/round/amount, `API-NOTES` §4.1); catalogue entry "Fundraising — coming soon" | — | — | — | **Build P2.** |
| Coming-soon catalogue entries | OBSERVED: `NOTES` §3 (Reddit conversations, LinkedIn posts, Decision-maker changes, Headcount growth) | — | — | Not callable | **Build P3** for decision-maker changes and headcount growth (provider-dependent); Reddit P3 via official API. |
| Intent tiers (X Plays) | OBSERVED: `API-NOTES` §1.12, §5.3 (`intent.score` 0–100; `tier` `hot ≥65`, `warm ≥35`, `watching`; `signals[]`, `judge`) | Reviews by tier | — | — | **Build P2** as a generic lead-intent tier applied to any source. |
| Signal webhooks | OBSERVED: `API-NOTES` §8 (`x.intent_detected`, `x.competitor_follower`, `linkedin.watched_post`) | Subscribes | — | — | **Build P2.** |
| MCP Events (`events/list`, `events/poll`) | OBSERVED: `NOTES` §3 (poll-only; `nextPollMs`; `cursor_expired`) | Agent polls | — | Streaming not offered | **Build P3.** |

---

## 6. Enrichment

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| `enrich_person` / `POST /people/enrich` | OBSERVED: `NOTES` §4; `API-NOTES` §1.20 (`email` XOR `linkedin`; `find[]` `x | work_email` (MCP adds `mobile`); output `person{name,title,headline,location,company,linkedin,x{handle,url,evidence},workEmail{address,matchesCompanyDomain,verification},connections[] ≤100}`, `missing{field: not_found | energy_exhausted | unavailable}`, `energyUsed`); `screenshots/pumpgtm_com_people.png` | Calls with an email or LinkedIn URL | identifier → profile | Body ≤4 KB; one person per call; not idempotent; "person is null when nobody matches" | **Build P1** (profile + work email through our provider). `connections[]` **Skip** (no comparable data source). |
| `find_work_email` | OBSERVED: `MCP-DOCS` tool reference (§ "People data (uses Energy)") | — | lead → email + verification | Metered | **Build P1.** |
| `find_phone_number` | OBSERVED: `MCP-DOCS` tool reference; `API-NOTES` §10.4 ("Mobile number ~10 Energy when found") | — | lead → mobile | Metered | **Build P2**, gated by region/consent rules. |
| X identity bridge (`POST /leads/enrich`, `POST /x/users/resolve`) | OBSERVED: `API-NOTES` §1.20, §1.4 (≤20 leads; X match only when display name matches and bio/link points at LinkedIn, domain or company, `NOTES` §4) | — | leads → X ids | Conservative matching | **Build P2** with the same conservative rule. |
| Activity check before invite | OBSERVED: `STRINGS` ("Check for activity in last 30 days", "Before inviting someone, PumpGTM checks their LinkedIn posts and comments and skips people with none in the last 30 days. This runs in the background while outreach sends, and can lower how many people are invited each day.") | Toggles per Play | — | Lowers daily throughput | **Adapt P2.** Only where the authorized provider exposes recent activity. |
| Curated datasets (YC founders, investors) | OBSERVED: `NOTES` §4 | — | — | — | **Skip.** |

---

## 7. Lead intelligence and scoring

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Scoring model: fit × timing × intent × confidence | OBSERVED: `NOTES` §11 (blog definition of the four dimensions; routing: high-signal → founder multi-touch, low-signal → email sequences); `STRINGS` ("GTM engineering: why a lead is fit, timing, intent and confidence") | — | signals → score | In-product rubric **not** shown anywhere (`NOTES` §14) | **Build P2.** Transparent 0–100 score with four sub-scores and shown evidence. |
| Threshold ("messages nobody below your threshold") | OBSERVED: `NOTES` §2, §12 (trust page) | Sets a threshold | — | Scale unknown | **Build P2.** Per-Play threshold with default 50. |
| Match reason per candidate | OBSERVED: `API-NOTES` §1.12 (`matchReason`, `evidence`, `linkedinVerified`, `recentActivityAt`); `NOTES` §9 ("one-line reason each") | Reads the reason | — | — | **Build P1.** |
| Review feedback loop | OBSERVED: `API-NOTES` §1.13 (`feedbackReason`, `feedbackNote` on decisions); `NOTES` §11 ("repeated mismatch narrows eligibility") | Explains rejections | — | — | **Build P2.** Aggregate rejection reasons into targeting suggestions. |
| ICP skill / buyer workbook | OBSERVED: `NOTES` §11 (segment table fields, rule classes "Required fit / Useful signal / Timing indicator / Exclusion / Discovery question") | — | — | — | **Adapt P2.** Encode rule classes in our ICP editor; no copied prose. |

---

## 8. Sequences and campaigns

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Play vs Sequence | OBSERVED: `API-NOTES` §1.6, §1.7 (Play = audience/source container with optional default sequence; Sequence = ordered steps with status/revision; "a person still runs one sequence at a time") | — | — | Play 1—N leads; Sequence 1—N leads | **Adapt.** AREVEI names: **Audience** (= Play) and **Campaign** (= Sequence). Same relationship. |
| Sequence object | OBSERVED: `API-NOTES` §1.7 (`id, name 1–160, status, revision, approvedAt, approvedRevision, executionBlockReason, executionModel, leadCount, channels[], steps[]`) | — | — | — | **Build P1.** |
| Status machine | OBSERVED: `API-NOTES` §2.1 (`draft → approved/active ↔ paused → draft`; `archived` read-only; 409 `sequence_approval_required`, `sequence_has_progress`, `archived_sequence_is_read_only`) | Approves, activates, pauses, reopens | — | Approval records `approvedRevision`; content change invalidates approval | **Build P1.** Identical semantics. |
| Execution models `linear / tracks / graph` | OBSERVED: `API-NOTES` §3.3; `STRINGS` ("Steps run in order", "Each channel follows its own schedule.", "Switch channels based on what they do", "Sequences that switch channels are not turned on for this workspace yet.", "This sequence already has people moving through it, so its channels can no longer switch between one-after-another and side-by-side.") | Picks a model | — | Linear/tracks ≤20 steps; graph ≤30 nodes, acyclic, reachable; model change needs no progress | **Build P1**: linear + tracks. **Build P2**: graph with `branch` nodes. |
| Step kinds | OBSERVED: `API-NOTES` §3.1 (`connect, message, engage, email, x_dm, x_engage, instagram_dm, branch`); `STRINGS` ("LinkedIn connection request", "LinkedIn message", "Email message", "X direct message", "Instagram DM", "WhatsApp message", "Engage on LinkedIn", "LinkedIn InMail") | Drags steps onto the canvas | — | `delayDays` 0–30; `subject` 1–200; `messageTmpl` ≤8000; "step 0 must be connect" for LinkedIn-first linear | **Build P1**: `connect`, `message`, `email`. **P2**: `x_dm`, `x_engage`, `engage`, `branch`. **Skip**: `instagram_dm`, InMail (no step kind exists in the reference schema either). |
| Connection request without a note | OBSERVED: `API-NOTES` §3.1 ("go without a note: never suggest, offer or draft one"; note ≤300 chars if insisted); `STRINGS` ("Connection request without a note", "Connection note", "Once your monthly note limit is reached, invites send without a note.") | Optional note | — | Provider monthly note quota | **Build P1.** Default no note; optional note field. |
| Engage actions | OBSERVED: `API-NOTES` §3.1 (`follow, unfollow, view_profile, like_last_post (count 1–3, reaction enum), endorse_first_skill, comment_last_post (guidance ≤1250)`; "Every comment waits for the customer's approval in the app before it posts"); `STRINGS` ("Like their post first", "Comment on their post", "Comment guidance", "Endorse their first LinkedIn skill", "Visit their profile", "This request goes 1 day after the like.") | Adds pre-connect engagement | — | Comment-before-connect feature-gated | **Adapt P2.** Only actions the authorized provider supports; comments always held for approval; no "view profile" spoofing. |
| Conditions / `sendIf` | OBSERVED: `API-NOTES` §3.1 (`condition` `linkedin_accepted | x_followed_back | has_email | linkedin_first_degree`; `sendIf` `followed_back | not_followed_back`); `STRINGS` ("Accepted, then wait", "Not accepted: keep waiting", "If they followed back", "No follow-back: skip this step", "Yes as soon as it happens, no when the wait ends") | Sets branch rules | — | Accept/follow-back conditions wait up to `delayDays` | **Build P2** with graph. |
| Variants (A/B) | OBSERVED: `API-NOTES` §1.10 (`variants[] {key 1–5, weight 1–10000, messageTmpl ≤2000}`, ≤10; results in `messages[].variant`, `experimentArms`); `STRINGS` ("Add message variant", "Add email version", "Variant results are temporarily unavailable.") | Adds versions | — | Each person gets one version, stable on retry (`STRINGS`) | **Build P2.** |
| Template tokens and custom columns | OBSERVED: `API-NOTES` §3.6 (`{{firstName}} {{fullName}} {{company}} {{title}}`, `{{senderFirstName}}`; custom tokens `^[a-z][a-z0-9_]{0,39}$`); `STRINGS` ("Preview with sample values. Each person gets one version…", "A blank cell sends empty, or write a fallback like") | Writes with tokens | — | Fallback syntax | **Build P1.** |
| `customer_input` held steps | OBSERVED: `API-NOTES` §3.7 (`tool {kind: customer_input, tokens ≤5, attachment{key}}`; values via `POST /leads/{id}/input`; file states `waiting → ready → sent | closed`; `attention.leads_waiting_for_input`); `STRINGS` ("PumpGTM waits for you to write this message for each person.", "You add per person", "Each person's file", "Waiting for you", "Missing a name, address, or phone? That person waits for your input.") | Supplies per-person text/file | — | Values 1–5 keys ≤2000; one file ≤50 MB; upload tickets 2 h | **Build P2.** |
| `sendspark` video tool | OBSERVED: `API-NOTES` §3.7; `STRINGS` ("Personalized video", "Send without video if unavailable") | — | — | `timeoutHours` 1–168, `fallback` | **Skip** (third-party specific). Generic `video_url` token via `customer_input` instead. |
| Attachments on LinkedIn steps | OBSERVED: `API-NOTES` §3.10 (≤5 refs); `ENDPOINTS` (`/api/sequences/attachments`); `STRINGS` ("Attach files to LinkedIn step", "Message attachments") | Uploads | — | 15 MB total per message | **Build P2** if provider supports attachments. |
| Edit rules after progress | OBSERVED: `API-NOTES` §3.4 (409 `sequence_edit_would_repeat`; graph structure frozen once anyone left step 0); `STRINGS` ("This edit changes a message someone may already have received. Save your edits as a new sequence to use them for untouched leads.", "Save these changes in a new sequence?", "Create new sequence", "Keep this sequence running", "The new sequence will stay paused until you start it.", "1 linked Play kept its current sequence. Review it in Plays.") | Chooses "save as new" | — | — | **Build P1.** Same safety rule. |
| Revision / optimistic concurrency | OBSERVED: `API-NOTES` §1.8 (`expectedRevision` on PUT, approval, enroll); `STRINGS` ("The selected workspace changed. Reload this page before saving.", "This sequence is no longer available. Refresh the page to continue.") | — | — | 409 `sequence_revision_conflict` | **Build P1.** |
| Templates for new drafts | OBSERVED: `API-NOTES` §1.7 (`inmail, linkedin, email, x, linkedin_email, linkedin_email_parallel, all_channels, branching_flow`) | Picks a starting template | — | — | **Build P1** (our own template set: linkedin, email, linkedin+email, linkedin+email parallel). |
| Default follow-up plan | OBSERVED: `API-NOTES` §3.9 (three follow-ups: proof +2d, question/offer +3d, short last note +5d); `STRINGS` ("Typically 1 in 5 accept your request, and 1 in 7 of them reply.", "A short nudge — two lines is plenty.") | Accepts AI proposal | — | — | **Build P1** with our own default cadence (2/3/5 days is a sensible default). |
| AI message writing and review checks | OBSERVED: `NOTES` §9 (six review checks; "Two to four sentences"; banned filler words); `MCP-DOCS` (`write_cold_email`, `get_cold_message_examples`); `STRINGS` ("Write with AI", "Write it myself", "Direct draft", "Get AI help with these steps") | Lets AI draft; edits | profile + lead → draft | — | **Build P1.** Own prompt set implementing the same quality rules. |
| Plain-text email, unsubscribe footer | OBSERVED: `API-NOTES` §3.8 (`unsubscribeFooter` off by default; List-Unsubscribe headers; workspace `plainTextEmail` removes HTML/tracking); `STRINGS` ("Plain-text email · workspace setting", "If you'd rather not hear from me again, unsubscribe here:") | Toggles | — | — | **Adapt P1.** Unsubscribe footer **on by default** for cold email; List-Unsubscribe always sent. |
| Email settings per sequence | OBSERVED: `API-NOTES` §1.5, §3.8 (`sequence_email_settings`: inboxes, schedule, daily limit); `STRINGS` ("Choose the inbox this email campaign will send from.", "Campaign sending channels") | Picks mailboxes, window, cap | — | — | **Build P1.** |
| Pacing / limits (LinkedIn) | OBSERVED: `NOTES` §5 limits table (warm-up 5/7/10/15/16/20 over six days; daily cap 1–30, default 30; ≤100 profile views/day; ≤100 messages+likes/day; 8am–6pm account time zone; 5–30 s random waits; decline → hold 24/48/72 h); `API-NOTES` §1.3 (`GET/PATCH /linkedin/accounts/{id}/sending-limits`) | Sets daily cap, restarts warm-up | — | `effectiveDailyCapToday = min(ramp, cap)` | **Adapt P1.** Caps and ramp enforced by our scheduler **on top of** provider limits; default cap 20 (below the reference's 30) because we don't use proxies. |
| Pacing / limits (X) | OBSERVED: `NOTES` §7 (≤100 DMs/day per workspace; random gaps; skip existing threads, empty bios, <20 followers, DMs closed) | — | — | — | **Build P2** within official API rate limits. |
| Pacing / limits (email) | OBSERVED: `NOTES` §6 (per-mailbox daily limit, sending window; mock "38 / 40 today"); `API-NOTES` §1.5 (legacy `dailyLimit` 1–5000) | Sets per-mailbox limit | — | — | **Build P1.** Default 40/day/mailbox, window Mon–Fri local hours. |
| Reply stops the sequence | OBSERVED: `NOTES` §5, §6, §9 ("A reply on either channel stops every remaining step for that person"); `STRINGS` ("A reply stops all outreach across this sequence.", "Stops if they reply") | — | — | Cross-channel | **Build P1.** |
| Lead replenishment / Play refill | OBSERVED: `NOTES` §3 ("When a Play refills, companies it already worked are skipped"); `API-NOTES` §7.4 (`lead_replenishment_enabled/disabled` actions); `STRINGS` ("Automatically add new matches") | Toggles | — | — | **Build P2.** |
| Campaign planner (AI builds campaigns from setup) | OBSERVED: `API-NOTES` §1.27 (`plan_campaigns`, `build_campaigns { keys, expectedRevision }`, `check_campaign`); `STRINGS` ("Build your first campaign", "Building your campaigns", "Creating each Play", "Setting who each campaign reaches", "Review your campaigns", "Your campaigns start as soon as their accounts are connected.") | Reviews proposed campaigns | profile → 1–2 campaigns | Never auto-approves | **Build P2.** |

---

## 9. Channels

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| LinkedIn — hosted-auth connection | OBSERVED: `HEADERS` (CSP `frame-src https://*.unipile.com`); `ENDPOINTS` (`/api/unipile/custom-auth`); `STRINGS` ("Connect LinkedIn", "Choose one way to connect", "Authorize PumpGTM in a separate window, then return here. This card updates when the connection is confirmed.", "Close LinkedIn connection"); `NOTES` §5 ("secure login page run by our LinkedIn connection provider") | Opens hosted auth, completes 2FA | — | Status `connected | disconnected` (`API-NOTES` §1.3) | **Build P1** via an authorized provider's hosted auth with AREVEI's own provider account. |
| LinkedIn — session-cookie / browser-session connection | OBSERVED: `STRINGS` ("Connect with the LinkedIn session you already use", "Connect with a session cookie", "Paste session cookie", "Connect with Cookie-Editor instead", "Only LinkedIn session cookie li_at and optional premium cookie li_a are forwarded.", "Export cookies in one click. No password or code.") | Pastes exported cookies | cookies → session | — | **Skip.** Explicitly out of scope: no cookie capture, no credential forwarding. |
| LinkedIn — residential proxy, warm-up, working hours | OBSERVED: `NOTES` §5; `STRINGS` ("We send from your account through a residential proxy near you, only during working hours, with a warm-up ramp and daily caps…"); `API-NOTES` §1.3 (`proxyCountry`) | — | — | — | **Adapt.** Keep warm-up ramp, working hours, daily caps (scheduler-level). **Skip** proxies and any traffic-shaping that disguises automation. |
| LinkedIn — multiple accounts / seats | OBSERVED: `NOTES` §1 ("Each seat is a LinkedIn account you send from"); `STRINGS` ("All LinkedIn accounts included in your plan are connected. Disconnect one, or contact us…", "Your free trial includes one LinkedIn account.") | Adds senders | — | Seat-based billing | **Build P1** (seat = connected sender). |
| LinkedIn — InMail | OBSERVED: `API-NOTES` §1.3 (`inmailEnabled`, `GET …/inmail-credits`); `STRINGS` ("LinkedIn InMail", "Requires LinkedIn InMail access and available credits.") | — | — | Feature flag | **Skip P1–P2**; revisit if provider supports it. |
| LinkedIn — health panel | OBSERVED: `NOTES` §13 (mock "LinkedIn connected · Sending as you", warm-up cap chart "Cap 5 D1 … 30 D7", "Requests sent 30 / day", timeline of sends); `STRINGS` ("Awaiting health checks", "Warm-up data unavailable", "Saved limits:", "Invites sent", "Outreach today") | Reads status | — | — | **Build P1** (status, today's budget, warm-up ramp chart). |
| LinkedIn — invite hold on decline | OBSERVED: `NOTES` §5 (test invite after 24/48/72 h); `API-NOTES` §2.10 (`linkedin.limited` → `linkedin.resumed` webhooks) | Notified | — | 3 attempts | **Build P1.** |
| Email — Gmail / Google Workspace OAuth | OBSERVED: `STRINGS` ("Connect with Google", "Sign in with the Google account for the mailbox you want to connect. Connect with Google works only when your Google admin has allowed PumpGTM.", "Google signed you in, but Gmail refused reading replies. Your Workspace admin may have turned off IMAP for this mailbox.", "…refused sending… SMTP", "Allow PumpGTM in Google Workspace", "Security → Access and data control → API controls → Manage app access", "Tick the Gmail box on Google's last screen"); `ENDPOINTS` (`/api/email/mailboxes`, `/api/onboarding/email-sender`); `ROUTES` (`/accounts/email`) | Signs in with Google | OAuth → mailbox | Live send/read check before saving (`NOTES` §6) | **Build P1** with AREVEI's own Google OAuth app (Gmail API; IMAP/SMTP fallback). |
| Email — Microsoft 365 / Outlook OAuth | OBSERVED: `STRINGS` ("Sign in with Microsoft", "Accept every permission on Microsoft's screen…", "Microsoft says "Need admin approval"?", "Microsoft signed you in, but that account has no Outlook mailbox…", "If Microsoft offers an approval request form, submit it there.") | Signs in with Microsoft | — | 1.5 MB attachment limit from Microsoft mailboxes (`API-NOTES` §1.5) | **Build P1** with our own Azure app (Graph API). |
| Email — IMAP/SMTP with app password | OBSERVED: `STRINGS` ("Connect any mailbox", "IMAP and SMTP", "App password", "Create an app password", "Open 2-Step Verification", "Open App passwords", "Find your provider's mail server settings", "Enter the settings and password", "An app password if your provider offers one, otherwise the mailbox password.") | Enters host/port/password | — | Stored encrypted; verified live | **Build P1.** |
| Email — mailbox list, per-mailbox limits, search | OBSERVED: `STRINGS` ("Search mailboxes", "No mailboxes match your search.", "Mailboxes pagination", "Use this inbox and continue", "Inbox purpose"); `NOTES` §6 ("Connect one mailbox or ten. Each one keeps its own daily limit.") | Manages mailboxes | — | — | **Build P1.** |
| Email — managed domains/inboxes package | OBSERVED: `STRINGS` ("Buy domain & inboxes", "This inbox is part of a PumpGTM email package that isn't cleared to send right now."); `NOTES` §1 ("Sending inboxes and domains are not included in the service fee.") | Buys inboxes | — | — | **Skip** P1–P2. |
| X — official OAuth | OBSERVED: `NOTES` §7 ("official X API", revocable; "Read posts, likes, followers. Send DMs. Nothing else."); `ENDPOINTS`/`ROUTES` (`/api/integrations/x/authorize`); `STRINGS` ("X opens in a new tab. Allow access there, then come back: this page moves on by itself.", "Only workspace owners and admins can connect X.", "A teammate already connected that X account.") | Authorises on X | — | One X account per connection; owner/admin only | **Build P2** with our own X developer app. |
| X — actions (follow/unfollow/like/repost) | OBSERVED: `API-NOTES` §1.4 (`POST /x/actions`); contradicted by marketing "It does not post, like, reply, follow or unfollow on your behalf" (`NOTES` §7) | — | — | Metered per action | **Adapt P2.** Follow/unfollow as explicit sequence steps only; no background liking. |
| Instagram DM | OBSERVED: `API-NOTES` §3.1 (`instagram_dm`, "only in their own linear sequence"); `ENDPOINTS` (`/api/unipile/custom-auth/instagram`); `STRINGS` ("Connect your Instagram", "Instagram DM follow-up") | — | — | — | **Skip.** |
| WhatsApp (beta) | OBSERVED: `NOTES` §8 (access by request; "not generally available for self-serve"); `STRINGS` ("WhatsApp message", "Send a WhatsApp message or follow-up"); `API-NOTES` §7.4 (`whatsapp_dm` activity) | Requests access | — | — | **Build P3** via WhatsApp Business Platform (opt-in contacts only). |
| Gifts / cakes in sequences | OBSERVED: `ROUTES` (`/gifts/designs/new`); `ENDPOINTS` (`/api/gifts/recipients`); `STRINGS` ("Create your first cake design.", "Cake recipients", "Recipient name", "Street address", "Delivery phone", "Approval allows real cake purchases. Replies stop unpaid orders.", "Name, delivery address, and phone are required. Each person waits until you add theirs.", "Order confirmed"); `A11Y-HOME` link "Send cakes in sequences" | Designs a gift, adds recipient address per person | — | Held until address supplied | **Skip.** |
| Google Calendar (read-only, reminders) | OBSERVED: `NOTES` §6 (privacy policy: read calendars/events for call reminders; "We never create, change or delete events.") | Connects calendar | — | — | **Build P3.** |
| Booking link (Cal.com) | OBSERVED: `HEADERS` (CSP `app.cal.com`); `STRINGS` ("Opening calendar…"); `NOTES` §10 (booking link inserted into reply drafts) | Sets a booking link | URL | — | **Build P1** (any URL; Cal.com/Calendly embed optional). |

---

## 10. Inbox and replies

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Unified inbox, "Needs you" | OBSERVED: `NOTES` §10 ("Replies from LinkedIn, email and X land in one list, and Needs you shows who is waiting on you."); `STRINGS` ("drafts a reply. Approve or edit it in Inbox.", "Search email, sender or status", "Scroll down to see more messages", "Needs message review", "Needs support") | Reads replies, filters | — | — | **Build P1.** Route `/inbox` (INFERRED — not in `ROUTES`, but referenced by strings). |
| Pending reply object | OBSERVED: `API-NOTES` §1.14 (`id`/`draftId`, `channel`, `lead`, `theirMessage`, `draft`, `allowedDecisions[]`, `messageUnavailable`, `unlockUrl`, `replyUrl`) | — | — | Encrypted X chat may be unreadable | **Build P1** (LinkedIn + email); X P2. |
| Reply classification / sentiment | OBSERVED: `API-NOTES` §1.14 (`classification` on `reply.received`; lead "reply sentiment") — values **not enumerated** | — | — | Unknown taxonomy | **Build P1** with our own enum: `interested`, `question`, `not_now`, `not_relevant`, `referral`, `negative`, `ooo_auto`, `unsubscribe`. (ASSUMPTION) |
| AI draft with booking link | OBSERVED: `NOTES` §10 ("drafts your answer, with your booking link when they're ready to talk"); `API-NOTES` §7.4 (`reply_drafted`) | Edits or sends | reply → draft | X: "PumpGTM never writes replies for you on X" (marketing) vs X drafts in MCP — contradictory | **Build P1.** Draft on all channels; always human-approved. |
| Decisions enum | OBSERVED: `API-NOTES` §1.16, §2.11 (`send, invite, booking_link, snooze, start_sequence, meeting_booked, dismiss, opt_out`; `snooze days` 1–365, MCP default 3 then 7; `opt_out` permanent; same text re-sent → `alreadyDecided`) | Picks a decision | — | `allowedDecisions` varies per item | **Build P1** with the same eight decisions. |
| Scheduled replies | OBSERVED: `API-NOTES` §1.15, §2.12 (`sendAt` within 30 days; status `scheduled → sending → sent | failed | delivery_unknown`; `held` requires `reapprove`; partner-only, 403 `scheduling_not_enabled`) | Schedules a send | — | `Idempotency-Key` required | **Build P2** for all users (not partner-gated). |
| Thread view | OBSERVED: `API-NOTES` §1.11 (`GET /leads/{id}/thread`, `get_lead_thread`; cursor expires 30 min); `NOTES` §13 (thread pane with prospect header and per-day events) | Reads full thread | — | `limit` 1–100 | **Build P1.** |
| Reply freezes the lead | OBSERVED: `QUICKSTART` §4 ("Replies freeze the lead"); `API-NOTES` §2.2 | — | — | — | **Build P1.** |
| Slack notice on X reply | OBSERVED: `NOTES` §7 | — | — | — | **Build P2** (Slack + email notifications for all channels). |
| Notification preferences | OBSERVED: `ENDPOINTS` (`/api/notifications/preferences`); `STRINGS` ("Each morning") | Chooses digests | — | — | **Build P1** (daily digest + instant reply alerts). |

---

## 11. Analytics

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Overview / progress | OBSERVED: `QUICKSTART` §2 (`GET /progress?sinceDays`: funnel invited → accepted → messaged → replied → meetings booked; queue depth; each LinkedIn account's budget today); `ROUTES` (`/overview`); `STRINGS` ("— Open Overview to see who accepted and who replied.", "Outreach today", "Invites sent") | Opens dashboard | — | — | **Build P1.** |
| Analytics report | OBSERVED: `API-NOTES` §7.1 (`range 7d|30d|90d`; metrics `enrolled, touched, invites, connections, messages, replies, meetings, mature, cohortReplies, replyRate`; `responseDays 14`; `replyAttribution last_message_before_first_reply`; `minimumRankingSample 30`; timezone fixed `America/Los_Angeles`); `STRINGS` ("14-day eligible people", "14-day replies", "14-day reply rate", "Attributed replies", "First replies", "Leads touched", "Recorded meetings", "Meeting coverage", "Report scope", "Not available in this report") | Reads per Play / sequence / message / channel | — | Reply rate null until a 14-day window completes | **Adapt P1.** Same metric definitions; **workspace time zone** instead of a fixed one. |
| Funnel report by sequence / account | OBSERVED: `API-NOTES` §7.3 (`GET /reports/funnel?group_by=sequence|account`, `experimentArms`) | — | — | — | **Build P2.** |
| Activity ledger | OBSERVED: `API-NOTES` §7.4 (`GET /activity`, ~100 action names, outcome `ok | failed | skipped`, append-only); `NOTES` §13 ("Activity log") | Filters by action/outcome | — | Bounded recent window | **Build P1** with a smaller action vocabulary. |
| Rankings (best/worst play, message) | OBSERVED: `API-NOTES` §7.1 (requires ≥2 non-tied results with ≥30 eligible people) | — | — | — | **Build P2.** |
| Variant results | OBSERVED: `API-NOTES` §1.10; `STRINGS` ("Variant results are temporarily unavailable.") | — | — | — | **Build P2.** |
| Clicks / open tracking | OBSERVED: `API-NOTES` §7.1 (`coverage.clicks "unavailable"`); `API-NOTES` §7.4 (`email_click` action exists) | — | — | — | **Adapt.** No open pixels; optional link-click tracking off by default. |

---

## 12. Integrations and developer surface

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| MCP server | OBSERVED: `MCP-DOCS` ("Generated from the live tools/list on 2026-11-10: 69 tools"; "up to 38 tools, depending on the workspace's features"); `public-docs/pumpgtm-mcp-server-card.json` (70 tool names); `screenshots/pumpgtm_com_docs_mcp.png`; OAuth 2.1 + PKCE, 30-day access / 90-day refresh (`API-NOTES` §0) | Connects Claude / Cursor / Codex / ChatGPT etc. | — | Every result carries a `next` hint | **Build P2.** Streamable HTTP MCP with OAuth; initial tool set ≈ 25 (workspace, people, sequences, leads, replies, analytics). |
| Install page | OBSERVED: `ROUTES` (`/install-mcp`, `/mcp`); `STRINGS` ("Choose your AI tool", "Claude Code add command", "Codex add command", "Add custom connector", "PumpGTM client ID", "Optional: use a bearer key", "Authorization header", "Get your workspace key from the connection page.") | Copies a command / key | — | Key "acts as your workspace" | **Build P2** (`/settings/integrations/mcp`). |
| REST API | OBSERVED: `OPENAPI` (82 operations under `/api/v1` and `/api/partner/v1`); `QUICKSTART`; `API-NOTES` §0 (bearer `eve_mcp_` key, same for MCP and REST) | Calls API | — | `requestId` idempotency; `expectedRevision` concurrency; error model `API-NOTES` §11 | **Build P1** (core: workspace, leads, sequences, replies, progress, webhooks). Partner routes P3. |
| Webhooks | OBSERVED: `API-NOTES` §8 (15 events; HMAC `t=<unix>,v1=<hex>` over `t.rawBody`; ≤10 hooks; ≤3 attempts at +1 s, +4 s; HTTPS/public DNS only) | Registers URL + events | — | Secret shown once | **Build P1.** Same signature scheme (own header names). |
| Workspace key + headers | OBSERVED: `API-NOTES` §0 (`X-PumpGTM-Client`, `X-PumpGTM-User`) | — | — | Never both | **Adapt.** Own header names; client/user delegation P3. |
| Partner API (agencies) | OBSERVED: `API-NOTES` §1.30–1.32, §2.13 (`POST /signup`, end users, connect links 10 min–30 days, 50 free leads, `billing.status`) | — | — | — | **Build P3.** |
| HubSpot | OBSERVED: `OPENAPI` (`POST /integrations/hubspot`); `API-NOTES` §7.4 (`hubspot_reply_logged`); `STRINGS` ("HubSpot forms") | Connects | — | — | **Build P3.** |
| n8n / Zapier | OBSERVED: `STRINGS` ("Your app or Zapier"); `NOTES` §13 (webhook entry) | — | — | — | **Build P2**: generic webhook in/out works with n8n/Zapier without a native node; native n8n node P3. |
| Skills & prompts library | OBSERVED: `NOTES` §2, §11 (`/skills`, SKILL.md packs) | Downloads | — | — | **Build P3** (own prompts). |
| AI benchmark page | OBSERVED: `NOTES` §1 | — | — | — | **Skip.** |

---

## 13. Billing and Energy

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Plans | OBSERVED: `NOTES` §1 (Starter $75/month per LinkedIn account, "Reach up to 1,000 people a month"; Enterprise custom); `screenshots/pumpgtm_com_pricing.png` ("Monthly / Yearly (save 20%)"); `STRINGS` ("Lite includes one LinkedIn account…", "$0 today for your seven-day trial, then $60 for your first paid month. $75/month after that.", "Get 20% off your first month"); `API-NOTES` §10.4 (allowance 1,500 Starter / 4,000 Hypergrowth) | Chooses plan + period | — | Seat = LinkedIn sender | **Adapt.** Own pricing; seat = connected sender; monthly/yearly. Tier names are ours. |
| 7-day trial with card + $1 hold | OBSERVED: `STRINGS` ("We place a temporary $1 card hold and release it immediately.", "Your bank declined our $1 card check for insufficient funds…", "Why do you need a card for a free trial?" → "The trial runs a live buyer search and real outreach on your behalf, which costs us money per account."); `ENDPOINTS` (`/api/billing/checkout`, `/api/billing/checkout/failure`, `/api/billing/exit-offer`); `ROUTES` (`/api/billing/setup`, `/api/billing/resume`) | Adds card via Stripe Checkout | — | "Execution resumes only after … verified Stripe state. A checkout redirect alone never restarts outreach." | **Build P1.** Stripe Checkout + webhook-verified state; trial length configurable. |
| Exit offer | OBSERVED: `ENDPOINTS` (`/api/billing/exit-offer`); `STRINGS` ("Claim 20% off and start trial", "Claim within", "Quote expired") | — | — | — | **Build P2.** |
| Refund within 24 h | OBSERVED: `STRINGS` ("Request a full refund from Billing within 24 hours of a subscription charge. A refund cancels the subscription…") | — | — | — | **Adapt.** Policy decision for AREVEI; implement self-serve cancel in P1. |
| Qualified-meeting guarantee | OBSERVED: `NOTES` §1 (terms) | — | — | — | **Skip.** |
| Energy metering | OBSERVED: `NOTES` §1 ("One Energy is $0.05"; reserve-then-settle; no-match free); `API-NOTES` §1.21, §10.4 (`GET /energy`; cost table: 2/person found, 1/liker collected, 5/DM with history check, 0.6/DM, ~1 profile lookup, ~10 mobile; packs; auto top-up); `STRINGS` ("Top up Energy", "Add Energy or update your workspace allocation to start finding people.", "Costs 1 Energy for each profile found, so up to") | Buys packs, enables auto top-up | — | 402 `energy_exhausted` | **Adapt P1.** Our unit: **Credits** (1 credit = $0.05 equivalent, own rate book). Reserve-then-settle kept. |
| Billing page | OBSERVED: `ROUTES` (`/billing`); `STRINGS` ("Billing period", "Cancel subscription", "Check billing status", "Resolve billing", "Open billing to review your subscription, update your payment method, or pay an outstanding invoice.", "Stripe shows the methods eligible for your location and device, including cards, Link, Apple Pay, Google Pay, and options such as Klarna where supported.") | Manages subscription | — | Stripe Billing portal | **Build P1.** |
| Done-for-you services | OBSERVED: `NOTES` §1; `ROUTES` (`/onboarding/done-for-you`) | — | — | — | **Skip.** |

---

## 14. CRM pipeline (lightweight)

| Feature | Evidence | What the user does | Inputs → Outputs | Limits / rules | AREVEI decision |
|---|---|---|---|---|---|
| Companies | OBSERVED: `API-NOTES` §1.22 (`save_company`: `lifecycle` `prospect | onboarding | active | at_risk | churned`, `owner`, `success_plan`, `next_review_on`; `expected_revision` 0 creates) | Creates/updates | — | Feature-gated | **Build P3.** |
| Opportunities | OBSERVED: `API-NOTES` §1.23 (`stage` `new | qualified | meeting | proposal | negotiation | won | lost`; `amount_minor`; currency enum; `probability_override`; `next_step_due_on`) | — | — | — | **Build P3.** |
| `get_pipeline` | OBSERVED: `API-NOTES` §1.23 (`attention` = overdue or ≥14 days no contact; totals per currency) | — | — | `limit` 1–100 | **Build P3.** |
| Contacts linked to leads | OBSERVED: `API-NOTES` §1.24 (`lead_id`) | — | — | — | **Build P3.** |
| Customer signals (timeline) | OBSERVED: `API-NOTES` §1.25 (`kind` `note | meeting | reply | product_engagement | risk | milestone`; `source` enum) | — | — | — | **Build P3.** |
| Meeting booked / no-show tracking | OBSERVED: `API-NOTES` §7.4 (`meeting_booked`, `meeting_no_show`, `meeting_synced`); `STRINGS` ("Recorded meetings") | — | — | — | **Build P1** (manual "meeting booked" decision) → P3 (calendar sync). |

---

## 15. AI search / AEO tools — out of scope

| Feature | Evidence | AREVEI decision |
|---|---|---|
| AI search visibility (engines ChatGPT, Google AI Overview/Mode, Gemini, Perplexity; ≤50 tracked questions; content audit) | OBSERVED: `API-NOTES` §1.29; `MCP-DOCS` ("AI search (needs AI search)" tool group) | **Skip.** Unrelated to outbound GTM; not part of AREVEI. |
| Ad campaign actions (`ad_campaign_*` activity rows) | OBSERVED: `API-NOTES` §7.4 | **Skip.** |

---

## 16. Cross-cutting rules we keep

| Rule | Evidence | AREVEI |
|---|---|---|
| Nothing sends without explicit approval of people and messages | OBSERVED: `NOTES` §9, §12; `STRINGS` ("Nothing sends until you approve the messages.", "Nothing sends until you connect your accounts and launch.", "No outreach will be sent", "Draft saved. Nothing is sending.") | Keep as a product invariant and as copy pattern (own wording). |
| Idempotent writes (`requestId`), optimistic concurrency (`expectedRevision`) | OBSERVED: `API-NOTES` §10.5 | Keep. |
| Dedup across identities (LinkedIn URL, email, X handle) | OBSERVED: `API-NOTES` §1.11 | Keep. |
| Working hours, daily caps, warm-up, reply-stop | OBSERVED: `NOTES` §5–7 | Keep at scheduler level, without stealth. |
| Export of leads and conversations | OBSERVED: `NOTES` §12 | Keep (CSV/JSON export in P1). |

## 17. Known unknowns carried into our design

From `NOTES` §14 and `API-NOTES` §12: reply classification values, in-product score scale, exact meaning of "1,000 people a month", email settings sub-fields, working-hours configuration API, `executionBlockReason` values, X lead stage values. AREVEI defines its own for each (see ASSUMPTION rows above) and documents them in our API reference.
