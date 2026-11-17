# Database design: AREVEI GTM

PostgreSQL 16, Prisma ORM. Every tenant-owned table carries `workspaceId` and is accessed only through the service layer, which scopes every query by the caller's workspace. Soft deletes are used where history matters (`deletedAt`); hard deletes are reserved for GDPR-style erasure jobs. All timestamps are `timestamptz` in UTC; the workspace time zone is applied at the presentation and scheduling layers.

Evidence shaping this design (reference behaviours we mirror functionally, labelled OBSERVED in `evidence/notes/pumpgtm-api-model-notes.md`): one canonical lead per workspace deduplicated on LinkedIn URL, email and X handle (§1.11); sequence status machine and revision concurrency (§2.1, §1.8); step kinds and execution models (§3); review batch and candidate decisions (§2.4); pending reply decision enum (§6); analytics metric definitions (§7); webhook signing and retry rules (§8); activity ledger as an append-only event table (§7.4).

## 1. Entity groups

```
Identity        User, Session, EmailVerificationCode, PasswordResetToken
Tenancy         Workspace, WorkspaceMember, WorkspaceInvitation, WorkspaceSettings, AuditLog, Notification
Knowledge       CompanyProfile, IcpProfile
Accounts        TargetAccount (company), Contact (person, canonical), Lead (contact in a workspace pipeline)
Discovery       LeadSearch, LeadSearchResult, LeadSource, LeadEnrichment, BuyingSignal, LeadScore, LeadResearch
Campaigns       Campaign, CampaignAudience, CampaignSequence, SequenceStep, CampaignLead (enrollment), StepRun
Messaging       Message, Conversation, ConversationMessage, ReplyDecision, Task, Meeting
Senders         SenderAccount, EmailMailbox
Integrations    Integration, IntegrationCredential, ProviderUsage, WebhookSubscription, WebhookDelivery, WebhookEvent (inbound)
Compliance      SuppressionEntry, Unsubscribe
Operations      ActivityEvent, BackgroundJob
```

## 2. Tables

Conventions: `id` is `uuid` (default `gen_random_uuid()`); `createdAt`/`updatedAt` on every table; `workspaceId uuid not null references Workspace(id) on delete cascade` on every tenant table unless stated. Indexes listed are in addition to primary keys and foreign keys.

### Identity

| Table | Key columns | Constraints and indexes |
|---|---|---|
| `User` | `email citext unique`, `name`, `passwordHash` (Argon2id, nullable for code-only users), `emailVerifiedAt`, `lastLoginAt`, `isSuperAdmin bool default false` | unique(email) |
| `Session` | `userId`, `tokenHash` (SHA-256 of random 32-byte token), `expiresAt`, `ipHash`, `userAgent` | unique(tokenHash), index(userId), index(expiresAt) |
| `EmailVerificationCode` | `email`, `codeHash`, `purpose` enum `sign_in|verify_email|password_reset`, `expiresAt`, `consumedAt`, `attempts int` | index(email, purpose) |

### Tenancy

| Table | Key columns | Constraints and indexes |
|---|---|---|
| `Workspace` | `name`, `slug unique`, `ownerUserId`, `deletedAt` | unique(slug) |
| `WorkspaceMember` | `workspaceId`, `userId`, `role` enum `owner|admin|member`, `joinedAt` | unique(workspaceId, userId) |
| `WorkspaceInvitation` | `workspaceId`, `email`, `role`, `tokenHash`, `invitedByUserId`, `expiresAt`, `acceptedAt` | unique(tokenHash), index(workspaceId, email) |
| `WorkspaceSettings` | `workspaceId unique`, `timezone` (IANA), `sendingWindow jsonb` (`{days:[1..5], start:"08:00", end:"18:00"}`), `defaultDailyLimits jsonb`, `aiAutoSendReplies bool default false`, `aiDefaultProvider`, `aiDefaultModel`, `bookingLink`, `unsubscribeFooterEnabled bool default true`, `plainTextEmail bool default true`, `dataRetentionDays int` | unique(workspaceId) |
| `AuditLog` | `workspaceId nullable`, `actorUserId nullable`, `actorType` enum `user|system|api_key|job`, `action` (e.g. `integration.credential.updated`), `targetType`, `targetId`, `metadata jsonb` (never secrets), `ipHash` | index(workspaceId, createdAt desc), index(targetType, targetId) |
| `Notification` | `workspaceId`, `userId nullable` (null = all members), `type`, `title`, `body`, `link`, `readAt` | index(workspaceId, userId, readAt) |
| `ApiKey` | `workspaceId`, `name`, `keyPrefix`, `keyHash`, `scopes text[]`, `createdByUserId`, `lastUsedAt`, `revokedAt` | unique(keyHash), index(workspaceId) |

