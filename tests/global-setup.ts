/**
 * Starts an embedded Postgres for the test run (unless TEST_DATABASE_URL is
 * set), creates a fresh `arevei_gtm_test` database and applies migrations.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { randomBytes } from "node:crypto";

export default async function globalSetup() {
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
  process.env.JWT_SECRET ??= randomBytes(32).toString("base64url");
  process.env.APP_BASE_URL ??= "http://localhost:3000";
  process.env.SYSTEM_EMAIL_PROVIDER = "console";
// Tests assert on workspace-level providers only; never let a developer's .env keys leak in as system fallbacks.
process.env.ALLOW_SYSTEM_PROVIDER_FALLBACK = "false";
  process.env.LOG_LEVEL ??= "error";

  let stop: (() => Promise<void>) | undefined;
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const port = 54331;
    const dataDir = path.resolve(process.cwd(), ".local/pg-test");
    const fs = await import("node:fs");
    const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
    const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "arevei", password: "arevei", port, persistent: false });
    if (fresh) await pg.initialise();
    await pg.start();
    try {
      await pg.dropDatabase("arevei_gtm_test");
    } catch {
      /* did not exist */
    }
    await pg.createDatabase("arevei_gtm_test");
    url = `postgresql://arevei:arevei@localhost:${port}/arevei_gtm_test`;
    stop = () => pg.stop();
  }
  process.env.DATABASE_URL = url;
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  // Hand the URL to test workers.
  process.env.TEST_DATABASE_URL_RESOLVED = url;
  return async () => {
    await stop?.();
  };
}
