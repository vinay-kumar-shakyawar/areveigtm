# AREVEI GTM

AI-powered go-to-market platform owned by AREVEI: find buyers that match your ICP,
research them, run approved multichannel outreach from your own accounts, triage
replies in one inbox, and measure everything from stored events. Inspired by the
public surface of PumpGTM, built independently on AREVEI's own infrastructure and
provider keys. No PumpGTM services are used.

## What it does

| Area | Capability |
|---|---|
| Company & ICP | Draft a company profile from your website, approve it, build ICPs with AI help |
| Lead intelligence | Search people through your data providers (Apollo, People Data Labs, Hunter, Snov), preview and review results, dedupe, enrich with provenance, buying signals, AI research with explained fit/intent/timing scores |
| Campaigns | Sequences across email, LinkedIn and X with stop rules, AI drafts grounded in verified facts, review queue, scheduler with sending windows and daily limits |
| Channels | Email via Resend, SendGrid, Amazon SES, any SMTP/IMAP mailbox, Gmail or Microsoft 365 (OAuth); LinkedIn only through an authorized provider (Unipile); X through the official API; otherwise manual tasks |
| Inbox | Replies from every channel, AI classification and drafts, human decisions, optional high-confidence auto-send, meetings |
| Analytics | Funnel, reply rate, positive reply rate, meetings, bounce/unsubscribe rates, channel/campaign/sender tables, provider cost |
| Platform | Multi-workspace, roles, encrypted credential vault, API keys, outbound webhooks, audit log, notifications |

## Run locally

Requirements: Node 22+, npm. No Docker or Postgres needed: an embedded Postgres
starts on demand.

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # paste as ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" # paste as JWT_SECRET
npm install
npm run dev:db        # terminal 1: embedded Postgres on :54329 (data in .local/pg)
npx prisma migrate deploy
npm run dev           # terminal 2: http://localhost:3000
```

Sign up, create a workspace, then add providers under **Integrations**. For a
fully offline tour choose the **Mock** providers (development only): they return
labelled fake data and capture email instead of sending it.

Background jobs run inline in development. To run the real worker (pg-boss):

```bash
JOBS_BACKEND=pgboss npm run dev:worker
```

## Test

```bash
npm run typecheck && npm run lint
npm test              # unit + integration (embedded Postgres on :54331, no network, mock providers)
npm run e2e           # browser smoke over CDP; needs a dev server on :3100 and Chrome with --remote-debugging-port=9222
```

## Deploy

```bash
docker compose up --build   # web + worker + Postgres + Mailpit; migrations run on start
```

See [docs/deployment.md](docs/deployment.md) for production settings, backups and health checks.

## Documentation

- [docs/architecture.md](docs/architecture.md): modules, data flow, jobs
- [docs/api.md](docs/api.md): REST API, auth, idempotency, webhooks
- [docs/database.md](docs/database.md): schema overview and migrations
- [docs/integrations.md](docs/integrations.md): providers, credentials, OAuth and channel setup
- [docs/security.md](docs/security.md): threat model and controls
- [docs/analytics/metrics.md](docs/analytics/metrics.md): metric definitions
- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md): what is done, what is pending
- [docs/FINAL_REPORT.md](docs/FINAL_REPORT.md): delivery report
- [docs/reverse-engineering/](docs/reverse-engineering/): Phase 0 investigation with evidence

## Rules this codebase follows

- Secrets stay on the server, encrypted at rest (AES-256-GCM); they never reach the browser, logs or exports.
- Nothing is sent to a prospect without a human approval, unless a workspace explicitly enables high-confidence auto-send for replies.
- LinkedIn is never automated with scraping, cookies or anti-detection; only authorized provider APIs or manual tasks.
- AI output is grounded in stored facts and labelled; unknowns are stated, not invented.