### Knowledge base

| Table | Key columns | Notes |
|---|---|---|
| `CompanyProfile` | `workspaceId unique`, `companyName`, `website`, `description`, `productOrService`, `industry`, `businessModel`, `targetGeography text[]`, `targetCustomerType`, `valueProposition`, `competitors jsonb` (`[{name, website}]`), `existingCustomers jsonb`, `preferredChannels text[]`, `salesObjective`, `aiDraft jsonb` (last AI-generated draft with evidence URLs), `approvedAt`, `approvedByUserId`, `revision int default 1` | The approved profile is the context injected into every AI task. `revision` is incremented on every save; AI drafts are stored separately until approved. |
| `IcpProfile` | `workspaceId`, `name`, `description` (plain-language input), `criteria jsonb` (Zod-validated schema `IcpCriteriaV1`: titles, seniorities, functions, industries, geographies, companySize {min,max}, revenue {min,max}, technologies, companyCharacteristics, exclusions, buyingSignals, preferredChannels), `status` enum `draft|active|archived`, `isDefault bool`, `aiRationale jsonb`, `revision int` | index(workspaceId, status). Multiple ICPs per workspace; duplicate = insert with new id. |

### Accounts and people

| Table | Key columns | Constraints and indexes |
|---|---|---|
| `TargetAccount` | `workspaceId`, `name`, `domain` (normalized, nullable), `linkedinUrl`, `website`, `industry`, `headcount int`, `headcountRange`, `location`, `description`, `technologies text[]`, `fundingStage`, `lastFundingAt`, `investors text[]`, `source`, `externalIds jsonb` (`{apollo:"…", pdl:"…"}`), `doNotContact bool default false` | unique(workspaceId, domain) where domain not null; index(workspaceId, name) |
| `Contact` | `workspaceId`, `firstName`, `lastName`, `fullName`, `title`, `seniority`, `function`, `accountId nullable`, `companyNameRaw`, `email citext nullable`, `emailStatus` enum `unknown|valid|risky|invalid|catch_all`, `phone nullable`, `linkedinUrl nullable` (normalized `https://www.linkedin.com/in/<slug>`), `linkedinSlug nullable`, `xHandle nullable` (lowercase, no `@`), `location`, `country`, `timezone`, `headline`, `avatarUrl`, `externalIds jsonb`, `doNotContact bool`, `optedOutAt`, `mergedIntoContactId nullable`, `deletedAt` | **Canonical person record.** Partial unique indexes: unique(workspaceId, linkedinSlug) where not null; unique(workspaceId, email) where not null; unique(workspaceId, xHandle) where not null. index(workspaceId, accountId), index(workspaceId, fullName). |
| `Lead` | `workspaceId`, `contactId`, `accountId nullable`, `icpProfileId nullable`, `status` enum `new|reviewing|approved|rejected|enrolled|replied|qualified|meeting_booked|not_interested|disqualified|unsubscribed`, `stage` (cumulative milestone, see §4), `ownerUserId nullable`, `primarySourceId` (LeadSource), `qualifiedAt`, `lastActivityAt`, `notes` | **One Lead per Contact per workspace**: unique(workspaceId, contactId). index(workspaceId, status), index(workspaceId, lastActivityAt desc). A lead can be in many campaigns via `CampaignLead`; engagement history lives in `ActivityEvent` and `Conversation`. |
| `LeadSource` | `workspaceId`, `leadId`, `kind` enum `provider_search|csv_import|manual|webhook|signal|post_engagers|api|lookalike|competitor_research`, `provider` nullable (`apollo|pdl|hunter|exa|firecrawl|…`), `searchId nullable`, `importBatchId nullable`, `evidence jsonb` (URL, query, match reason), `occurredAt` | index(leadId), index(workspaceId, kind) |

