# REST API

Base path: `/api/v1`. All responses are JSON. Errors use one envelope:

```json
{ "error": { "code": "invalid_request", "message": "…", "retryable": false, "issues": [ … ] } }
```

Codes: `unauthorized` (401), `forbidden` (403), `not_found` (404), `invalid_request` (400), `conflict` (409), `rate_limited` (429), `not_configured` (409), `provider_error` (502), `internal` (500). Every response carries `x-request-id`.

## Authentication

- **Session cookie** (`arevei_session`) for the web app. Mutations must come from the app's own origin.
- **API key**: `Authorization: Bearer agk_…`. Create keys under Settings → API keys (scopes `read`, `write`, `admin`). A key belongs to one workspace; `read` keys get 403 on any mutation. Endpoints that handle credentials or OAuth are session-only.

Rate limits: 300 requests/minute per user or key by default; stricter routes (test sends, domain checks, regeneration) have their own smaller buckets. `429` responses include `details.retryAfterSec`.

## Idempotency

Write endpoints that create work accept a `requestId` (`^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$`). Replaying the same `requestId` with the same body returns the original result with `replayed: true`; a different body returns 409.

## Pagination

List endpoints return `{ items, nextCursor }`; pass `cursor` to continue. `limit` is capped per endpoint.

## Endpoints

Workspace-scoped routes live under `/api/v1/w/{workspace}` where `{workspace}` is the slug or id.

| Area | Endpoints |
|---|---|
| Account | `GET /me`, `GET/POST /workspaces` |
| Workspace | `GET/PATCH …/settings`, `GET/POST …/members`, `PATCH/DELETE …/members/{userId}`, `GET …/notifications`, `GET …/search?q=` |
| Integrations | `GET/POST …/integrations`, `PATCH/DELETE …/integrations/{id}`, `POST …/integrations/{id}/test` |
| Company & ICP | `GET/PATCH …/company`, `POST …/company/draft`, `POST …/company/approve`, `GET/POST …/icps`, `GET/PATCH/DELETE …/icps/{id}` |
| Leads | `GET …/leads`, `POST …/leads` (CSV/API import), `GET …/leads/export`, `GET/PATCH/DELETE …/leads/{id}`, `POST …/leads/{id}/actions` (enrich, research, signals, status) |
| Discovery | `GET/POST …/searches`, `GET/POST …/searches/{id}` (preview, run, decide, import, duplicate) |
| Signals | `GET/POST …/signals`, `GET/POST …/signals/rules`, `PATCH/DELETE …/signals/rules/{id}` |
| Campaigns | `GET/POST …/campaigns`, `GET/PATCH/POST …/campaigns/{id}` (status, enrol, stop, tick), `GET/POST …/sequences`, `GET/PATCH/POST …/sequences/{id}` (approve, status, save-as), `GET …/messages`, `POST …/messages/{id}` (approve/edit/reject/regenerate), `GET/POST …/tasks` |
| Sending accounts | `GET/POST …/senders`, `PATCH/DELETE …/senders/{id}`, `POST …/senders/{id}/test`, `POST …/senders/{id}/domain-check`, `POST …/senders/{id}/sync`, `POST …/senders/linkedin/connect`, `POST …/senders/linkedin/sync`, `POST …/senders/linkedin/webhooks` |
| Inbox | `GET …/inbox?filter=all|unread|awaiting|interested|qualified|meeting_requested|not_interested|snoozed|archived&q=&campaignId=&assigned=me|unassigned|any`, `GET/PATCH …/inbox/{id}`, `POST …/inbox/{id}/read`, `POST …/inbox/{id}/decide`, `POST …/inbox/{id}/draft`, `POST …/inbox/simulate` (development only) |
| Webhooks | `GET/POST …/webhooks`, `PATCH/DELETE …/webhooks/{id}`, `POST …/webhooks/{id}/test`, `POST …/webhooks/{id}/rotate`, `GET …/webhooks/{id}/deliveries` |
| Analytics | `GET …/analytics?days=30&from=&to=&campaignId=` |
| Health | `GET /api/health` (liveness), `GET /api/ready` (database) |

Zod schemas next to each service define request bodies; the UI uses the same endpoints.

## Inbox decisions

`POST …/inbox/{id}/decide` body is a discriminated union on `decision`:

```json
{ "decision": "send", "draftMessageId": "…" }
{ "decision": "edit_and_send", "body": "…", "subject": "…" }
{ "decision": "snooze", "until": "2026-11-20T09:00:00Z" }
{ "decision": "mark_interested" }
{ "decision": "mark_not_interested", "stopSequences": true }
{ "decision": "meeting_booked", "scheduledAt": "…", "durationMin": 30, "notes": "…" }
{ "decision": "booking_link" }
{ "decision": "start_sequence", "campaignId": "…" }
{ "decision": "dismiss" }
{ "decision": "opt_out" }
```

## Outbound webhooks

Subscriptions receive `POST` requests:

```
Content-Type: application/json
X-Arevei-Event: reply.received
X-Arevei-Event-Id: evt_…
X-Arevei-Delivery: <delivery id>
X-Arevei-Signature: t=1763424000,v1=<hex HMAC-SHA256(secret, t + "." + body)>
```

Body: `{ id, event, createdAt, workspaceId, data }`. Events: `message.sent`, `message.delivered`, `reply.received`, `email.bounced`, `email.complained`, `lead.unsubscribed`, `lead.status_changed`, `campaign.status_changed`, `meeting.booked`, `task.created`, `webhook.test`. Reject timestamps older than five minutes. Non-2xx responses are retried after 1 s, 4 s, 60 s, 5 min, 15 min, 30 min, 1 h, 2 h, 4 h (10 attempts); 50 consecutive failures disable the endpoint.

## Inbound provider webhooks

| Provider | URL | Verification |
|---|---|---|
| Resend | `/api/webhooks/resend/{integrationId}` | Svix signature with the integration's signing secret |
| SendGrid | `/api/webhooks/sendgrid/{integrationId}` | ECDSA signed event webhook (public key in integration config) |
| Amazon SES | `/api/webhooks/ses/{integrationId}` | SNS certificate signature; subscription confirmation handled |
| Unipile | `/api/webhooks/unipile/{integrationId}` and `…/account` | shared-secret header registered by AREVEI; HMAC token on the account notify URL |

All inbound events are stored in `WebhookEvent` with idempotency on the provider's event id.
