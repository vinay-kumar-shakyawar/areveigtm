# AREVEI GTM — UI analysis (reverse-engineered from PumpGTM public surfaces)

Status: working document, 2026-11-17. Companion documents: `feature-inventory.md`, `user-flows.md`.

Labels and citation abbreviations are defined in `feature-inventory.md` (**OBSERVED / INFERRED / ASSUMPTION**; `STRINGS`, `ROUTES`, `ENDPOINTS`, `HEADERS`, `A11Y-APP`, `A11Y-HOME`, `NOTES`, `API-NOTES`). Screenshots are under `screenshots/`.

Scope reminder: the only app screen captured live is the unauthenticated sign-in page. Everything about authenticated screens is reconstructed from bundle strings (which include Tailwind class strings and ARIA labels), route candidates, and marketing mock-ups, and is labelled accordingly. The final section describes AREVEI's **own** visual identity and information architecture; nothing visual is to be copied.

---

## 1. Navigation structure

### 1.1 Marketing site (pumpgtm.com)

Source: `A11Y-HOME` accessibility tree; `screenshots/pumpgtm_com.png`, `pumpgtm_com_pricing.png`, `pumpgtm_com_docs_mcp.png`, `pumpgtm_com_integrations_linkedin.png`.

| Element | Content | Evidence |
|---|---|---|
| Skip link | "Skip to content" (first link in tree) | OBSERVED: `A11Y-HOME` |
| Cookie banner | "Cookies help us see which companies visit." with "Details", "No", "OK" | OBSERVED: `A11Y-HOME` (buttons "No", "OK", link "Details"); screenshots |
| Primary nav (`navigation` "Main navigation") | Logo link "PumpGTM home"; dropdown buttons **Features**, **Use cases**, **Industries**, **Integrations**, **Resources**; links **Done For You**, **Pricing**; CTA **Find Buyers** (changes per page: "Explore the Signals API", "Explore the API", "Build your outreach") | OBSERVED: `A11Y-HOME`; all marketing screenshots |
| Hero | h1 "We find and engage with buyers desperate for your product, across LinkedIn, X, and email."; textbox "Work email or company website"; button "Find Buyers"; "Talk to Founder"; "Backed by Y Combinator" | OBSERVED: `A11Y-HOME`; `screenshots/pumpgtm_com.png` |
| Section headings (h2) | "Same AI, same tasks. With and without PumpGTM.", "Trusted by the top startups in SF", "From the right people to replies in your inbox.", "Find your buyers in 2B+ contact data.", "Narrow it to the people ready to buy.", "Message them on LinkedIn, email and X.", "Run all of it from one AI.", "AI drafts your answer when they reply.", "Every conversation in one inbox.", "Why I built PumpGTM", "Learn from our guides", "Questions before you start.", "Stop paying for three tools to find one buyer.", "Start finding buyers, today" | OBSERVED: `A11Y-HOME` |
| Testimonial carousel | Ten buttons "Show testimonial from {name}"; "Pause/Play testimonial and logo animations" | OBSERVED: `A11Y-HOME`; `STRINGS` |
| Footer groups | FEATURES (Keyword listening, LinkedIn Social Listening, Signals API, People data index, How it works, All integrations, Skills & Prompts, Pricing), INTEGRATIONS (LinkedIn, X, Email, WhatsApp (beta), Lead Magnet Play, LinkedIn + Email Play, X Likers Play, X account automation, Send cakes in sequences, Compare, Developer docs: MCP and API), GUIDES, SOLUTIONS (industries, "Switch from HeyReach or Dripify", "Competitor post engagers", "Companies that are hiring", "Customers like your best ones", "Event attendees", "Signups who went quiet"), COMPARE, USE WITH AI (Claude, Claude Code, ChatGPT, Codex, Cursor, Grok, Gemini, Muse, OpenAI Dots), COMPANY (About, Contact, YC founders, YC investors, Ambassadors, Leave a review, Privacy and security, Privacy, Terms, Privacy choices) | OBSERVED: `A11Y-HOME` |
| Docs sub-navigation | Left rail "DEVELOPER DOCS": Overview, Quickstart, PumpGTM MCP server, PumpGTM REST API, People data API, People data MCP, Signals, Signals API, Signals MCP and Events; "MACHINE-READABLE": OpenAPI 3.1 spec, MCP tool schema (tools.json), Site index for agents (llms.txt), Platforms and agencies guide, GitHub links; breadcrumb "PumpGTM / Developer docs" | OBSERVED: `screenshots/pumpgtm_com_docs_mcp.png` |
| Integrations sub-navigation | Tabs "All integrations · LinkedIn · X · Email · WhatsApp Beta" | OBSERVED: `screenshots/pumpgtm_com_integrations_linkedin.png` |