### Discovery, enrichment, signals, scoring

| Table | Key columns | Notes |
|---|---|---|
| `LeadSearch` | `workspaceId`, `name`, `icpProfileId nullable`, `criteria jsonb` (`SearchCriteriaV1`), `provider`, `status` enum `draft|previewed|running|completed|failed|cancelled`, `requestedCount int`, `preview jsonb` (estimated matches, provider cost estimate), `resultCount int`, `duplicateCount int`, `providerUsageId nullable`, `requestId` (idempotency, unique per workspace), `savedAsName nullable`, `createdByUserId`, `startedAt`, `completedAt`, `error jsonb` | unique(workspaceId, requestId) where requestId not null; index(workspaceId, createdAt desc). Search history = this table; saved searches = rows with `savedAsName`. |
| `LeadSearchResult` | `workspaceId`, `searchId`, `contactId nullable` (set once imported), `rawPerson jsonb` (provider payload, minimized), `matchReason`, `fitPreview jsonb`, `decision` enum `undecided|good_fit|not_a_fit`, `decidedByUserId`, `decidedAt`, `duplicateOfContactId nullable`, `providerRecordId` | unique(searchId, providerRecordId); index(searchId, decision). This is the review batch. |
| `ImportBatch` | `workspaceId`, `kind` enum `csv|api|webhook`, `fileName`, `rowCount`, `addedCount`, `duplicateCount`, `invalidCount`, `status`, `errors jsonb`, `requestId`, `campaignId nullable` | unique(workspaceId, requestId) |
| `LeadEnrichment` | `workspaceId`, `contactId`, `provider`, `field` (e.g. `email`, `phone`, `title`, `companyHeadcount`), `value jsonb`, `confidence numeric(3,2)`, `verificationState` enum `unverified|verified|invalid|stale`, `sourceUrl`, `providerRecordId`, `fetchedAt`, `appliedAt nullable` (null = not promoted to Contact), `supersededById nullable` | index(contactId, field, fetchedAt desc). **Field-level provenance**: the Contact column holds the applied value; this table holds every candidate value. Promotion rule: never overwrite a `verified` value with a lower-confidence one. |
| `BuyingSignal` | `workspaceId`, `accountId nullable`, `contactId nullable`, `source` enum `provider|user|ai_inference|webhook|x_api|linkedin_api`, `provider nullable`, `eventType` enum `hiring|funding|leadership_change|expansion|technology_adopted|competitor_engagement|linkedin_post_engagement|x_post_engagement|website_visit|custom`, `title`, `occurredAt`, `url`, `evidence jsonb` (quotes, job posting, round details), `confidence numeric(3,2)`, `relevanceScore int` (0–100), `isInferred bool`, `expiresAt`, `dedupeKey` | unique(workspaceId, dedupeKey); index(workspaceId, eventType, occurredAt desc); index(accountId); index(contactId). Observed vs inferred is a hard column, not a convention. |
| `SignalRule` | `workspaceId`, `name`, `enabled`, `match jsonb` (event types, min relevance, ICP), `action` enum `create_lead|add_to_campaign|notify`, `campaignId nullable`, `icpProfileId nullable` | index(workspaceId, enabled) |
| `LeadScore` | `workspaceId`, `leadId`, `kind` enum `icp_fit|intent|quality`, `score int` (0–100), `explanation jsonb` (`[{factor, weight, evidence, contribution}]`), `modelProvider`, `model`, `promptVersion`, `computedAt`, `isCurrent bool` | index(leadId, kind, isCurrent). Scores are evidence-backed and reproducible via `promptVersion`. |
| `LeadResearch` | `workspaceId`, `leadId`, `status`, `summary jsonb` (who, company, why need, challenges, signals, evidence[], angle, channel, suggestedOpener, suggestedValueProp, nextAction), `sources jsonb` (URLs fetched), `modelProvider`, `model`, `promptVersion`, `tokenUsage jsonb`, `computedAt` | index(leadId, computedAt desc) |

