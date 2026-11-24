-- CreateEnum
CREATE TYPE "CodePurpose" AS ENUM ('sign_in', 'verify_email', 'password_reset');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('user', 'system', 'api_key', 'job');

-- CreateEnum
CREATE TYPE "IcpStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('unknown', 'valid', 'risky', 'invalid', 'catch_all');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'reviewing', 'approved', 'rejected', 'enrolled', 'replied', 'qualified', 'meeting_booked', 'not_interested', 'disqualified', 'unsubscribed');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('discovered', 'reviewed', 'enrolled', 'contacted', 'connected', 'messaged', 'replied', 'qualified', 'meeting_booked', 'not_interested', 'disqualified', 'unsubscribed', 'invalid');

-- CreateEnum
CREATE TYPE "LeadSourceKind" AS ENUM ('provider_search', 'csv_import', 'manual', 'webhook', 'signal', 'post_engagers', 'api', 'lookalike', 'competitor_research');

-- CreateEnum
CREATE TYPE "SearchStatus" AS ENUM ('draft', 'previewed', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('undecided', 'good_fit', 'not_a_fit');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('csv', 'api', 'webhook');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('unverified', 'verified', 'invalid', 'stale');

-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('provider', 'user', 'ai_inference', 'webhook', 'x_api', 'linkedin_api');

-- CreateEnum
CREATE TYPE "SignalEventType" AS ENUM ('hiring', 'funding', 'leadership_change', 'expansion', 'technology_adopted', 'competitor_engagement', 'linkedin_post_engagement', 'x_post_engagement', 'website_visit', 'custom');

-- CreateEnum
CREATE TYPE "SignalRuleAction" AS ENUM ('create_lead', 'add_to_campaign', 'notify');

-- CreateEnum
CREATE TYPE "ScoreKind" AS ENUM ('icp_fit', 'intent', 'quality');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('review_each_message', 'approve_sequence_once');

-- CreateEnum
CREATE TYPE "AudienceKind" AS ENUM ('icp', 'segment', 'search', 'import', 'signal_rule', 'manual');

-- CreateEnum
CREATE TYPE "ExecutionModel" AS ENUM ('linear', 'tracks', 'graph');

-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('draft', 'approved', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "StepKind" AS ENUM ('linkedin_connect', 'linkedin_message', 'linkedin_inmail', 'linkedin_engage', 'email', 'x_dm', 'x_engage', 'wait', 'branch', 'manual_task');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('queued', 'active', 'waiting_approval', 'waiting_input', 'paused', 'replied', 'completed', 'stopped', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "StopReason" AS ENUM ('replied', 'opted_out', 'not_interested', 'disqualified', 'invalid_contact', 'campaign_paused', 'limit_reached', 'manual', 'bounced');

-- CreateEnum
CREATE TYPE "StepRunStatus" AS ENUM ('scheduled', 'generating', 'awaiting_approval', 'approved', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'cancelled', 'manual_pending', 'manual_done');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('linkedin', 'email', 'x', 'manual');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('outbound', 'inbound');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('connection_note', 'linkedin_message', 'inmail', 'email', 'email_followup', 'x_dm', 'reply', 'manual');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('draft', 'awaiting_approval', 'approved', 'rejected', 'scheduled', 'sent', 'delivered', 'bounced', 'failed', 'received');

-- CreateEnum
CREATE TYPE "GeneratedBy" AS ENUM ('ai', 'user', 'template');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'awaiting_reply', 'needs_attention', 'qualified', 'interested', 'not_interested', 'meeting_requested', 'archived', 'snoozed');

-- CreateEnum
CREATE TYPE "ReplyStatus" AS ENUM ('none', 'awaiting_decision', 'decided');

-- CreateEnum
CREATE TYPE "ReplyClassification" AS ENUM ('interested', 'question', 'not_now', 'not_interested', 'out_of_office', 'wrong_person', 'unsubscribe', 'bounce', 'other');

-- CreateEnum
CREATE TYPE "DecisionKind" AS ENUM ('send', 'edit_and_send', 'snooze', 'mark_interested', 'mark_not_interested', 'meeting_booked', 'booking_link', 'start_sequence', 'dismiss', 'opt_out', 'assign');

-- CreateEnum
CREATE TYPE "DecidedVia" AS ENUM ('ui', 'api', 'auto');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('manual_linkedin_action', 'manual_x_action', 'follow_up', 'review', 'custom');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "MeetingSource" AS ENUM ('manual', 'booking_link', 'calendar');

-- CreateEnum
CREATE TYPE "MeetingOutcome" AS ENUM ('scheduled', 'held', 'no_show', 'cancelled');

-- CreateEnum
CREATE TYPE "SenderChannel" AS ENUM ('linkedin', 'x', 'email');

-- CreateEnum
CREATE TYPE "SenderStatus" AS ENUM ('pending', 'connected', 'disconnected', 'limited', 'error');

-- CreateEnum
CREATE TYPE "MailboxProvider" AS ENUM ('google', 'microsoft', 'smtp_imap', 'resend', 'ses', 'sendgrid');

-- CreateEnum
CREATE TYPE "InboundMode" AS ENUM ('imap_poll', 'webhook', 'graph_subscription', 'gmail_api', 'none');

-- CreateEnum
CREATE TYPE "IntegrationCategory" AS ENUM ('llm', 'people_data', 'company_data', 'signals', 'email', 'mailbox', 'linkedin', 'x', 'crm', 'webhook');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('unknown', 'healthy', 'degraded', 'failed');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('api_key', 'oauth', 'basic', 'smtp', 'aws');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('ok', 'failed', 'rate_limited');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'delivered', 'failed', 'gave_up');

-- CreateEnum
CREATE TYPE "SuppressionKind" AS ENUM ('email', 'domain', 'linkedin_url', 'x_handle', 'company_name');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('unsubscribe', 'bounce', 'complaint', 'manual', 'legal', 'do_not_contact');

-- CreateEnum
CREATE TYPE "UnsubscribeMethod" AS ENUM ('link', 'list_unsubscribe_header', 'reply', 'manual');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('ok', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'active', 'completed', 'failed', 'delayed', 'cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationCode" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "CodePurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'member',
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "sendingWindow" JSONB NOT NULL DEFAULT '{"days":[1,2,3,4,5],"start":"08:00","end":"18:00"}',
    "defaultDailyLimits" JSONB NOT NULL DEFAULT '{"email":40,"linkedinInvites":20,"linkedinMessages":50,"xDms":30}',
    "aiAutoSendReplies" BOOLEAN NOT NULL DEFAULT false,
    "aiAutoSendMinConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "aiDefaultProvider" TEXT,
    "aiDefaultModel" TEXT,
    "bookingLink" TEXT,
    "unsubscribeFooterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "plainTextEmail" BOOLEAN NOT NULL DEFAULT true,
    "allowConcurrentCampaigns" BOOLEAN NOT NULL DEFAULT false,
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "actorUserId" UUID,
    "actorType" "ActorType" NOT NULL DEFAULT 'user',
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['read', 'write']::TEXT[],
    "createdByUserId" UUID NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "responseCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "companyName" TEXT,
    "website" TEXT,
    "description" TEXT,
    "productOrService" TEXT,
    "industry" TEXT,
    "businessModel" TEXT,
    "targetGeography" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCustomerType" TEXT,
    "valueProposition" TEXT,
    "competitors" JSONB NOT NULL DEFAULT '[]',
    "existingCustomers" JSONB NOT NULL DEFAULT '[]',
    "preferredChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "salesObjective" TEXT,
    "aiDraft" JSONB,
    "aiDraftSources" JSONB,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcpProfile" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criteria" JSONB NOT NULL,
    "status" "IcpStatus" NOT NULL DEFAULT 'draft',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "aiRationale" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcpProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetAccount" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "linkedinUrl" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "headcount" INTEGER,
    "headcountRange" TEXT,
    "location" TEXT,
    "country" TEXT,
    "description" TEXT,
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fundingStage" TEXT,
    "lastFundingAt" TIMESTAMP(3),
    "investors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "seniority" TEXT,
    "function" TEXT,
    "accountId" UUID,
    "companyNameRaw" TEXT,
    "email" TEXT,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'unknown',
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "linkedinSlug" TEXT,
    "xHandle" TEXT,
    "location" TEXT,
    "country" TEXT,
    "timezone" TEXT,
    "headline" TEXT,
    "avatarUrl" TEXT,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "mergedIntoContactId" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "accountId" UUID,
    "icpProfileId" UUID,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "stage" "LeadStage" NOT NULL DEFAULT 'discovered',
    "ownerUserId" UUID,
    "qualifiedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "kind" "LeadSourceKind" NOT NULL,
    "provider" TEXT,
    "searchId" UUID,
    "importBatchId" UUID,
    "evidence" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSearch" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icpProfileId" UUID,
    "criteria" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "SearchStatus" NOT NULL DEFAULT 'draft',
    "requestedCount" INTEGER NOT NULL DEFAULT 25,
    "preview" JSONB,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "savedAsName" TEXT,
    "createdByUserId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSearchResult" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "searchId" UUID NOT NULL,
    "contactId" UUID,
    "providerRecordId" TEXT NOT NULL,
    "person" JSONB NOT NULL,
    "matchReason" TEXT,
    "fitPreview" JSONB,
    "decision" "ReviewDecision" NOT NULL DEFAULT 'undecided',
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMP(3),
    "duplicateOfContactId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "fileName" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "addedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "errors" JSONB,
    "requestId" TEXT,
    "campaignId" UUID,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEnrichment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "verificationState" "VerificationState" NOT NULL DEFAULT 'unverified',
    "sourceUrl" TEXT,
    "providerRecordId" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "supersededById" UUID,

    CONSTRAINT "LeadEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyingSignal" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "accountId" UUID,
    "contactId" UUID,
    "source" "SignalSource" NOT NULL,
    "provider" TEXT,
    "eventType" "SignalEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "evidence" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "relevanceScore" INTEGER NOT NULL DEFAULT 50,
    "isInferred" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyingSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalRule" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "match" JSONB NOT NULL,
    "action" "SignalRuleAction" NOT NULL,
    "campaignId" UUID,
    "icpProfileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "kind" "ScoreKind" NOT NULL,
    "score" INTEGER NOT NULL,
    "explanation" JSONB NOT NULL,
    "modelProvider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadResearch" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "summary" JSONB NOT NULL,
    "sources" JSONB,
    "modelProvider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "tokenUsage" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "icpProfileId" UUID,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "schedule" JSONB,
    "dailyLimits" JSONB,
    "exclusions" JSONB,
    "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'review_each_message',
    "signalCriteria" JSONB,
    "geography" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdByUserId" UUID NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAudience" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "kind" "AudienceKind" NOT NULL,
    "refId" UUID,
    "filter" JSONB,
    "autoAdd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSequence" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "campaignId" UUID,
    "name" TEXT NOT NULL,
    "executionModel" "ExecutionModel" NOT NULL DEFAULT 'linear',
    "status" "SequenceStatus" NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "approvedRevision" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" UUID,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "stopRules" JSONB NOT NULL DEFAULT '{"onReply":true,"onOptOut":true,"onBounce":true,"onInvalidContact":true}',
    "emailSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" UUID NOT NULL,
    "sequenceId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "kind" "StepKind" NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT,
    "bodyTemplate" TEXT,
    "variants" JSONB,
    "condition" TEXT,
    "next" JSONB,
    "actions" JSONB,
    "aiGeneration" JSONB,
    "requiresInput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignLead" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "sequenceId" UUID NOT NULL,
    "sequenceRevision" INTEGER NOT NULL,
    "senderAccountId" UUID,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'queued',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextActionAt" TIMESTAMP(3),
    "stopReason" "StopReason",
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolledByUserId" UUID,
    "completedAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepRun" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "campaignLeadId" UUID NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "kind" "StepKind" NOT NULL,
    "status" "StepRunStatus" NOT NULL DEFAULT 'scheduled',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "messageId" UUID,
    "error" JSONB,
    "providerRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "leadId" UUID,
    "campaignLeadId" UUID,
    "conversationId" UUID,
    "channel" "Channel" NOT NULL,
    "direction" "Direction" NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'draft',
    "generatedBy" "GeneratedBy" NOT NULL DEFAULT 'user',
    "aiMeta" JSONB,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMP(3),
    "editedByUserId" UUID,
    "supersedesMessageId" UUID,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "threadKey" TEXT,
    "senderAccountId" UUID,
    "mailboxId" UUID,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "accountId" UUID,
    "channel" "Channel" NOT NULL,
    "campaignId" UUID,
    "senderAccountId" UUID,
    "externalThreadId" TEXT,
    "subject" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "replyStatus" "ReplyStatus" NOT NULL DEFAULT 'none',
    "classification" "ReplyClassification",
    "classificationConfidence" DOUBLE PRECISION,
    "assignedUserId" UUID,
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyDecision" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "inboundMessageId" UUID,
    "draftMessageId" UUID,
    "decision" "DecisionKind" NOT NULL,
    "decidedByUserId" UUID,
    "decidedVia" "DecidedVia" NOT NULL DEFAULT 'ui',
    "payload" JSONB,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplyDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "leadId" UUID,
    "campaignLeadId" UUID,
    "stepRunId" UUID,
    "kind" "TaskKind" NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "dueAt" TIMESTAMP(3),
    "assignedUserId" UUID,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "conversationId" UUID,
    "source" "MeetingSource" NOT NULL DEFAULT 'manual',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER,
    "outcome" "MeetingOutcome" NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenderAccount" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "channel" "SenderChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "handle" TEXT,
    "externalAccountId" TEXT,
    "status" "SenderStatus" NOT NULL DEFAULT 'pending',
    "health" JSONB,
    "limits" JSONB,
    "usageToday" JSONB,
    "usageDate" DATE,
    "timezone" TEXT,
    "sendingWindow" JSONB,
    "ownerUserId" UUID,
    "integrationId" UUID,
    "connectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SenderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMailbox" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "senderAccountId" UUID NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "provider" "MailboxProvider" NOT NULL,
    "fromName" TEXT,
    "replyTo" TEXT,
    "domain" TEXT,
    "domainAuth" JSONB,
    "dailyLimit" INTEGER NOT NULL DEFAULT 40,
    "sentToday" INTEGER NOT NULL DEFAULT 0,
    "sentDate" DATE,
    "warmupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inboundMode" "InboundMode" NOT NULL DEFAULT 'none',
    "inboundCursor" JSONB,
    "lastInboundSyncAt" TIMESTAMP(3),
    "verificationState" "VerificationState" NOT NULL DEFAULT 'unverified',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "category" "IntegrationCategory" NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "healthStatus" "HealthStatus" NOT NULL DEFAULT 'unknown',
    "lastHealthCheckAt" TIMESTAMP(3),
    "lastError" JSONB,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "fingerprint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUsage" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "integrationId" UUID,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "unitLabel" TEXT NOT NULL DEFAULT 'calls',
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "leadId" UUID,
    "campaignId" UUID,
    "status" "UsageStatus" NOT NULL DEFAULT 'ok',
    "latencyMs" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ProviderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secretCiphertext" BYTEA NOT NULL,
    "secretIv" BYTEA NOT NULL,
    "secretAuthTag" BYTEA NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID,
    "disabledAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "responseStatus" INTEGER,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" "SuppressionKind" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT,
    "addedByUserId" UUID,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unsubscribe" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contactId" UUID,
    "email" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'email',
    "campaignId" UUID,
    "messageId" UUID,
    "tokenHash" TEXT,
    "method" "UnsubscribeMethod" NOT NULL DEFAULT 'link',
    "ipHash" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unsubscribe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "leadId" UUID,
    "contactId" UUID,
    "campaignId" UUID,
    "campaignLeadId" UUID,
    "conversationId" UUID,
    "senderAccountId" UUID,
    "channel" "Channel",
    "action" TEXT NOT NULL,
    "outcome" "Outcome" NOT NULL DEFAULT 'ok',
    "actorType" "ActorType" NOT NULL DEFAULT 'system',
    "actorUserId" UUID,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "queue" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "payloadSummary" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerificationCode_email_purpose_idx" ON "EmailVerificationCode"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_workspaceId_email_idx" ON "WorkspaceInvitation"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSettings_workspaceId_key" ON "WorkspaceSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_userId_readAt_idx" ON "Notification"("workspaceId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_workspaceId_idx" ON "ApiKey"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_workspaceId_scope_requestId_key" ON "IdempotencyKey"("workspaceId", "scope", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_workspaceId_key" ON "CompanyProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "IcpProfile_workspaceId_status_idx" ON "IcpProfile"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "TargetAccount_workspaceId_name_idx" ON "TargetAccount"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TargetAccount_workspaceId_domain_key" ON "TargetAccount"("workspaceId", "domain");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_accountId_idx" ON "Contact"("workspaceId", "accountId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_fullName_idx" ON "Contact"("workspaceId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_workspaceId_linkedinSlug_key" ON "Contact"("workspaceId", "linkedinSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_workspaceId_email_key" ON "Contact"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_workspaceId_xHandle_key" ON "Contact"("workspaceId", "xHandle");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_contactId_key" ON "Lead"("contactId");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_status_idx" ON "Lead"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_stage_idx" ON "Lead"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_lastActivityAt_idx" ON "Lead"("workspaceId", "lastActivityAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_workspaceId_contactId_key" ON "Lead"("workspaceId", "contactId");

-- CreateIndex
CREATE INDEX "LeadSource_leadId_idx" ON "LeadSource"("leadId");

-- CreateIndex
CREATE INDEX "LeadSource_workspaceId_kind_idx" ON "LeadSource"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "LeadSearch_workspaceId_createdAt_idx" ON "LeadSearch"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LeadSearch_workspaceId_requestId_key" ON "LeadSearch"("workspaceId", "requestId");

-- CreateIndex
CREATE INDEX "LeadSearchResult_searchId_decision_idx" ON "LeadSearchResult"("searchId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSearchResult_searchId_providerRecordId_key" ON "LeadSearchResult"("searchId", "providerRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_workspaceId_requestId_key" ON "ImportBatch"("workspaceId", "requestId");

-- CreateIndex
CREATE INDEX "LeadEnrichment_contactId_field_fetchedAt_idx" ON "LeadEnrichment"("contactId", "field", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "BuyingSignal_workspaceId_eventType_occurredAt_idx" ON "BuyingSignal"("workspaceId", "eventType", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "BuyingSignal_accountId_idx" ON "BuyingSignal"("accountId");

-- CreateIndex
CREATE INDEX "BuyingSignal_contactId_idx" ON "BuyingSignal"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyingSignal_workspaceId_dedupeKey_key" ON "BuyingSignal"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE INDEX "SignalRule_workspaceId_enabled_idx" ON "SignalRule"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX "LeadScore_leadId_kind_isCurrent_idx" ON "LeadScore"("leadId", "kind", "isCurrent");

-- CreateIndex
CREATE INDEX "LeadResearch_leadId_computedAt_idx" ON "LeadResearch"("leadId", "computedAt" DESC);

-- CreateIndex
CREATE INDEX "Campaign_workspaceId_status_idx" ON "Campaign"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "CampaignAudience_campaignId_idx" ON "CampaignAudience"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignSequence_workspaceId_status_idx" ON "CampaignSequence"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceStep_sequenceId_index_key" ON "SequenceStep"("sequenceId", "index");

-- CreateIndex
CREATE INDEX "CampaignLead_workspaceId_status_nextActionAt_idx" ON "CampaignLead"("workspaceId", "status", "nextActionAt");

-- CreateIndex
CREATE INDEX "CampaignLead_leadId_idx" ON "CampaignLead"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignLead_campaignId_leadId_key" ON "CampaignLead"("campaignId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "StepRun_idempotencyKey_key" ON "StepRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StepRun_workspaceId_status_scheduledFor_idx" ON "StepRun"("workspaceId", "status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "StepRun_campaignLeadId_stepIndex_attempt_key" ON "StepRun"("campaignLeadId", "stepIndex", "attempt");

-- CreateIndex
CREATE INDEX "Message_workspaceId_status_idx" ON "Message"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_workspaceId_threadKey_idx" ON "Message"("workspaceId", "threadKey");

-- CreateIndex
CREATE UNIQUE INDEX "Message_workspaceId_providerMessageId_key" ON "Message"("workspaceId", "providerMessageId");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_status_lastMessageAt_idx" ON "Conversation"("workspaceId", "status", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Conversation_assignedUserId_idx" ON "Conversation"("assignedUserId");

-- CreateIndex
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_workspaceId_channel_externalThreadId_key" ON "Conversation"("workspaceId", "channel", "externalThreadId");

-- CreateIndex
CREATE INDEX "ReplyDecision_conversationId_decidedAt_idx" ON "ReplyDecision"("conversationId", "decidedAt" DESC);

-- CreateIndex
CREATE INDEX "Task_workspaceId_status_dueAt_idx" ON "Task"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Meeting_workspaceId_scheduledAt_idx" ON "Meeting"("workspaceId", "scheduledAt");

-- CreateIndex
CREATE INDEX "SenderAccount_workspaceId_channel_status_idx" ON "SenderAccount"("workspaceId", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMailbox_senderAccountId_key" ON "EmailMailbox"("senderAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMailbox_workspaceId_emailAddress_key" ON "EmailMailbox"("workspaceId", "emailAddress");

-- CreateIndex
CREATE INDEX "Integration_workspaceId_category_enabled_priority_idx" ON "Integration"("workspaceId", "category", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_workspaceId_category_provider_label_key" ON "Integration"("workspaceId", "category", "provider", "label");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_integrationId_key" ON "IntegrationCredential"("integrationId");

-- CreateIndex
CREATE INDEX "ProviderUsage_workspaceId_provider_occurredAt_idx" ON "ProviderUsage"("workspaceId", "provider", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "ProviderUsage_workspaceId_occurredAt_idx" ON "ProviderUsage"("workspaceId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookSubscription_workspaceId_enabled_idx" ON "WebhookSubscription"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_subscriptionId_eventId_attempt_key" ON "WebhookDelivery"("subscriptionId", "eventId", "attempt");

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalEventId_key" ON "WebhookEvent"("provider", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_workspaceId_kind_value_key" ON "SuppressionEntry"("workspaceId", "kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Unsubscribe_tokenHash_key" ON "Unsubscribe"("tokenHash");

-- CreateIndex
CREATE INDEX "Unsubscribe_workspaceId_email_idx" ON "Unsubscribe"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "ActivityEvent_workspaceId_occurredAt_idx" ON "ActivityEvent"("workspaceId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityEvent_workspaceId_action_occurredAt_idx" ON "ActivityEvent"("workspaceId", "action", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityEvent_leadId_occurredAt_idx" ON "ActivityEvent"("leadId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityEvent_campaignId_occurredAt_idx" ON "ActivityEvent"("campaignId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "BackgroundJob_workspaceId_status_idx" ON "BackgroundJob"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_queue_jobId_key" ON "BackgroundJob"("queue", "jobId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcpProfile" ADD CONSTRAINT "IcpProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAccount" ADD CONSTRAINT "TargetAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TargetAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TargetAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "LeadSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSearch" ADD CONSTRAINT "LeadSearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSearch" ADD CONSTRAINT "LeadSearch_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSearchResult" ADD CONSTRAINT "LeadSearchResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSearchResult" ADD CONSTRAINT "LeadSearchResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "LeadSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSearchResult" ADD CONSTRAINT "LeadSearchResult_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEnrichment" ADD CONSTRAINT "LeadEnrichment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEnrichment" ADD CONSTRAINT "LeadEnrichment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyingSignal" ADD CONSTRAINT "BuyingSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyingSignal" ADD CONSTRAINT "BuyingSignal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TargetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyingSignal" ADD CONSTRAINT "BuyingSignal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRule" ADD CONSTRAINT "SignalRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRule" ADD CONSTRAINT "SignalRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRule" ADD CONSTRAINT "SignalRule_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadResearch" ADD CONSTRAINT "LeadResearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadResearch" ADD CONSTRAINT "LeadResearch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAudience" ADD CONSTRAINT "CampaignAudience_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSequence" ADD CONSTRAINT "CampaignSequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSequence" ADD CONSTRAINT "CampaignSequence_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "CampaignSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLead" ADD CONSTRAINT "CampaignLead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLead" ADD CONSTRAINT "CampaignLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLead" ADD CONSTRAINT "CampaignLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLead" ADD CONSTRAINT "CampaignLead_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "CampaignSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLead" ADD CONSTRAINT "CampaignLead_senderAccountId_fkey" FOREIGN KEY ("senderAccountId") REFERENCES "SenderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepRun" ADD CONSTRAINT "StepRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepRun" ADD CONSTRAINT "StepRun_campaignLeadId_fkey" FOREIGN KEY ("campaignLeadId") REFERENCES "CampaignLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepRun" ADD CONSTRAINT "StepRun_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_campaignLeadId_fkey" FOREIGN KEY ("campaignLeadId") REFERENCES "CampaignLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderAccountId_fkey" FOREIGN KEY ("senderAccountId") REFERENCES "SenderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TargetAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_senderAccountId_fkey" FOREIGN KEY ("senderAccountId") REFERENCES "SenderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDecision" ADD CONSTRAINT "ReplyDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDecision" ADD CONSTRAINT "ReplyDecision_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDecision" ADD CONSTRAINT "ReplyDecision_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDecision" ADD CONSTRAINT "ReplyDecision_draftMessageId_fkey" FOREIGN KEY ("draftMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_campaignLeadId_fkey" FOREIGN KEY ("campaignLeadId") REFERENCES "CampaignLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_stepRunId_fkey" FOREIGN KEY ("stepRunId") REFERENCES "StepRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderAccount" ADD CONSTRAINT "SenderAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderAccount" ADD CONSTRAINT "SenderAccount_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMailbox" ADD CONSTRAINT "EmailMailbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMailbox" ADD CONSTRAINT "EmailMailbox_senderAccountId_fkey" FOREIGN KEY ("senderAccountId") REFERENCES "SenderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUsage" ADD CONSTRAINT "ProviderUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUsage" ADD CONSTRAINT "ProviderUsage_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unsubscribe" ADD CONSTRAINT "Unsubscribe_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unsubscribe" ADD CONSTRAINT "Unsubscribe_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unsubscribe" ADD CONSTRAINT "Unsubscribe_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