### 1.2 App (app.pumpgtm.com)

Route candidates come from the public JavaScript bundle; the extraction tool reports every row with `confidence: low` and lists analysis limitations (heap exhausted on several chunks), so the list is **incomplete** [OBSERVED: `ROUTES` `limitations`]. "Left nav" placement is OBSERVED only for MCP ("open MCP in the left nav" — `QUICKSTART` §1); all other sidebar placements are INFERRED.

| Route | Label in evidence | Status | Evidence |
|---|---|---|---|
| `/onboarding` (+ `/onboarding/verify-email`, `/onboarding/done-for-you`) | Sign-in / setup wizard | OBSERVED | `ROUTES`; `A11Y-APP`; `HEADERS` |
| `/overview` | **Overview** — "Open Overview to see who accepted and who replied."; "You can connect later from Overview." | OBSERVED route; dashboard content INFERRED from `QUICKSTART` §2 (`/progress`) | `ROUTES`; `STRINGS` |
| `/leads` | **Leads** — "You can choose leads anytime from Leads."; "Imports skip people already in your workspace. You can find them in Leads." | OBSERVED | `ROUTES`; `STRINGS` |
| `/plays/new` (+ `?story=webhook-signups`); `/plays` list | **Plays** — "Open Plays, choose New Play"; "Review it in Plays.", "You can add them in Plays after setup." | `/plays/new` OBSERVED in `ROUTES`; `/plays` list page OBSERVED only in marketing/docs text | `ROUTES`; `NOTES` §3, §13; `STRINGS` |
| `/inbox` | **Inbox** — "Approve or edit it in Inbox."; "Needs you" | INFERRED (route not in `ROUTES`; named in strings and marketing) | `STRINGS`; `NOTES` §10 |
| `/accounts`, `/accounts/email` | **Accounts** — "Refresh Accounts and try again.", "Connect a sender on Accounts before importing leads.", "the account shown in Accounts" | `/accounts/email` OBSERVED; `/accounts` INFERRED | `ROUTES`; `STRINGS` |
| `/x` | X connection page ("Connect your X account") | OBSERVED (marketing URL) | `NOTES` §13 |
| `/signals`, `/signals/social-listening` | **Signals** — account listening and keyword listening | OBSERVED (marketing URLs) | `NOTES` §13 |
| `/team` | **Team** — invitations | INFERRED (named in task brief; strings "Invite your team") | `STRINGS` |
| `/billing` (+ `#energy`) | **Billing** — "Taking you to Billing.", "Change plan on Billing" | OBSERVED | `ROUTES`; `NOTES` §13; `STRINGS` |
| `/install-mcp` | **MCP** — "open MCP in the left nav, and copy the workspace key"; "MCP settings" | OBSERVED | `ROUTES`; `QUICKSTART` §1; `NOTES` §13 |
| `/gifts/designs/new` | Gifts / cake designer | OBSERVED | `ROUTES` |
| Settings | "Check your plan in Settings.", "Add your company website in Company settings" | INFERRED (no route captured) | `STRINGS` |
| "Comments" | "Every comment waits for your approval in Comments" | INFERRED sub-page or tab | `STRINGS` |
| "Waiting for you" | per-person input queue — "Add each person's file in "Waiting for you" above" | INFERRED section within a sequence/lead page | `STRINGS` |
| 404 | "404 · Page not found", "This page took a detour.", "A small detour. A clear way back." | OBSERVED | `STRINGS` |

