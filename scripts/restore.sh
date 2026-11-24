#!/usr/bin/env bash
# Restore a backup produced by scripts/backup.sh into DATABASE_URL.
#   DATABASE_URL=postgresql://... ./scripts/restore.sh backups/arevei-gtm-20261118T020000Z.dump
# Restores into an EMPTY database. Verify the checksum first; the script refuses on mismatch.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
dump="${1:?path to .dump file}"
if [ -f "$dump.sha256" ]; then
  (cd "$(dirname "$dump")" && (sha256sum -c "$(basename "$dump").sha256" 2>/dev/null || shasum -a 256 -c "$(basename "$dump").sha256"))
fi
read -r -p "Restore $dump into $DATABASE_URL? This overwrites existing tables. [y/N] " ok
[ "$ok" = "y" ] || { echo "aborted"; exit 1; }
pg_restore --clean --if-exists --no-owner --no-privileges --jobs=4 --dbname="$DATABASE_URL" "$dump"
echo "restored. Run 'npx prisma migrate deploy' to apply any migrations newer than the backup."
