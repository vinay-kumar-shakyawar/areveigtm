# Database

PostgreSQL via Prisma. Schema: `prisma/schema.prisma` (48 models). Migrations:
`prisma/migrations/` (`20261117140836_init`, `20261117180000_channels`,
`20261117180100_mailbox_mock`). Apply with `npx prisma migrate deploy`; create new
ones with `npm run db:migrate`.

Every tenant-owned table carries `workspaceId` with `onDelete: Cascade` from
`Workspace`; services always filter by it.

## Model groups

| Group | Models | Notes |
|---|---|---|
| Identity | `User`, `Session`, `EmailVerificationCode`, `ApiKey`, `IdempotencyKey` | Argon2id password hashes; opaque session tokens and API keys stored as SHA-256 |
| Tenancy | `Workspace`, `WorkspaceMember` (owner/admin/member), `WorkspaceInvitation`, `WorkspaceSettings`, `AuditLog`, `Notification` | settings hold time zone, sending window, daily limits, AI auto-send policy, booking link, retention |
| Knowledge | `CompanyProfile`, `IcpProfile` | revisioned, approval tracked |
| Leads | `TargetAccount`, `Contact`, `Lead`, `LeadSource`, `LeadSearch`, `LeadSearchResult`, `ImportBatch`, `LeadEnrichment`, `BuyingSignal`, `SignalRule`, `LeadScore`, `LeadResearch` | contact dedupe on LinkedIn slug, email and X handle; enrichment keeps provenance per field |
| Campaigns | `Campaign`, `CampaignAudience`, `CampaignSequence`, `SequenceStep`, `CampaignLead`, `StepRun`, `Message`, `Task` | sequences revisioned and approved by revision; `Message.providerMessageId` unique per workspace |
| Inbox | `Conversation`, `ReplyDecision`, `Meeting` | one conversation per lead per channel; classification + confidence; decisions with `decidedVia ui/api/auto` |
| Channels | `SenderAccount`, `EmailMailbox`, `Integration`, `IntegrationCredential`, `ProviderUsage` | credentials sealed with AES-256-GCM (`ciphertext`, `iv`, `authTag`, `keyVersion`) and fingerprinted |
| Webhooks | `WebhookSubscription`, `WebhookDelivery`, `WebhookEvent` | outbound secrets sealed; inbound events unique on `(provider, externalEventId)` |
| Compliance | `SuppressionEntry`, `Unsubscribe` | suppression by email, domain, LinkedIn URL, X handle, company; unsubscribe tokens hashed |
| Ledger | `ActivityEvent`, `BackgroundJob` | append-only event stream that analytics and webhooks derive from |

## Conventions

- UUID primary keys (`@db.Uuid`), `createdAt`/`updatedAt` on mutable rows.
- JSON columns hold provider payloads, AI metadata and settings; typed at the service boundary with zod.
- Enums for every status machine (`CampaignStatus`, `EnrollmentStatus`, `StepRunStatus`, `MessageStatus`, `ConversationStatus`, `ReplyClassification`, `SenderStatus`, …).
- Indexes on `(workspaceId, status)`, `(workspaceId, occurredAt desc)` and the lookups used by the scheduler and inbox.

## Retention

`WorkspaceSettings.dataRetentionDays` (default 30) is the intended horizon for raw provider payloads and webhook events; a retention job is not yet implemented (see FINAL_REPORT limitations). Audit logs, activity events and messages are retained indefinitely.

## Local databases

- Development: `npm run dev:db` starts an embedded Postgres on `:54329` (`.local/pg`).
- Tests: vitest global setup starts a separate embedded instance on `:54331` (`.local/pg-test`), drops and recreates the test database and runs `prisma migrate deploy` on every run.
- `npm run db:studio` opens Prisma Studio.