---

## 2. Layout and visual language

### 2.1 Marketing site (OBSERVED from screenshots)

| Attribute | Observation | Evidence |
|---|---|---|
| Theme | Dark, near-black background (approx. `#0b0d12`) with a faint grid texture behind the hero; no light mode seen. | `screenshots/pumpgtm_com.png`, `_pricing.png`, `_signals.png`, `_people.png` |
| Typography | Geometric humanist sans (bundle string "'Hanken Grotesk', 'Hanken Grotesk Fallback'"; four self-hosted `woff2` preloads); hero h1 ~64px, semibold, tight tracking, centred; body ~18px grey. Second accent weight in headings via a lavender/periwinkle colour on key phrases ("for your product", "a reason to reach out.", "built for sales.", "commented."). | `STRINGS` line "'Hanken Grotesk'…"; `HEADERS` `link: … woff2`; screenshots |
| Colour | Primary CTA blue (approx. `#3b6cf5`) with a soft outer glow; accent lavender (approx. `#8b9cf5`); text white / grey-blue; "Backed by Y Combinator" in orange; borders are low-contrast grey-blue hairlines. | screenshots |
| Nav bar | Floating pill container with rounded corners and hairline border, logo left, dropdowns centre, CTA right; active item gets a darker rounded chip. | `screenshots/pumpgtm_com.png`, `_pricing.png` |
| Buttons | Pill-shaped primary (blue, white text, arrow icon "→"); secondary outlined pill ("Talk to Founder"); small rounded "OK" in cookie bar. | screenshots |
| Cards | Large radius (~16–20px), 1px hairline border, slightly lighter surface than page; pricing cards with icon tile, big price, feature list; integration card with "Available" pill and key–value rows. | `_pricing.png`, `_integrations_linkedin.png` |
| Interactive example panel | Tabs "API / MCP / Events", "Copy" button, code block in monospace, right pane "Example response" with "Signal / JSON" or "Profile / JSON" toggle; "fictional example" disclaimer. | `_signals.png`, `_people.png` |
| Density | Generous: large vertical rhythm, centred hero with max-width ~720px, two-column sections at ~1180px container. | screenshots |
| Illustrative mock-ups | Light-mode LinkedIn post card and "Messaging · Sending automatically" list with "Sent" rows, rendered as a product illustration (not the real app). | `_plays_lead-magnet.png` |

### 2.2 App sign-in page (OBSERVED live)

| Attribute | Observation | Evidence |
|---|---|---|
| Layout | Two columns on a near-black page: left — h1 "Sign in to PumpGTM" (~40px semibold), subtitle, labelled inputs, full-width blue pill **Sign in →**, "or" divider, outlined **Email me a sign-in code**; right — testimonial card (photo + quote + logo + "Backed by Y Combinator") with Previous/Next arrows. Header: logo + "Create account" outlined button. Footer: "Backed by Y Combinator" left; Terms / Privacy / Support right. | `screenshots/app_pumpgtm_com_onboarding.png`; `A11Y-APP` |
| Inputs | Dark filled fields with hairline border, 12px radius, placeholder "you@company.com", eye icon "Show password". | screenshot; `STRINGS` ("Show password", "Hide password") |
| Tokens visible in bundle classes | `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-surface-3`, `text-ink`, `text-muted`, `text-faint`, `border-line`, `border-line-soft`, `border-line-strong`, `bg-primary`, `text-primary-foreground`, `bg-danger` / `bg-danger-soft`, `bg-ok` / `bg-ok-soft`, `bg-warn` / `bg-warn-soft`, `bg-info-soft`, `ring-meeting`, radii `rounded-[10px]`, `rounded-[14px]`, `rounded-xl`, height `h-13`, easing `ease-snap`, container query `@min-[52rem]/sequence-canvas`. | OBSERVED: `STRINGS` (class strings) — INFERRED Tailwind v4 with a semantic token layer |
| Stack | Next.js on Vercel (`x-powered-by`, `x-vercel-id`); Supabase (CSP); Stripe Checkout/Billing; PostHog (localStorage/sessionStorage keys `ph_phc_…`); Cal.com; Unipile frames; Google Maps / Photon geocoding (CSP, address forms for gifts). | OBSERVED: `HEADERS`; `A11Y-APP` storage keys |

