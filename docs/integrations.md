# Integrations and providers

Workspaces bring their own keys under **Integrations**. Credentials are encrypted at
rest with the server's `ENCRYPTION_KEY`, shown once, fingerprinted for display and
only opened on the server immediately before a provider call. Several providers per
category give automatic fallback in priority order.

System-level keys in `.env` are used only when `ALLOW_SYSTEM_PROVIDER_FALLBACK=true`
and the workspace has no provider of its own.

## Catalogue

| Category | Providers | Capabilities | Status |
|---|---|---|---|
| AI models | Anthropic (default `claude-opus-5-5`), OpenAI, DeepSeek, OpenRouter (OpenAI-compatible), Google Gemini, Amazon Bedrock | text + structured output | implemented; verified with mock only in this environment |
| Lead data | Apollo, People Data Labs, Hunter, Snov | people search, enrichment, email find/verify | Hunter search (Discover → Domain Search), email finder verified live 2026-11-22; Apollo, PDL, Snov unverified |
| Company research | Exa, Firecrawl, built-in fetcher (keyless) | web search, page fetch | built-in fetcher exercised; others unverified live |
| Signals | provider adapters over people/company data + manual signals + rules | hiring and other signals | implemented |
| Email sending | Resend, SendGrid, Amazon SES, SMTP | `email.send`, domain status | implemented; unverified live |
| Mailboxes | SMTP+IMAP (any host, app passwords), Gmail / Google Workspace (OAuth), Microsoft 365 (OAuth) | send + read replies | implemented; OAuth consent screens unverified live |
| LinkedIn | Unipile (hosted auth) | invite, message, inbox, profile | implemented from public docs; unverified live |
| X | Official API v2 (OAuth 2.0 PKCE) | DM, followers, profile | implemented; unverified live |
| Mock | every category | deterministic fake data, captured sends | development and tests only; hidden in production |

## Setting up channels

### Email provider (Resend / SendGrid / SES)

1. Add the integration with its API key (SES: access key + secret, region in config).
2. Integrations → **Sending accounts** → *Add email sender*: choose the integration and the from address on a domain verified with the provider.
3. Press the shield icon to check SPF, DKIM, DMARC and MX; press the paper-plane icon to send a test email to yourself.
4. Point the provider's event webhook at the URL shown under *Delivery webhooks* and paste the signing secret / verification key into the integration so bounces, complaints and deliveries flow back.

### Any mailbox (SMTP + IMAP)

Add the *Any mailbox* integration with the mailbox address, SMTP host/port/user/password and optional IMAP settings (needed to read replies). Google Workspace and Microsoft 365 work with app passwords. Replies are polled every two minutes by the worker, or on demand with the sync icon.

### Gmail / Microsoft 365 (OAuth)

Set `GOOGLE_OAUTH_CLIENT_ID/SECRET` or `MICROSOFT_OAUTH_CLIENT_ID/SECRET` on the server with redirect URIs `{APP_BASE_URL}/api/oauth/google/callback` and `{APP_BASE_URL}/api/oauth/microsoft/callback`. Scopes: `gmail.send` + `gmail.readonly` (Google), `Mail.Send` + `Mail.Read` + `offline_access` (Microsoft). Then press *Connect Gmail* / *Connect Microsoft 365*. Tokens are stored encrypted per workspace and refreshed server-side.

### LinkedIn (Unipile)

Add the Unipile integration (DSN + API key). Under Sending accounts → LinkedIn press *Connect LinkedIn account*: the member links their own LinkedIn on Unipile's hosted page. AREVEI never asks for LinkedIn credentials or cookies and does no browser automation. *Sync accounts* pulls the provider's account list; *Register reply webhooks* subscribes the deployment to message and account-status events. Default caps: invitations warm up 5/7/10/15/16/20 per day with a hard ceiling of 30; messages 50/day. Without a connected account every LinkedIn step becomes a manual task.

### X

Set `X_CLIENT_ID` (and `X_CLIENT_SECRET` for confidential clients) with redirect URI `{APP_BASE_URL}/api/oauth/x/callback` on a developer project that has DM access. Press *Connect X account*. DMs use the official API; nothing else is automated.

## Health and usage

Each integration has *Test* (connectivity check), health status and last error. Every provider call is recorded in `ProviderUsage` (operation, units, estimated cost, lead and campaign attribution); the Integrations page shows a 30-day usage table and Analytics shows cost per provider.
