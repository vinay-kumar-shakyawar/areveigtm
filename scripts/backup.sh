#!/usr/bin/env bash
# Nightly Postgres backup with retention. Requires pg_dump on PATH.
#   DATABASE_URL=postgresql://... BACKUP_DIR=/var/backups/arevei RETENTION_DAYS=14 ./scripts/backup.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/arevei-gtm-$stamp.dump"
# Custom format: compressed, restorable per table, works with pg_restore --jobs.
pg_dump --format=custom --no-owner --no-privileges --file="$out" "$DATABASE_URL"
sha256sum "$out" > "$out.sha256" 2>/dev/null || shasum -a 256 "$out" > "$out.sha256"
echo "wrote $out ($(du -h "$out" | cut -f1))"
# Retention: delete dumps older than RETENTION_DAYS.
find "$BACKUP_DIR" -name 'arevei-gtm-*.dump' -mtime +"$RETENTION_DAYS" -print -delete
find "$BACKUP_DIR" -name 'arevei-gtm-*.dump.sha256' -mtime +"$RETENTION_DAYS" -delete