### 2.3 Authenticated app (INFERRED)

No authenticated screen was captured. From class strings and copy we infer: dark theme shared with marketing (`signin-shell flex flex-col bg-bg text-ink`), dense data pages with small text (`text-sm`, `text-xs … uppercase tracking-wide text-muted` for section labels), tabular numbers for counts (`tabular-nums`), progress bars (`h-1.5 rounded-full bg-surface-3`), pulse skeletons (`animate-pulse rounded bg-surface-2`), spinner (`border-2 border-ok border-t-transparent animate-spin`), and status chips (`bg-ok-soft text-ok`, `bg-warn-soft text-warn`, `bg-info-soft`). [INFERRED from `STRINGS` class strings]

---

## 3. Component inventory (reference product)

| Component | Evidence | Label |
|---|---|---|
| Sequence canvas with draggable steps, pan, "Fit sequence to canvas", "Expand sequence canvas", side-by-side step list; ARIA names "Sequence canvas", "Sequence flow canvas", "Sequence step list", "Sequence editor", "Sequence view", "Sequence options" | `STRINGS` ("Drag steps onto + · Drag the background to pan"); class `@min-[52rem]/sequence-canvas:static … border-l` (drawer docks to the right above 52rem) | OBSERVED strings; layout INFERRED |
| Step details drawer ("Step details" / "Close step details") with per-kind forms: subject/body, thread option ("Continue the previous email thread" / "Starts a new thread"), conditions ("Accepted, then wait"), variants, attachments, tool (`customer_input`, video), "When this runs", "Who receives this X DM" | `STRINGS` | OBSERVED strings |
| Message preview with sample values ("Preview message", "Preview with sample values…") | `STRINGS` | OBSERVED |
| Review list (candidates with reason, approve/reject, "Add selected leads", pagination "Previous page") | `STRINGS`; `API-NOTES` §1.12 | OBSERVED strings; layout INFERRED |
| Lead table with stage filters, search, removal with 5-second undo toast, move dialog | `STRINGS`; `API-NOTES` §1.33, §1.35 | OBSERVED strings |
| Inbox: list + thread pane, "Needs you" filter, draft editor with decision buttons, search | `NOTES` §10, §13; `STRINGS` | INFERRED layout from marketing mock |
| Account health panel: connection status, "Sending as you", today's count, warm-up ramp chart (Cap 5 D1 … 30 D7), daily cap editor, "Awaiting health checks" | `NOTES` §13; `STRINGS`; `API-NOTES` §1.3 | OBSERVED (marketing mock) |
| Mailbox list with per-mailbox "n / limit today", sending window, search, pagination | `NOTES` §13; `STRINGS` | OBSERVED (marketing mock) |
| Energy / billing widgets: balance, "Top up Energy", auto top-up, plan card, "Billing period", "Cancel subscription" | `STRINGS`; `API-NOTES` §1.21 | OBSERVED strings |
| Toasts via a live region "Notifications alt+T" (`toaster group`) | `A11Y-APP`; `STRINGS` | OBSERVED — INFERRED Sonner-style toaster |
| Testimonials carousel (Previous/Next, "Show testimonial from…") on sign-in and marketing | `A11Y-APP`; `A11Y-HOME` | OBSERVED |
| Onboarding progress indicator ("Onboarding progress") | `STRINGS` | OBSERVED |
| Design picker with pagination (gifts) | `STRINGS` ("Design picker pagination", "Loading designs") | OBSERVED (skipped in AREVEI) |
| Video player with captions ("Click to play with sound", "Restart video with sound", `.vtt` files) | `STRINGS`; `ROUTES` | OBSERVED (skipped) |
| Copy-to-clipboard affordances ("Client ID copied.", "Prompt copied.", "Nothing seems to happen. It has been copied.") | `STRINGS` | OBSERVED |
| Address form with geocoding ("Street address", "Suite or floor", "We couldn't check this location yet.") | `STRINGS`; `HEADERS` (maps/photon) | OBSERVED (skipped) |

