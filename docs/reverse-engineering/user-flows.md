# AREVEI GTM — User flows (reverse-engineered from PumpGTM public surfaces)

Status: working document, 2026-11-17. Companion documents: `feature-inventory.md`, `ui-analysis.md`.

## Conventions

Each step is written as **user action → system response → data touched → evidence**. Labels are the same as in `feature-inventory.md`: **OBSERVED**, **INFERRED** (with the source of the inference), **ASSUMPTION** (AREVEI design choice). Citations are paths relative to `docs/reverse-engineering/evidence/`; abbreviations (`STRINGS`, `ROUTES`, `ENDPOINTS`, `NOTES`, `API-NOTES`, `A11Y-APP`, `A11Y-HOME`, `HEADERS`, `OPENAPI`, `MCP-DOCS`, `QUICKSTART`) are defined in `feature-inventory.md`.

Quoted UI copy is reproduced **only as evidence** of states and wording patterns. AREVEI writes its own copy.

Important: only the unauthenticated sign-in page was inspected live. Every post-login step is reconstructed from bundle strings, fetch endpoints, static routes and the public API/MCP docs, and is labelled accordingly. The order of onboarding steps is INFERRED from endpoint names and string groupings; the reference product may order them differently.

Each flow ends with **AREVEI equivalent**, listing only what differs.

---

## Flow 1 — Sign-up / sign-in

Entry: `app.pumpgtm.com/` redirects (307) to `/onboarding` when no session cookie is present [OBSERVED: `HEADERS` `location: /onboarding`, `x-matched-path: /`].

