/**
 * Starts an embedded PostgreSQL server for local development and tests when
 * Docker is not available. Data lives in .local/pg (git-ignored).
 *
 *   npm run dev:db            # start on port 54329 and keep running
 *   DEV_DB_PORT=54330 ...     # custom port
 *
 * The DATABASE_URL that matches the defaults is in .env.example.
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

const port = Number(process.env.DEV_DB_PORT ?? 54329);
const dataDir = path.resolve(process.cwd(), process.env.DEV_DB_DIR ?? ".local/pg");
const user = "arevei";
const password = "arevei";
const dbName = process.env.DEV_DB_NAME ?? "arevei_gtm";

async function main() {
  const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: true,
  });
  if (fresh) {
    console.log(`[dev-db] initialising cluster in ${dataDir}`);
    await pg.initialise();
  }
  await pg.start();
  if (fresh) {
    await pg.createDatabase(dbName);
  }
  console.log(`[dev-db] ready: postgresql://${user}:${password}@localhost:${port}/${dbName}`);

  const stop = async () => {
    console.log("[dev-db] stopping");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error("[dev-db] failed", err);
  process.exit(1);
});