### Campaigns and sequences

| Table | Key columns | Notes |
|---|---|---|
| `Campaign` | `workspaceId`, `name`, `objective`, `icpProfileId nullable`, `status` enum `draft|active|paused|completed|archived`, `channels text[]`, `schedule jsonb` (sending window override, start/end dates), `dailyLimits jsonb` (per channel), `exclusions jsonb` (domains, titles, accounts), `approvalMode` enum `review_each_message|approve_sequence_once`, `signalCriteria jsonb`, `geography text[]`, `createdByUserId`, `activatedAt`, `pausedAt`, `revision int` | index(workspaceId, status) |
| `CampaignAudience` | `campaignId`, `kind` enum `icp|segment|search|import|signal_rule|manual`, `refId nullable`, `filter jsonb`, `autoAdd bool` | index(campaignId) |
| `CampaignSequence` | `workspaceId`, `campaignId nullable` (null = reusable template), `name`, `executionModel` enum `linear|tracks|graph`, `status` enum `draft|approved|active|paused|archived`, `revision int default 1`, `approvedRevision int nullable`, `approvedAt`, `approvedByUserId`, `isTemplate bool`, `stopRules jsonb` (`{onReply:true,onOptOut:true,onBounce:true,onInvalidContact:true}`), `emailSettings jsonb` (mailboxIds, dailyLimit, unsubscribeFooter) | index(workspaceId, status). Editing a step increments `revision`; approval is invalidated when `revision != approvedRevision`. |
| `SequenceStep` | `sequenceId`, `index int`, `kind` enum `linkedin_connect|linkedin_message|linkedin_inmail|linkedin_engage|email|x_dm|x_engage|wait|branch|manual_task`, `delayDays int` (0–30), `subject`, `bodyTemplate`, `variants jsonb` (`[{key, weight, bodyTemplate}]`), `condition` enum nullable (`linkedin_accepted|x_followed_back|has_email|has_linkedin|has_x`), `next jsonb` (`{next}` or `{yes,no}`), `actions jsonb`, `aiGeneration jsonb` (`{enabled, tone, length, instructions}`), `requiresInput jsonb` | unique(sequenceId, index) |
| `CampaignLead` | `workspaceId`, `campaignId`, `leadId`, `sequenceId`, `sequenceRevision int`, `senderAccountId nullable`, `status` enum `queued|active|waiting_approval|waiting_input|paused|replied|completed|stopped|failed|skipped`, `currentStepIndex int`, `nextActionAt`, `stopReason` enum nullable (`replied|opted_out|not_interested|disqualified|invalid_contact|campaign_paused|limit_reached|manual|bounced`), `enrolledAt`, `enrolledByUserId`, `completedAt`, `priority int default 0` | **unique(campaignId, leadId)**: a lead appears once per campaign; across campaigns the Contact stays canonical. index(workspaceId, status, nextActionAt). |
| `StepRun` | `workspaceId`, `campaignLeadId`, `stepIndex`, `kind`, `status` enum `scheduled|generating|awaiting_approval|approved|sending|sent|delivered|failed|skipped|cancelled|manual_pending|manual_done`, `scheduledFor`, `attempt int`, `messageId nullable`, `error jsonb`, `providerRef`, `idempotencyKey` | unique(campaignLeadId, stepIndex, attempt); index(workspaceId, status, scheduledFor). The scheduler claims rows from this table. |

### Messaging