| # | User action | System response | Data touched | Evidence |
|---|---|---|---|---|
| 1 | Opens `/onboarding` | Renders "Sign in to PumpGTM" with subtitle "Use your password or a one-time code.", fields **Work email** and **Password**, buttons **Sign in**, **Email me a sign-in code**, **Forgot password?**, header button **Create account**, testimonial carousel (Previous/Next), footer links Terms / Privacy / Support. A `region` named "Notifications alt+T" (toast container) and an empty `alert` exist in the tree. | none | OBSERVED: `A11Y-APP`; `screenshots/app_pumpgtm_com_onboarding.png` |
| 2a | Enters email + password, clicks **Sign in** | On success, session established; redirect to workspace. On failure: "We could not sign you in. Check your connection and try again." Rate limit: "Too many attempts. Wait 15 minutes before trying again." | session | OBSERVED: `STRINGS`; INFERRED backend Supabase Auth from `HEADERS` CSP (`*.supabase.co`) and `STRINGS` ("Auth session or user missing", "JWT has expired") |
| 2b | Clicks **Email me a sign-in code** | "Sending code…" → "We sent a one-time code to {email}" / neutral "If this email is linked to an account, a sign-in code is on its way to {email}"; screen "Enter your sign-in code" with **Verify code and sign in**, **Send another code**, **Sign in with password instead**, **Back to sign in**. Error: "That verification code wasn't accepted. Check the code and try again." | one-time code | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/auth/sign-in-code`) |
| 3 | Clicks **Create account** | Form "Create your account" with email, password; "By creating an account, you agree to … Privacy Policy". Duplicate: "{email} already exists. Send a one-time sign-in code to {email}" / "Already have an account?". | user | OBSERVED: `STRINGS` |
| 4 | Confirms email | "Check your inbox"; "Your email isn't confirmed yet"; "Open the confirmation link we emailed you when you created your account, or sign in with a code below. The code confirms your email too."; **Resend confirmation link**. Workspace creation is blocked: "Confirm your email before creating the workspace." | `email_confirmed_at` | OBSERVED: `STRINGS`; `ROUTES` (`/onboarding/verify-email`) |
| 5 | (Optional) Forgot password | "Reset your password" → **Email me a reset code** → "Password reset code", "New password", "Confirm new password" → **Reset password and sign in**. "If the address is registered, a new code is on its way." | password | OBSERVED: `STRINGS` |
| 6 | (Returning) | "Welcome back", "Let's get you back.", "Continue your workspace setup", "to resume where you left off." | — | OBSERVED: `STRINGS` |
| 7 | (Security prompt) | "Is this you trying to sign in?" with "No, it's not me" | — | OBSERVED: `STRINGS`; INFERRED as a new-device confirmation |

States quoted: loading "Sending code…"; errors above; empty state none.

**AREVEI equivalent.** Same two methods and code-as-confirmation. Differences: (a) create-account and sign-in share one screen with a mode switch; (b) workspace is created only after email verification and company-domain check; (c) we add passkeys in P2; (d) device-confirmation prompt is P2.

---

## Flow 2 — Onboarding (company → audience → leads → sequence → accounts → trial → activation)

Resumable: "Your setup is saved", "Finish later", "Onboarding progress" [OBSERVED: `STRINGS`]. Endpoint sequence is INFERRED from `ENDPOINTS` names.

| # | User action | System response | Data touched | Evidence |
|---|---|---|---|---|
| 1 | Enters "Company name or website" | Validates ("Enter a valid company website."); "Loading website logo"; "We use your site to find your buyers."; "Working out who buys from you"; produces **What you sell**, **Who do you sell to?**, **Why they'd buy, in a line**; asks **Confirm company** / **Confirm website**: "Confirm your company details before starting discovery." Duplicate: "A workspace for this company already exists. Ask its owner to invite you instead of creating a new one." | company profile `{name, website, offer, buyers, audiences, proof}` | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/onboarding/company`, `/api/onboarding/company-profile`, `/api/company-profile`); `API-NOTES` §1.26 |
| 2 | Answers setup prompts | Prompts such as "Describe the smallest useful trial…", "When is your product the better choice?", "Why switch if they have already paid?", "Customer results and testimonials". "Saving your answers". Reviewer step: `/api/onboarding/setup-review` (returns reviewed profile + token in the MCP equivalent). "Review updated setup" when website/audience changed. | GTM profile; `setupRevision` | OBSERVED: `STRINGS`; `ENDPOINTS`; `API-NOTES` §9 |
| 3 | Picks target audiences | "Your target buyers" with suggested chips ("Engineering managers at B2B SaaS companies" …) and "or type your own"; validation "Pick at least one audience."; "Saving your audience choices" → "Audience choices saved". | audiences[] | OBSERVED: `STRINGS` |
| 4 | Chooses a lead source | Options: **Upload your leads** ("Drop CSV, Excel, or PDF here", "or paste CSV text", "Upload a list, even emails only."), **Your competitors' customers**, **Your competitors' engagers**, **Companies like your best customer**, **Companies hiring now**, **Companies that just raised**, **People posting about the problem**, **Engagers on your LinkedIn posts / X posts / company page**, **Your LinkedIn connections** / **Friends of friends**, **Follow up with signups** (HubSpot forms, "Your app or Zapier", "Upload past signups"), **Webinar or workshop**, or **We'll find the buyers for you**. "Change lead source" allows going back. | `lead_source` | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/onboarding/lead-source`, `/api/onboarding/network-leads`, `/api/campaign/parse-pdf`, `/api/campaign/leads`) |
| 5 | Requests a lead sample | Progress: "Finding your first buyers", "Matching titles, company size and location", "Keeping people whose current role fits", "Checking each person", "Lining them up"; "You can continue while we finish looking." Result: "Sample matches", "Real people like them", size choice "Half sheet · about 50 people" / "Full sheet · about 100 people". Empty: "No sample people found for this audience yet." / "We couldn't find matching leads yet"; fix-ups: "Shorten this audience to load sample people.", "Some industries can't be searched. Edit to review.", "We couldn't match this location. Edit to fix it." Error: "Try the search again. Your setup is saved." Limit: "This sample exceeds the activation lead limit." | people-search Play, review batch | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/onboarding/lead-sample`); `API-NOTES` §4.2 |
| 6 | Reviews leads | "Review leads"; per-row match reason (API: `matchReason`, `evidence`); selects → **Add selected leads** → "Adding your selected leads" → "Leads approved". Guards: "Connect LinkedIn now to add selected profiles.", "Start your free trial before connecting and adding these leads.", "Your selected leads could not be added yet. Please try again." | decisions, leads | OBSERVED: `STRINGS`; `API-NOTES` §1.13 |
| 7 | Receives sequence proposal | "Here's what we'll send" / "Your outreach sequence"; progress "Drafting the first message", "Writing the follow-up", "Tightening the wording". Steps shown: "Connection request without a note", "Message after the connection is accepted". Choice "First sequence direction": **Direct draft**, **Write it myself** / **Write with AI**; "Your draft was empty, so Direct is selected." Option "Skip messages, send connection requests only". Benchmark line: "Typically 1 in 5 accept your request, and 1 in 7 of them reply." | sequence draft | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/onboarding/sequence-proposal`, `/api/onboarding/sequence`) |
| 8 | Approves messages | **Review messages** / **Edit messages** / **Approve messages**; "Nothing sends until you approve the messages."; FAQ "Will anything send without my approval?" → "No. PumpGTM only sends connection requests, and the starting message you approved, to the people you approve, and only after you connect LinkedIn." | `approvedRevision` | OBSERVED: `STRINGS`; `API-NOTES` §2.1 |
| 9 | Connects a sending account | "Your messages go out from your own LinkedIn, email or X account. Connect one so outreach can start."; LinkedIn / email / X cards (see Flow 5). Skip allowed: "Skip only if you're on your phone or don't have your login with you. You can connect later from Overview."; "Your setup is saved. You can connect an account from Overview later." | senders | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/onboarding/connections`, `/api/onboarding/email-sender`, `/api/unipile/custom-auth`, `/api/integrations/x/authorize`). No dedicated `/connect/*` page route appears in `ROUTES`; the connection UI is INFERRED to be a card/dialog inside onboarding and Accounts. |
| 10 | Starts trial | "Start your free trial"; "$0 today for your seven-day trial, then $60 for your first paid month. $75/month after that." / "Claim 20% off and start trial"; Stripe Checkout; "$1 card hold … released immediately"; return states "Checkout complete. Create your account to finish setting up your outreach." / "Checkout was cancelled. Your workspace is saved…" / "We could not verify checkout. Please start the trial again." / "Your bank declined our $1 card check…". "Execution resumes only after PumpGTM receives verified Stripe state." | subscription, trial | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/billing/checkout`, `/api/billing/checkout/failure`, `/api/billing/exit-offer`) |
| 11 | Activates | "Nothing sends until LinkedIn is connected and your trial starts." → **Approve and start →** / **Start outreach →** / **Send invites →** → "Starting your outreach now" → "Your outreach is running" / "Outreach is on. Here's your routine." with "— First connection requests go out. When someone accepts, they get your message." and "— Open Overview to see who accepted and who replied."; "Your first connection request will begin automatically. You can leave this page." Error: "Outreach could not be started. Review the setup and try again." | sequence `active`; Play enrolled | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/onboarding/activation/start`, `/api/onboarding/play/enroll`) |
| 12 | (Optional) Invite team, connect AI | "Invite your team" (comma-separated emails); "Set up with AI" → "Choose your AI tool" → copy command / client ID → "Setup is done. Go back to your chat…". | invites; MCP credential | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/onboarding/mcp-credential`) |

Alternative branch (AI-planned campaigns): after step 2, "Build your first campaign" → "Building your campaigns" → "Creating each Play" → "Setting who each campaign reaches" → "Review your campaigns" → "Your campaigns start as soon as their accounts are connected." [OBSERVED: `STRINGS`; `API-NOTES` §1.27 `plan_campaigns` / `build_campaigns`].

**AREVEI equivalent.** Same spine with four changes: (1) order fixed as company → ICP → source → sample → review → campaign draft → accounts → billing → launch, with a visible stepper; (2) lead sources in P1 are CSV/paste, people search, named accounts and webhook signups only (see inventory §4); (3) account connection happens **before** the lead sample when the source needs an account (network leads, engagers), otherwise after; (4) trial is card-required with a $0 Checkout session; we do not run a $1 hold unless Stripe requires it for the payment method (ASSUMPTION).

---

## Flow 3 — Create an Audience (Play) and find people

| # | User action | System response | Data touched | Evidence |
|---|---|---|---|---|
| 1 | Opens Plays → **New Play** | Template picker: "Companies hiring", cold Plays (LinkedIn / email / X / multi-channel), post engagers, webhook signups, HubSpot form signups, X sources; strings "Cold outreach", "Who do you want to reach?", "Who to reach". | Play (draft) | OBSERVED: `NOTES` §3, §13; `ROUTES` (`/plays/new`); `STRINGS` |
| 2 | Fills targeting | Fields "Who do you want to find?", "Company is hiring for", "Job posted within" (7/14/30/60/90), "Backed by"; API `hardFilters` (inventory §3). | targeting JSON | OBSERVED: `NOTES` §3; `API-NOTES` §4.1 |
| 3 | Checks size | "Audience size not checked yet." → "Finds about {n}" with "Costs 1 Energy for each profile found, so up to {n}"; up to 3 sample people; max 3 counted checks per day. Empty: "Nobody in this audience works at a company that raised money in the last 90 days." | none (no Energy) | OBSERVED: `STRINGS`; `API-NOTES` §4.2 |
| 4 | Confirms targeting summary | `run:false` → `plan.targetingSummary`, `ambiguities[]`, `companyResolution`, `readyToRun`; 409 `targeting_needs_clarification` when ambiguous. | Play revision | OBSERVED: `API-NOTES` §4.2 |
| 5 | Runs | Background job: "Finding people who match…" / "Looking for people who fit…"; MCP polls `get_people_search`; 2 Energy per person; 402 `energy_exhausted` → "Add Energy or update your workspace allocation to start finding people." | review batch `sample_ready`, candidates | OBSERVED: `STRINGS`; `API-NOTES` §4.2 |
| 6 | Reviews candidates | List with `matchReason`, `evidence`, `linkedinVerified`, `recentActivityAt`; decides `good_fit` / `not_a_fit` with optional `feedbackReason` / `feedbackNote`; `finish:true` requires all decided (409 `all_candidates_require_a_decision`). | decisions | OBSERVED: `API-NOTES` §1.13, §2.4 |
| 7 | Enrols | Good fits enrolled into per-decision `sequenceId` > call `sequenceId` > Play default; summary `addedCount`, `duplicatesSkipped`, `alreadyInvitedCount`; "Imports skip people already in your workspace. You can find them in Leads." | leads (stage `queued`) | OBSERVED: `API-NOTES` §1.13; `STRINGS` |
| 8 | Optional: auto-add / refill | "Automatically add new matches" / "Turn off to review each person before they join a campaign."; Play refill skips companies already worked. | Play settings | OBSERVED: `STRINGS`; `NOTES` §3 |

**AREVEI equivalent.** Identical two-phase run and review. Differences: audience "size check" is free and limited to 5/day; candidates show a 0–100 score with sub-scores (P2); auto-add defaults **off** for every source.

---

## Flow 4 — Build or edit a Campaign (sequence)

| # | User action | System response | Data touched | Evidence |
|---|---|---|---|---|
| 1 | Creates a sequence | Chooses template (`linkedin`, `email`, `linkedin_email`, `linkedin_email_parallel`, `all_channels`, `branching_flow`); default follow-ups +2/+3/+5 days. | sequence `draft`, revision 1 | OBSERVED: `API-NOTES` §1.7, §3.9 |
| 2 | Picks execution model | "Steps run in order" (linear) / "Each channel follows its own schedule." (tracks) / "Switch channels based on what they do" (graph; may be feature-gated: "Sequences that switch channels are not turned on for this workspace yet."). | `executionModel` | OBSERVED: `STRINGS`; `API-NOTES` §3.3 |
| 3 | Adds steps on the canvas | "Drag steps onto + · Drag the background to pan", "Fit sequence to canvas", "Expand sequence canvas"; step drawer "Step details" / "Close step details"; validation "step 0 must be connect", "steps required", "Add a subject to the first email before saving.", "Write the selected message before saving.", "Write the comment before approving it." | steps[] | OBSERVED: `STRINGS`; `API-NOTES` §3.1 |
| 4 | Writes copy | "Write your message…" / "Write your email…"; **Write with AI**; tokens with sample preview: "Preview with sample values. Nothing is sent from here."; variants: "Add message variant" / "Add email version". | `messageTmpl`, `variants[]` | OBSERVED: `STRINGS`; `API-NOTES` §3.5–3.6 |
| 5 | Saves draft | "Draft saved. Nothing is sending."; failure "Could not save sequence." / "Could not confirm the save. Retry to continue it."; unsaved guard "You have unsaved edits from this tab." / "This browser could not keep a recovery copy. Save before leaving." | revision +1 | OBSERVED: `STRINGS`; `API-NOTES` §1.8 |
| 6 | Approves | `set_sequence_status approved` with `expectedRevision` → `approvedRevision`; content change later → `approvalInvalidated`. 409 `sequence_approval_required` if activating unapproved. | status | OBSERVED: `API-NOTES` §2.1 |
| 7 | Activates / pauses | `active` ↔ `paused`; "Saved and paused."; paused "halts future sequence work; already dispatched actions cannot be recalled"; `executionBlockReason` explains an active-but-idle sequence. | status | OBSERVED: `API-NOTES` §2.1 |
| 8 | Edits a running sequence | If the step was possibly received: "This edit changes a message someone may already have received. Save your edits as a new sequence to use them for untouched leads." → modal "Save these changes in a new sequence?" with **Create new sequence** / **Keep this sequence running**; result "Saved and paused. Start the new sequence when you're ready." and "1 linked Play kept its current sequence. Review it in Plays." If safe: "Saved. The sequence keeps running with these steps." Model switch blocked: "This sequence already has people moving through it, so its channels can no longer switch…". | new sequence (paused), Play link | OBSERVED: `STRINGS`; `API-NOTES` §3.4 (409 `sequence_edit_would_repeat`) |
| 9 | Revision conflict | "The selected workspace changed. Reload this page before saving." / "This sequence is no longer available. Refresh the page to continue." / 409 `sequence_revision_conflict`. | — | OBSERVED: `STRINGS`; `API-NOTES` §11 |
| 10 | Removes a channel | "Channel removal is available for draft sequences." / "Reload this sequence before removing a channel." / "This sequence is no longer a draft. Its channel has been restored." | steps | OBSERVED: `STRINGS` |

**AREVEI equivalent.** Same state machine and "save as new" rule. Differences: linear + tracks in P1, graph in P2; InMail and Instagram steps absent; every LinkedIn step shows a "runs via provider / manual" badge depending on the connected account's capability (ASSUMPTION).

---

## Flow 5 — Connect LinkedIn / email / X accounts

| # | User action | System response | Data touched | Evidence |
|---|---|---|---|---|
| L1 | Clicks **Connect LinkedIn** | "Choose one way to connect": hosted login ("Authorize PumpGTM in a separate window, then return here. This card updates when the connection is confirmed."), signed-in browser session, or pasted session cookie (Cookie-Editor instructions; "Only LinkedIn session cookie li_at and optional premium cookie li_a are forwarded."). | sender `pending` | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/unipile/custom-auth`); `HEADERS` (`frame-src *.unipile.com`) |
| L2 | Completes 2FA | Status → `connected`; errors "LinkedIn didn't accept that email and password.", "This is a different LinkedIn account. Sign in to the account shown in Accounts…", "This connection session expired. Start again.", "The secure connection route is temporarily unavailable. Try again shortly.", "LinkedIn connection is not available for this workspace right now." Seat limit: "All LinkedIn accounts included in your plan are connected." | sender `connected`, `timezone`, `proxyCountry` | OBSERVED: `STRINGS`; `API-NOTES` §1.3 |
| L3 | Views health | Warm-up mode, `dailyInviteCap` 1–30, `effectiveDailyCapToday`, `invitesSentToday`; "Awaiting health checks", "Warm-up data unavailable", "Saved limits:". | sending limits | OBSERVED: `API-NOTES` §1.3; `STRINGS` |
| E1 | Clicks **Connect email** | Choices: "Gmail / Google Workspace" (**Connect with Google**), "Sign in with Microsoft", "Connect any mailbox" (IMAP/SMTP + app password). | mailbox | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/email/mailboxes`) |
| E2 | Completes OAuth | Live check of send + read before save; errors: "Google signed you in, but Gmail refused reading replies… IMAP", "…refused sending… SMTP", "Google sign-in was cancelled. Try again.", "Microsoft says "Need admin approval"?", "Microsoft signed you in, but that account has no Outlook mailbox…". Admin help: "Allow PumpGTM in Google Workspace" with path "Security → Access and data control → API controls → Manage app access". | mailbox `connected`, daily limit, window | OBSERVED: `STRINGS`; `NOTES` §6 |
| E3 | Chooses mailbox for a campaign | "Choose the inbox this email campaign will send from." / "Use this inbox and continue"; "Search mailboxes"; "Connect a sender on Accounts before importing leads." | sequence email settings | OBSERVED: `STRINGS`; `API-NOTES` §3.8 |
| X1 | Clicks **Connect X** | "X opens in a new tab. Allow access there, then come back: this page moves on by itself."; owner/admin only; "A teammate already connected that X account. Ask them to share it…"; failure "That X connection did not work. Try again." | X account `{userId, handle}` | OBSERVED: `STRINGS`; `ENDPOINTS`/`ROUTES` (`/api/integrations/x/authorize`); `API-NOTES` §1.4 |
| All | Returns | "Approved campaigns start as soon as X is connected." / "…as soon as your inbox is connected."; "This connection is no longer available. Refresh Accounts and try again." | — | OBSERVED: `STRINGS` |

**AREVEI equivalent.** LinkedIn: **hosted-auth only** through our authorized provider account; no browser-session or cookie options; if the provider is unavailable for a workspace, LinkedIn steps become **manual tasks** (user performs, then marks done). Email: same three paths with our own OAuth apps. X: same official OAuth with our app. Instagram: not offered.

---

## Flow 6 — Daily send loop

| # | Trigger | System behaviour | Data touched | Evidence |
|---|---|---|---|---|
| 1 | Scheduler tick (reference: six-minute runs, ~1 in 4 acts) | Picks eligible leads for active sequences within the account's working hours (8am–6pm account time zone) and the email sending window (e.g. "Mon to Fri · 8:00 AM to 6:00 PM · America/Los_Angeles"). | queue | OBSERVED: `NOTES` §5–6 |
| 2 | LinkedIn budget | Warm-up ramp 5/7/10/15/16/20 (73 over six days), then `dailyInviteCap` 1–30; `effectiveDailyCapToday = min(ramp, cap)`; ≤100 profile views/day; ≤100 messages/likes/day shared; 5–30 s random waits. "If you ask for more on day one, PumpGTM holds the rest for later." | `invitesSentToday`, `remainingToday` | OBSERVED: `NOTES` §5; `API-NOTES` §10.2 |
| 3 | Email budget | Per-mailbox daily limit (mock: "38 / 40 today"); follow-ups stay in thread; plain text; List-Unsubscribe. Missing email → step skipped and logged ("email_skipped"). | activity rows | OBSERVED: `NOTES` §6; `API-NOTES` §7.4 |
| 4 | X budget | ≤100 DMs/day per workspace, random gaps; skips existing threads, empty bios, <20 followers, DMs closed; "If X pushes back, PumpGTM waits." | activity rows | OBSERVED: `NOTES` §7 |
| 5 | Activity gate (optional) | "Check for activity in last 30 days" skips people with no posts/comments; runs in background and "can lower how many people are invited each day". | lead `skipped` | OBSERVED: `STRINGS` |
| 6 | Invite declined by LinkedIn | Invites stop for that account; one test invite after 24 h, then 48, then 72; webhooks `linkedin.limited` (attempt 1..3) → `linkedin.resumed`. | account hold | OBSERVED: `NOTES` §5; `API-NOTES` §2.10 |
| 7 | Reply detected (any channel) | All remaining steps for that person cancelled across channels; lead stage `replied`; reply enters Inbox; "Follow-ups stopped" in timeline; graph model additionally checks prior conversations before each outreach node ("a human reply stops the flow; unavailable evidence holds it"). | lead frozen; pending reply | OBSERVED: `NOTES` §5, §9; `API-NOTES` §3.3; `QUICKSTART` §4 |
| 8 | Billing state lost | "Cardless execution has stopped. Your LinkedIn connection, approved leads, copy, learning, and campaign state are preserved."; resumes only on verified Stripe state. | execution block | OBSERVED: `STRINGS` |
| 9 | Morning digest | "Each morning" notification (preferences endpoint). | notifications | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/notifications/preferences`); INFERRED as a daily digest |

Lead stage vocabulary (MCP): `queued → resolving → invited → accepted → messaged → followed_up → replied`, exits `failed`, `skipped` [OBSERVED: `API-NOTES` §2.2]. REST examples also show `connected` and `meeting_booked` — unresolved discrepancy.

**AREVEI equivalent.** Same gates (working hours, warm-up ramp, daily caps, reply-stop, invite hold) implemented in our own job scheduler. Differences: no randomised "skip 3 of 4 runs" disguise; jitter is bounded only to respect provider rate limits; default LinkedIn cap 20; stage enum fixed to `queued, resolving, invited, accepted, messaged, followed_up, replied, meeting_booked, failed, skipped, opted_out` (ASSUMPTION).

---

## Flow 7 — Reply handling

| # | User action | System response | Data touched | Evidence |
|---|---|---|---|---|
| 1 | Reply arrives | Webhook `reply.received {replyId, lead, classification, theirMessage, draft}`; activity `reply_detected` then `reply_drafted`; Inbox "Needs you" list gains an item; Slack notice for X. | pending reply | OBSERVED: `API-NOTES` §8, §7.4; `NOTES` §7, §10 |
| 2 | Opens Inbox | One list across LinkedIn, email, X (Instagram in MCP); filter "Needs you"; search "Search email, sender or status"; thread pane with prospect header ("Prospect C, ML Platform Lead, Company C, Liked your post on X") and per-day events; "Scroll down to see more messages". | — | OBSERVED: `NOTES` §10, §13; `STRINGS` |
| 3 | Reads the AI draft | "drafts a reply. Approve or edit it in Inbox."; booking link inserted "when they're ready to talk"; `allowedDecisions[]` per item ("X drafts accept everything but invite"; draft-less X: only send/snooze/dismiss/opt_out/meeting_booked). Encrypted X chat: "theirMessage null" + `unlockUrl`. | draft | OBSERVED: `API-NOTES` §1.14, §6; `NOTES` §10 |
| 4 | Decides | `send` (draft or edited `text`), `invite`, `booking_link`, `snooze {days}` (default 3, then 7), `start_sequence`, `meeting_booked`, `dismiss`, `opt_out` (permanent). Same text twice → `alreadyDecided`. Errors: "The decision could not be saved."; "The reply ended." | reply closed; activity `reply_sent` / `reply_dismissed` / `reply_snoozed` / `meeting_booked` | OBSERVED: `API-NOTES` §1.16, §2.11, §7.4; `STRINGS` |
| 5 | (Partner-only) schedules | `sendAt` ≤30 days, `Idempotency-Key`; worker every minute; `held` on stale approval → `reapprove`. | scheduled reply | OBSERVED: `API-NOTES` §1.15, §2.12 |
| 6 | Person writes again | Item returns to "Needs you". | pending reply | OBSERVED: `API-NOTES` §2.11 |

**AREVEI equivalent.** Same eight decisions and list/thread layout. Differences: classification enum is ours (inventory §10); scheduling available to everyone; a "manual channel" reply (LinkedIn without provider) shows the draft with **Copy** and **Mark as sent** instead of **Send** (ASSUMPTION).

---

## Flow 8 — Add leads via API, webhook or CSV

| # | User action | System response | Data touched | Evidence |
|---|---|---|---|---|
| A1 | `POST /sequences/{id}/leads` with `contacts[]` / `manual[]` / `csvContent` / Sales Navigator `listUrl` | Sync result `{method, addedLeadIds, summary{submittedCount, addedCount, duplicatesSkipped, invalidSkipped, alreadyInvitedCount}, contacted:false}`; adding to a draft "approves and starts it"; 409 `linkedin_not_connected`, `lead_import_csv_*`. | leads | OBSERVED: `API-NOTES` §1.34, §2.1, §11 |
| A2 | Sales Navigator import | Async `importStatus` `processing → waiting → finalizing → completed | failed`; "Export from the Sales Navigator tab where you are signed in so that session is included." | import batch | OBSERVED: `API-NOTES` §2.8; `STRINGS` |
| W1 | Form posts to `POST /plays/{id}/webhook` | `dryRun:true` → `validated`; live → `review` or `queued` (auto-add with linked approved active sequence); replay with same `eventId` → `reused`; body ≤8 KB. "Send each signup to one URL." | candidate / lead | OBSERVED: `API-NOTES` §1.6, §2.15; `STRINGS` |
| C1 | Drops CSV / Excel / PDF or pastes text | Column mapping to tokens: "Each column fills a token you can write in any message, exactly as in your file. Clear a token to skip its column. A blank cell sends empty, or write a fallback like …"; "Extra columns"; "Not imported" rows; "Imports skip people already in your workspace."; too large: "Split it into smaller files and import each one."; "Find LinkedIn profiles from email" toggle (metered). Guards: "Connect a sender on Accounts before importing leads.", "This workspace can't add leads right now. Check your plan in Settings.", "Your session ended. Sign in again, then retry the import." | leads, custom fields | OBSERVED: `STRINGS`; `ENDPOINTS` (`/api/campaign/leads`, `/api/campaign/parse-pdf`); `API-NOTES` §10.1 |
| All | Dedup | Existing identity by LinkedIn URL / email / X handle counted as `duplicatesSkipped`; existing leads never reassigned to another sender. | — | OBSERVED: `API-NOTES` §1.11 |

**AREVEI equivalent.** Same endpoints in spirit (own paths). Differences: PDF parsing P2; Sales Navigator import only if the authorized provider supports it; email→LinkedIn matching P2.

---

## Flow 9 — Analytics review

| # | User action | System response | Data touched | Evidence |
|---|---|---|---|---|
| 1 | Opens Overview | Funnel invited → accepted → messaged → replied → meetings booked; queue depth; per-account "today's connection-request budget"; "Outreach today", "Invites sent". | read | OBSERVED: `QUICKSTART` §2; `STRINGS`; `ROUTES` (`/overview`) |
| 2 | Picks range / scope | `range 7d|30d|90d`, `scope workspace|team`; "Report scope". | read | OBSERVED: `API-NOTES` §7.1; `STRINGS` |
| 3 | Reads totals and tables | Per Play → sequences → message steps; per channel; metrics `enrolled, touched, invites, connections, messages, replies, meetings, mature, cohortReplies, replyRate`; UI labels "14-day eligible people", "14-day replies", "14-day reply rate", "Attributed replies", "First replies", "Leads touched", "Recorded meetings", "Meeting coverage"; "Not available in this report" for unsupported cells. | read | OBSERVED: `API-NOTES` §7.1; `STRINGS` |
| 4 | Reads rankings | Highest/lowest Play and message by reply rate; null until ≥2 non-tied results with ≥30 eligible people each. | read | OBSERVED: `API-NOTES` §7.1 |
| 5 | Reads variant results | `messages[].variant`, `experimentArms`; "Variant results are temporarily unavailable." | read | OBSERVED: `API-NOTES` §1.10; `STRINGS` |
| 6 | Opens Activity | Filters by action and outcome; `count` = full total; append-only. | read | OBSERVED: `API-NOTES` §7.4 |

**AREVEI equivalent.** Same metric definitions (14-day window, last-message attribution, minimum ranking sample). Differences: workspace time zone; rankings and variants P2; explicit "data freshness" timestamp on every report (ASSUMPTION).

---

## Flow 10 — MCP / agent-driven flow

| # | Agent call | System response | Data touched | Evidence |
|---|---|---|---|---|
| 1 | Connect client (`claude mcp add --transport http … && claude mcp login …`) | OAuth 2.1 dynamic registration + PKCE; "no key goes in their config"; custom agents use bearer key. | token | OBSERVED: `QUICKSTART` §3; `API-NOTES` §0 |
| 2 | `get_workspace` | Summary: `readyNow`, company, billing, senders with health, Play types and sequence states, review coverage, period results, attention codes (`leads_waiting_for_input`, `sender_file_reconnect_required`, `company_profile_unconfirmed`), `energy`, `setup.nextStep {say, url}`, and a `next` hint. | read | OBSERVED: `API-NOTES` §1.1, §9 |
| 3 | `preview_workspace_setup` → `save_workspace_setup` (if unconfirmed) | Reviewer changes + `reviewToken`; save requires token; "Saving the company confirms it". | profile, `setupRevision` | OBSERVED: `API-NOTES` §9 |
| 4 | `check_campaign` | Audience count, `audience.say`, ≤3 sample people, `audienceChecksToday`. | none | OBSERVED: `API-NOTES` §4.2 |
| 5 | `find_people` `confirmed:false` | Saves Play, returns targeting summary + `next` requiring confirmation. | Play | OBSERVED: `QUICKSTART` §4; `API-NOTES` §4.1 |
| 6 | `find_people` `playId`, `confirmed:true`, `requestId` | Background `operationId`; poll `get_people_search` until `completed`; candidates. | batch | OBSERVED: `API-NOTES` §4.2 |
| 7 | `review_people` decisions, `finish:true` | Each `good_fit` enrolled immediately; counts + `reviewUrl`; "Still nothing sent." | leads | OBSERVED: `QUICKSTART` §4; `API-NOTES` §1.13 |
| 8 | `save_sequence_draft` | Validates steps (style rules listed in tool description); draft revision. | sequence | OBSERVED: `API-NOTES` §2.1, §3.9 |
| 9 | `set_sequence_status approved` with `expectedRevision`, then `active` | "records the approval and makes it live in the same call"; outreach paced in the engine. | status | OBSERVED: `API-NOTES` §2.1 |
| 10 | `list_pending_replies` → `decide_reply` | Drafts; decisions as Flow 7; `decidedBy` default `mcp`. | replies | OBSERVED: `API-NOTES` §6 |
| 11 | Errors | `isError:true {status, retryable, changed, message, details}`; `energy_exhausted` returns needed/left + one link; blocked tools return `setup.nextStep`. | — | OBSERVED: `API-NOTES` §11, §9 |

Resources and prompts: `gigacatalyst://lead-search/{catalog,quickstart,fields,query-builder,patterns,results}` and prompt `gigacatalyst_find_people` [OBSERVED: `API-NOTES` §0].

**AREVEI equivalent (P2).** Same shape: `get_workspace` → `find_people` (two-phase) → `review_people` → `save_campaign_draft` → `set_campaign_status`. Differences: tool names use our vocabulary (audience/campaign); every mutating tool requires `requestId`; `next` hints kept; no Energy — our `credits` tool; AEO and CRM tool groups absent.

---

## Appendix — State strings catalogue (for our copy deck, as evidence only)

| Category | Reference examples (OBSERVED: `STRINGS`) |
|---|---|
| Loading | "Preparing your workspace", "Loading people…", "Loading your saved sequence", "Checking your campaigns…", "Setting up your outreach…", "Sending code…", "Creating image…", "Opening calendar…" |
| Empty | "No sample people found for this audience yet.", "No mailboxes match your search.", "No actions match that search.", "Conversations not available yet.", "Nothing to set up from these answers." |
| Error (retryable) | "Could not save. Please try again.", "That did not save. Try again.", "Could not confirm the save. Retry to continue it.", "We couldn't check the connection.", "Try again to pick up where you left off." |
| Error (stale state) | "Reload this page before saving.", "Your company details changed. Reload this page and try again.", "This item is no longer available in this workspace. Reload the page.", "Your session expired. Refresh this page to sign in again." |
| Reassurance | "Nothing sends until you approve the messages.", "Draft saved. Nothing is sending.", "No outreach will be sent", "Preview with sample values. Nothing is sent from here." |
| Success | "Audience choices saved", "Leads approved", "Order confirmed", "You're all set", "Your outreach is running" |
| Not found | "404 · Page not found", "This page took a detour.", "A small detour. A clear way back.", "The link may be old, or the page may have moved." |