---

## 4. Copywriting tone

| Pattern | Examples (OBSERVED: `STRINGS` unless noted) |
|---|---|
| Short, plain, present tense | "Draft saved. Nothing is sending.", "Saved and paused.", "Leads approved", "Outreach is on. Here's your routine." |
| Reassurance pattern "Nothing sends until…" | "Nothing sends until you approve the messages.", "Nothing sends until LinkedIn is connected and your trial starts.", "Nothing sends until you connect your accounts and launch.", "No outreach will be sent", "Preview with sample values. Nothing is sent from here." |
| Explain the consequence, then the fix | "This edit changes a message someone may already have received. Save your edits as a new sequence to use them for untouched leads." |
| Honest about uncertainty | "Generated targeting and copy are proposals, not verified facts.", "We haven't confirmed the result yet. Retry to finish the same save.", "A posting is not proof the role is still open." (`NOTES` §3) |
| Benchmarks as expectations | "Typically 1 in 5 accept your request, and 1 in 7 of them reply." |
| Direct second person, no exclamation marks | "Tell it who to reach", "Pick at least one.", "Come back here and paste." |
| Founder voice in onboarding | "A two-minute hello from our founder", "Questions? Talk to the founder" |
| Error copy names the actor | "Google signed you in, but Gmail refused reading replies.", "LinkedIn didn't accept that email and password." |
| Marketing register | Declarative headlines with one accent phrase; sentence-case; period at the end of headlines ("Your next customer just commented.") (`A11Y-HOME`, screenshots) |

---

## 5. Empty, loading and error state patterns

| State | Pattern | Examples (OBSERVED: `STRINGS`) |
|---|---|---|
| Loading (progressive narrative) | Multi-stage progress text instead of a bare spinner | "Finding your first buyers" → "Matching titles, company size and location" → "Keeping people whose current role fits" → "Checking each person" → "Lining them up"; "Drafting the first message" → "Writing the follow-up" → "Tightening the wording" |
| Loading (simple) | Ellipsis suffix | "Loading people…", "Checking your campaigns…", "Sending code…", "Setting up your outreach…" |
| Non-blocking | Let the user continue | "You can continue while we finish looking.", "Your first connection request will begin automatically. You can leave this page." |
| Empty with next action | Say why and what to change | "No sample people found for this audience yet.", "Shorten this audience to load sample people.", "Nobody in this audience works at a company that raised money in the last 90 days." |
| Empty (search) | "No {thing} match that search." | "No mailboxes match your search.", "No actions match that search." |
| Error (retry) | Short cause + "Try again." | "Could not save. Please try again.", "That X connection did not work. Try again.", "Designs couldn't load." |
| Error (stale/concurrency) | Tell them to reload | "Reload this page before saving.", "Your setup changed in another tab. Review the latest version.", "This item is no longer available in this workspace. Reload the page." |
| Error (permission) | Name the role | "Only workspace owners and admins can connect X.", "Ask a workspace admin to connect an email account." |
| Error (quota/plan) | Name the fix location | "This workspace can't add leads right now. Check your plan in Settings.", "Add Energy or update your workspace allocation to start finding people." |
| Destructive undo | Toast with countdown | ". Undo available for five seconds.", "Move cancelled", "Undoing move" |
| Preserved-state failures | Reassure what is kept | "Cardless execution has stopped. Your LinkedIn connection, approved leads, copy, learning, and campaign state are preserved.", "Checkout was cancelled. Your workspace is saved…" |

---

## 6. Accessibility observations