| Table | Key columns | Notes |
|---|---|---|
| `Message` | `workspaceId`, `leadId`, `campaignLeadId nullable`, `stepRunId nullable`, `conversationId nullable`, `channel` enum `linkedin|email|x|manual`, `direction` enum `outbound|inbound`, `kind` enum `connection_note|linkedin_message|inmail|email|email_followup|x_dm|reply|manual`, `subject`, `body`, `bodyHtml nullable`, `status` enum `draft|awaiting_approval|approved|rejected|scheduled|sent|delivered|bounced|failed|received`, `generatedBy` enum `ai|user|template`, `aiMeta jsonb` (provider, model, promptVersion, evidence used, tokenUsage), `approvedByUserId`, `approvedAt`, `editedByUserId`, `sentAt`, `deliveredAt`, `providerMessageId`, `threadKey`, `senderAccountId`, `mailboxId nullable`, `error jsonb` | index(workspaceId, status), index(conversationId, sentAt), unique(workspaceId, providerMessageId) where not null. Regenerate = new row with `supersedesMessageId`. |
| `Conversation` | `workspaceId`, `leadId`, `contactId`, `accountId nullable`, `channel`, `campaignId nullable`, `senderAccountId nullable`, `externalThreadId`, `subject`, `status` enum `open|awaiting_reply|needs_attention|qualified|interested|not_interested|meeting_requested|archived|snoozed`, `replyStatus` enum `none|awaiting_decision|decided`, `classification` enum nullable (`interested|question|not_now|not_interested|out_of_office|wrong_person|unsubscribe|bounce|other`), `classificationConfidence numeric`, `assignedUserId nullable`, `lastMessageAt`, `lastInboundAt`, `unreadCount int`, `snoozedUntil` | unique(workspaceId, channel, externalThreadId) where not null; index(workspaceId, status, lastMessageAt desc); index(assignedUserId). |
| `ConversationMessage` | `conversationId`, `messageId` | unique(conversationId, messageId). Timeline = Messages ordered by `sentAt`/`receivedAt`. |
| `ReplyDecision` | `workspaceId`, `conversationId`, `inboundMessageId`, `draftMessageId nullable`, `decision` enum `send|edit_and_send|snooze|mark_interested|mark_not_interested|meeting_booked|booking_link|start_sequence|dismiss|opt_out|assign`, `decidedByUserId nullable`, `decidedVia` enum `ui|api|auto`, `payload jsonb`, `decidedAt` | index(conversationId, decidedAt desc). Auto decisions only when `WorkspaceSettings.aiAutoSendReplies` is true, and are audited. |
| `Task` | `workspaceId`, `leadId nullable`, `campaignLeadId nullable`, `stepRunId nullable`, `kind` enum `manual_linkedin_action|manual_x_action|follow_up|review|custom`, `title`, `instructions`, `dueAt`, `assignedUserId`, `status` enum `open|done|cancelled`, `completedAt` | index(workspaceId, status, dueAt). Manual execution fallback for channel actions without an authorized integration. |
| `Meeting` | `workspaceId`, `leadId`, `conversationId nullable`, `source` enum `manual|booking_link|calendar`, `scheduledAt`, `durationMin`, `outcome` enum `scheduled|held|no_show|cancelled`, `notes` | index(workspaceId, scheduledAt) |

### Sender accounts and mailboxes

| Table | Key columns | Notes |
|---|---|---|
| `SenderAccount` | `workspaceId`, `channel` enum `linkedin|x|email`, `provider` (`unipile|linkedin_official|x_api|google|microsoft|smtp|resend|ses|sendgrid`), `displayName`, `handle`, `externalAccountId`, `status` enum `pending|connected|disconnected|limited|error`, `health jsonb` (last check, errors), `limits jsonb` (`{dailyConnectionRequests:25, dailyMessages:100, warmup:{enabled, startedAt, ramp:[5,7,10,15,16,20]}}`), `usageToday jsonb`, `usageDate date`, `timezone`, `sendingWindow jsonb`, `ownerUserId`, `credentialId nullable`, `mailboxId nullable`, `connectedAt`, `lastSyncAt` | index(workspaceId, channel, status). Daily counters reset by `usageDate`. |
| `EmailMailbox` | `workspaceId`, `senderAccountId unique`, `emailAddress citext`, `provider` enum `google|microsoft|smtp_imap|resend|ses|sendgrid`, `fromName`, `replyTo`, `domain`, `domainAuth jsonb` (`{spf:{status,checkedAt}, dkim:{…}, dmarc:{…}}`), `dailyLimit int`, `sentToday int`, `warmupEnabled bool`, `inboundMode` enum `imap_poll|webhook|graph_subscription|none`, `inboundCursor jsonb`, `lastInboundSyncAt`, `verificationState` enum `unverified|verified|failed` | unique(workspaceId, emailAddress) |

