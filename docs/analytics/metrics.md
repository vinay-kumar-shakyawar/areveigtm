# Metric definitions

Every number on the Analytics page is computed from stored rows (`ActivityEvent`,
`Message`, `Conversation`, `Lead`, `ReplyDecision`, `ProviderUsage`) for the selected
date range and optional campaign. Nothing is sampled or estimated. Each ratio
carries its numerator, denominator and definition in the API response
(`GET /api/v1/w/{workspace}/analytics?days=30&campaignId=…`).

| Metric | Numerator | Denominator | Notes |
|---|---|---|---|
| Contacted | distinct leads with `message.sent` or `invite.sent` | – | manual-task completions count as sent |
| Replied | distinct leads with `reply.received` | – | one lead replying on two channels counts once |
| Reply rate | Replied | Contacted | both distinct leads in range |
| Positive reply rate | conversations classified `interested` or `question` | conversations with any classification | from AI triage; manual "Interested" also sets lead status but not classification |
| Meetings | distinct leads with `meeting.booked` | – | logged from the inbox |
| Meeting rate | Meetings | Replied | |
| Bounce rate | `email.bounced` events | `message.sent` events on email | events, not leads |
| Unsubscribe rate | `unsubscribe` events | `message.sent` events on email | includes link, one-click, reply and manual opt-outs |
| Median hours to reply | median over leads of (first reply − first send) | – | leads whose first reply falls in range |
| AI drafts sent unedited | AI-generated sent messages without `editedByUserId` | AI-generated sent messages | campaign messages and inbox replies |
| Auto-sent replies | `ReplyDecision` rows with `decidedVia = auto` | – | only possible when the workspace enabled auto-send |

## Funnel (distinct leads)

Discovered → Approved → Enrolled (`sequence.started`) → Contacted → Replied →
Qualified (`lead.qualified`, set manually or by AI triage) → Meeting booked.
Discovered/Approved use lead rows created in range, so they are counts of a cohort;
later stages use events in range and may include leads created earlier. Stages are
not guaranteed to be monotonic for that reason.

## Channel table

Per channel: sent, delivered (`message.delivered`, only when the provider reports
it), replies, bounces + complaints, manual tasks created, and reply rate
(distinct leads replied on that channel / distinct leads contacted on that channel).

## Campaign table

Enrolled is the live count of enrolments; the rest are events in range attributed
to the campaign. Reply rate = distinct leads replied / distinct leads contacted
inside the campaign.

## Sender table

Per sending account: sent, replies, bounces, failed sends, bounce rate (bounced /
sent on that sender) and the configured daily limit.

## Provider usage

Calls, units and estimated cost per provider and operation from the
`ProviderUsage` ledger. Costs are estimates recorded by adapters at call time and
default to zero where a provider does not publish per-call pricing.