| Observation | Evidence | Label |
|---|---|---|
| "Skip to content" link is the first focusable element on the marketing site | `A11Y-HOME` | OBSERVED |
| Landmarks: `banner`, `main`, `contentinfo`, `navigation` ("Main navigation", "Legal and support"), `region` ("Sign in to PumpGTM") | `A11Y-APP`; `A11Y-HOME` | OBSERVED |
| Toasts in an ARIA live `region` named "Notifications alt+T" (keyboard shortcut to focus) plus an `alert` node | `A11Y-APP` | OBSERVED |
| Form inputs have visible labels ("Work email", "Password") and the password toggle is a labelled button ("Show password") | `A11Y-APP` | OBSERVED |
| Icon-only carousel controls are labelled ("Previous testimonial", "Next testimonial", "Show testimonial from {name}") | `A11Y-APP`; `A11Y-HOME` | OBSERVED |
| Canvas regions have accessible names ("Sequence canvas", "Sequence step list", "Step details", "Close step details") | `STRINGS` | OBSERVED strings |
| Focus rings on interactive elements (`focus-visible:ring-2 focus-visible:ring-primary/45`), disabled states (`disabled:opacity-50`), reduced-motion guard (`motion-safe:duration-200`), pause control for animations ("Pause testimonial and logo animations") | `STRINGS` | OBSERVED classes |
| Error helper ids linked to inputs (`signin-code-help signin-code-error`) | `STRINGS` | OBSERVED — INFERRED `aria-describedby` wiring |
| Captions for videos (`.vtt`) | `ROUTES` | OBSERVED |
| Potential issue: large grey-on-black body text and hairline borders are low contrast | screenshots | INFERRED (not measured) |

---

## 7. AREVEI design direction

Everything below is **ASSUMPTION** (our design decisions). It deliberately departs from the reference product's look.

### 7.1 Visual identity (original)

| Decision | AREVEI |
|---|---|
| Theme | **Light-first** with a true dark mode (system preference + manual toggle). Base light surface warm off-white (`#faf9f6`), dark surface deep slate (`#0f172a`) — not near-black. |
| Brand colour | Primary **teal-green** (`#0f766e` light / `#2dd4bf` dark) for actions; accent **amber** (`#d97706`) for signals/timing; no blue-glow CTAs, no lavender headline accents. |
| Typography | UI: Inter (variable) at 14px base for data pages, 16px for forms; headings 600 weight, normal tracking; numbers in tabular figures. Marketing: Inter Display or Source Serif for headlines to differentiate from the sans-only reference. |
| Shape | 8px radius on controls, 12px on cards; 1px borders at 12% contrast; shadows only on overlays. No pill buttons in the app (pill reserved for status chips). |
| Density | Two densities: **Comfortable** (default) and **Compact** (tables, inbox), switchable in Settings. |
| Iconography | Lucide icons via shadcn/ui, 16px in tables, 20px in nav. |
| Motion | 150ms ease-out for state changes; respect `prefers-reduced-motion`; no auto-playing carousels. |
| Status colours | `success`, `warning`, `danger`, `info`, `neutral` tokens with soft variants; channel colours: LinkedIn slate-blue, email teal, X graphite, WhatsApp green — used only in small chips. |

### 7.2 Information architecture (app)

Sidebar (left, collapsible to icons), in this order:

| Item | Route | Contents |
|---|---|---|
| **Dashboard** | `/dashboard` | Funnel (invited → accepted → messaged → replied → meetings), today's sending budget per account, needs-attention cards (replies waiting, leads waiting for input, accounts to reconnect, billing), activity feed. |
| **ICPs** | `/icps` | Company profile, ICP definitions (targeting objects), exclusions, scoring thresholds. |
| **Leads** | `/leads` | All people with stage, audience, campaign, sender; import (CSV/paste), review queues (`/leads/review/:batchId`), removal/undo, move. |
| **Signals** | `/signals` | Signal catalogue, hiring/funding feeds, intent tiers, listening (P3). |
| **Campaigns** | `/campaigns` | Audiences (sources) and Campaigns (sequences): list, editor (`/campaigns/:id/edit`), status, variants, email settings. |
| **Inbox** | `/inbox` | Needs-you list, thread pane, AI draft, eight decisions, scheduled replies. |
| **Analytics** | `/analytics` | Range/scope, totals, per-campaign/step/channel tables, rankings (P2), variants (P2), activity ledger. |
| **Integrations** | `/integrations` | Senders (LinkedIn via provider, email, X), webhooks, API keys, MCP install (P2), HubSpot/Slack (P3). |
| **Settings** | `/settings` | Workspace, team & roles, billing & credits, notifications, data export, danger zone. |