### Integrations and providers

| Table | Key columns | Notes |
|---|---|---|
| `Integration` | `workspaceId nullable` (null = system-level default), `category` enum `llm|people_data|company_data|signals|email|linkedin|x|crm|webhook`, `provider` (`anthropic|openai|gemini|deepseek|openrouter|bedrock|apollo|pdl|hunter|snov|exa|firecrawl|resend|sendgrid|ses|smtp|google|microsoft|unipile|x_api`), `enabled bool`, `isDefault bool`, `config jsonb` (non-secret: model, region, base URL, daily caps), `priority int` (fallback order), `healthStatus` enum `unknown|healthy|degraded|failed`, `lastHealthCheckAt`, `lastError jsonb`, `createdByUserId` | unique(workspaceId, category, provider) |
| `IntegrationCredential` | `integrationId`, `kind` enum `api_key|oauth|basic|smtp`, `ciphertext bytea`, `iv bytea`, `authTag bytea`, `keyVersion int`, `fingerprint` (last 4 chars, for display), `expiresAt`, `scopes text[]`, `refreshCiphertext bytea nullable`, `rotatedAt`, `revokedAt` | AES-256-GCM with `ENCRYPTION_KEY` (versioned for rotation). **Never selected by API handlers**; only `CredentialVault` reads it. Not included in exports. |
| `ProviderUsage` | `workspaceId`, `integrationId`, `provider`, `operation` (`llm.generate`, `people.search`, `people.enrich`, `email.send`, `linkedin.invite`…), `units int` (tokens, records, sends), `estimatedCostCents int`, `requestId`, `leadId nullable`, `campaignId nullable`, `status` enum `ok|failed|rate_limited`, `latencyMs`, `occurredAt`, `metadata jsonb` | index(workspaceId, provider, occurredAt desc); index(workspaceId, occurredAt). Powers usage dashboards and caps. |
| `WebhookSubscription` | `workspaceId`, `url`, `events text[]`, `secretCiphertext bytea`, `enabled bool`, `createdByUserId`, `disabledAt`, `failureCount int` | index(workspaceId, enabled). Max 10 per workspace (enforced in service). |
| `WebhookDelivery` | `workspaceId`, `subscriptionId`, `eventId`, `event`, `payload jsonb`, `attempt int`, `status` enum `pending|delivered|failed|gave_up`, `responseStatus int`, `nextAttemptAt`, `lastError` | unique(subscriptionId, eventId, attempt); index(status, nextAttemptAt). Signature `t=<unix>,v1=HMAC-SHA256(secret, t + "." + body)`. |
| `WebhookEvent` (inbound) | `workspaceId nullable`, `provider` (`resend|sendgrid|ses|unipile|x|google|microsoft|custom`), `externalEventId`, `eventType`, `payload jsonb`, `signatureValid bool`, `receivedAt`, `processedAt`, `error` | unique(provider, externalEventId) where not null; index(processedAt). Idempotent inbound processing. |

### Compliance

| Table | Key columns | Notes |
|---|---|---|
| `SuppressionEntry` | `workspaceId`, `kind` enum `email|domain|linkedin_url|x_handle|company_name`, `value` (normalized), `reason` enum `unsubscribe|bounce|complaint|manual|legal|do_not_contact`, `source`, `addedByUserId nullable`, `expiresAt nullable` | unique(workspaceId, kind, value). Checked before every send and every import. |
| `Unsubscribe` | `workspaceId`, `contactId nullable`, `email citext`, `channel`, `campaignId nullable`, `messageId nullable`, `tokenHash` (one-click link token), `method` enum `link|list_unsubscribe_header|reply|manual`, `ipHash`, `occurredAt` | unique(tokenHash); index(workspaceId, email). Creates a `SuppressionEntry` and stops all active `CampaignLead` rows for the contact. |

