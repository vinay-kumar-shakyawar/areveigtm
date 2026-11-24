# Deployment

## Components

| Process | Image target | Purpose |
|---|---|---|
| `web` | `Dockerfile` (Next.js standalone; the default/last stage) | UI + API, runs `prisma migrate deploy` before start |
| `worker` | `Dockerfile.worker` | pg-boss worker: campaign ticks, inbox polling, webhook retries |
| `postgres` | `postgres:16` | the only required dependency |

`docker-compose.yml` wires these plus Mailpit (local SMTP sink). One instance of each is enough for a small team; run several `web` replicas behind a load balancer only after moving the rate limiter to a shared store.

## Environment

Required: `DATABASE_URL`, `APP_BASE_URL` (public https URL; used for OAuth callbacks, unsubscribe links and webhook URLs), `ENCRYPTION_KEY` (32 random bytes, base64), `JWT_SECRET`, `NODE_ENV=production`, `JOBS_BACKEND=pgboss` on the worker.

Transactional email for sign-in codes and invitations: `SYSTEM_EMAIL_PROVIDER` (`smtp|resend|sendgrid|ses|console`) and `SYSTEM_EMAIL_FROM` plus that provider's keys.

Optional: OAuth app credentials (Google, Microsoft, X), system-level provider keys with `ALLOW_SYSTEM_PROVIDER_FALLBACK`, `LOG_LEVEL`. See `.env.example` for every variable.

Rotating `ENCRYPTION_KEY`: the vault supports key versions; add the new key as the current version and re-seal credentials on next write. A bulk re-encrypt command is not provided yet.

## Steps

```bash
cp .env.example .env            # fill the required block
docker compose up --build -d    # web on :3000, worker, postgres, mailpit on :8025
docker compose logs -f web worker
```

Without Docker: `npm ci && npm run build && npx prisma migrate deploy && npm start` for the web, `JOBS_BACKEND=pgboss npm run worker` for the worker.

Put TLS in front (Caddy, nginx, a cloud load balancer) and set `APP_BASE_URL` to the https origin before connecting OAuth mailboxes or registering provider webhooks.

## Health checks

- `GET /api/health`: liveness; the Docker image uses it.
- `GET /api/ready`: performs a database round-trip; returns 503 when the database is unreachable. Use it for load-balancer readiness.
- Worker: logs `worker starting` with the job list; `BackgroundJob` rows show recent activity (Settings → Audit log shows administrative actions).

## Backups

Nightly `pg_dump` with retention:

```bash
DATABASE_URL=postgresql://… BACKUP_DIR=/var/backups/arevei RETENTION_DAYS=14 ./scripts/backup.sh
```

Restore into an empty database, then apply newer migrations:

```bash
DATABASE_URL=postgresql://… ./scripts/restore.sh /var/backups/arevei/arevei-gtm-20261118T020000Z.dump
npx prisma migrate deploy
```

Back up `ENCRYPTION_KEY` separately and securely: without it the credential, OAuth token and webhook secret columns in a restored database cannot be opened. Test a restore quarterly.

## Scheduled jobs

The worker schedules `campaign.tick-all` every minute, `inbox.sync-all` every two minutes and `webhook.flush` every minute through pg-boss. No external cron is needed.

## Upgrades

1. `git pull`, `npm ci`, `npm run build`.
2. Deploy `web` (it runs `prisma migrate deploy`), then `worker`.
3. Migrations are additive; check `prisma/migrations` for anything that needs a backfill.

## Observability

Logs are JSON (pino) on stdout with `requestId`, route, latency and redacted secrets; ship them to your log store. Provider spend per workspace is visible under Integrations → Usage and Analytics → Provider usage.
