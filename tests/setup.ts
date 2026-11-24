import { randomBytes } from "node:crypto";
import { afterAll, beforeAll } from "vitest";

Object.assign(process.env, { NODE_ENV: "test" });
process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.JWT_SECRET ??= randomBytes(32).toString("base64url");
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.SYSTEM_EMAIL_PROVIDER = "console";
// Tests assert on workspace-level providers only; never let a developer's .env keys leak in as system fallbacks.
process.env.ALLOW_SYSTEM_PROVIDER_FALLBACK = "false";
process.env.LOG_LEVEL ??= "error";
if (process.env.TEST_DATABASE_URL_RESOLVED) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL_RESOLVED;
process.env.DATABASE_URL ??= "postgresql://arevei:arevei@localhost:54331/arevei_gtm_test";

beforeAll(() => {
  /* env is prepared above; nothing else */
});

afterAll(async () => {
  const { prisma } = await import("@/server/db/client");
  await prisma.$disconnect();
});