### Operations

| Table | Key columns | Notes |
|---|---|---|
| `ActivityEvent` | `workspaceId`, `leadId nullable`, `contactId nullable`, `campaignId nullable`, `campaignLeadId nullable`, `conversationId nullable`, `senderAccountId nullable`, `channel nullable`, `action` (string enum, e.g. `lead.created`, `search.completed`, `message.generated`, `message.approved`, `message.sent`, `message.delivered`, `message.bounced`, `reply.received`, `reply.classified`, `reply.decided`, `invite.sent`, `invite.accepted`, `sequence.started`, `sequence.stopped`, `meeting.booked`, `enrichment.applied`, `signal.detected`, `task.created`), `outcome` enum `ok|failed|skipped`, `actorType`, `actorUserId nullable`, `metadata jsonb`, `occurredAt` | Append-only (no updates; revoked rows get a compensating event). index(workspaceId, occurredAt desc); index(workspaceId, action, occurredAt desc); index(leadId, occurredAt desc); index(campaignId, occurredAt desc). **All analytics are computed from this table plus `Message`.** |
| `BackgroundJob` | `workspaceId nullable`, `queue`, `jobId` (BullMQ id), `name`, `status` enum `queued|active|completed|failed|delayed|cancelled`, `payloadSummary jsonb`, `attempts`, `error`, `startedAt`, `finishedAt` | unique(queue, jobId); index(workspaceId, status). Mirror of queue state for UI and audit. |

## 3. Deduplication policy

1. On import or search result approval, normalize identifiers: LinkedIn URL to `linkedinSlug` (lowercase path segment after `/in/`), email to lowercase with trailing dots stripped, X handle to lowercase without `@`.
2. Look up `Contact` by any matching identifier in the workspace. If found, merge new non-conflicting fields through `LeadEnrichment` provenance rules and attach a new `LeadSource` row. Never create a second Contact.
3. A `Lead` is created once per Contact per workspace. Campaign membership is a `CampaignLead` row; the unique `(campaignId, leadId)` key prevents double enrolment, and a lead already active in another campaign is only enrolled in a second campaign when the workspace setting `allowConcurrentCampaigns` is true (default false, matching the reference's one-sequence-at-a-time rule).
4. Conflicting identifiers across two existing Contacts (same email on A, same LinkedIn on B) raise a merge task rather than silently merging; `mergedIntoContactId` records resolved merges.

## 4. Lead stage (cumulative milestones)

Stored on `Lead.stage` and recomputed from `ActivityEvent`: `discovered → reviewed → enrolled → contacted (invite or first message sent) → connected (LinkedIn accepted) → messaged → replied → qualified → meeting_booked`. Terminal exits: `not_interested`, `disqualified`, `unsubscribed`, `invalid`. Analytics funnels use these milestones.

## 5. Deletion and retention policies

| Data | Policy |
|---|---|
| Workspace delete | Soft delete, then a scheduled hard-delete job after `dataRetentionDays` (default 30) removes every tenant row by cascade; credentials are hard-deleted immediately. |
| Contact erasure request | Hard-delete Contact, Lead, Enrichment, Messages bodies (replace body with `[erased]`), keep `ActivityEvent` rows with identifiers nulled, keep `SuppressionEntry` (hashed) so the person is not re-imported. |
| Credentials | Hard delete on revoke; `AuditLog` keeps the fact with the fingerprint only. |
| Provider payloads (`rawPerson`) | Minimized at write time (only fields we map), purged 90 days after the search completes. |
| Webhook deliveries | Purged after 30 days. |
| Sessions | Purged on expiry. |

## 6. Row-level isolation checks

Every Prisma call goes through `db.forWorkspace(workspaceId)` helpers in `src/server/db/tenant.ts` that inject `where: { workspaceId }` for tenant models. Integration tests (`tests/tenant-isolation.test.ts`) create two workspaces and assert that every list/get/update/delete service refuses cross-workspace ids.