Top bar: workspace switcher, global search (people, companies, campaigns), "Create" menu (Audience, Campaign, Import), credits balance chip, user menu. Onboarding lives at `/onboarding` with a six-step stepper (Company → ICP → Source → Review → Campaign → Launch) and a persistent "Finish later" link.

### 7.3 Component list (shadcn/ui based)

| Component | shadcn/ui base | Notes |
|---|---|---|
| App shell | `Sidebar`, `Sheet` (mobile), `Breadcrumb` | Collapsible sidebar; keyboard shortcut `[` toggles. |
| Data tables | `Table`, `DataTable` (TanStack), `DropdownMenu`, `Checkbox`, `Pagination` | Column visibility, saved filters, bulk actions, 5-second undo toast on destructive actions. |
| Forms | `Form` (react-hook-form + zod), `Input`, `Textarea`, `Select`, `Combobox`, `Switch`, `RadioGroup`, `Slider` (daily cap), `Calendar`/`DatePicker` (snooze, schedule) | Inline validation; helper text pattern "cause + fix". |
| Targeting builder | `Command` (multi-select chips), `Badge`, `Accordion`, `Tooltip` | Live size estimate card with sample people. |
| Review queue | `Card`, `Badge`, `ToggleGroup` (good fit / not a fit), `Textarea` (reason), `Progress` | Keyboard: `j/k` next/prev, `a` approve, `r` reject. |
| Campaign editor | `ResizablePanelGroup` (steps list | canvas | step drawer), `Tabs`, `Sheet` (step details), `Popover` (add step), custom canvas (React Flow for graph model in P2), `Dialog` ("Save as new campaign?") | Fit-to-view and pan controls; step chips show channel + delay. |
| Message editor | `Textarea` with token `Command` popover, `Tabs` (Edit / Preview), `Badge` (variant A/B) | AI assist drawer. |
| Inbox | `ResizablePanelGroup` (list | thread), `ScrollArea`, `Separator`, `Button` group for decisions, `Popover` for snooze days | Unread/needs-you counters in sidebar. |
| Account health | `Card`, `Progress`, chart (Recharts bar for warm-up ramp and daily sends), `Badge` (connected / reconnect / warming) | Daily cap `Slider` 1–30. |
| Credits & billing | `Card`, `Progress`, `Dialog` (top-up), `Alert` (billing required) | Stripe Checkout redirect; portal link. |
| Notifications | `Sonner` toaster in a labelled live region; `Alert` for inline | Undo actions in toast. |
| Empty / loading | `Skeleton`, `Alert`, custom `EmptyState` (icon, one-line why, one action) | Progressive narrative text for long jobs. |
| Onboarding | `Stepper` (custom), `Card`, `Progress`, `Dialog` (connect account) | Resume banner on Dashboard. |
| Charts | Recharts via shadcn `Chart` wrapper; palette from our tokens; always with table alternative | Funnel, time series (messages/replies/invites per day), ranking bars. |
| Command palette | `Command` (`Cmd+K`) | Navigate, search people, create. |

### 7.4 Copy principles for AREVEI (own voice)

1. One sentence per state; cause before fix.
2. Every send-related screen states the current safety status in one line (our own wording of the "nothing sends until…" idea, e.g. "Sending is off until you launch.").
3. Numbers are literal ("20 of 20 invites left today"), never vague.
4. No exclamation marks; sentence case; no brand names of the reference product anywhere.
5. Manual steps are explicit: "You do this one. Mark it done when it's sent."
