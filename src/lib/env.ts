import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Parsed once; secrets never leave this module except
 * through the typed accessors below. Client components must never import this.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64 encoded"),
  JWT_SECRET: z.string().min(16),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  REDIS_URL: z.string().optional(),
  SEED_DEMO: z.string().optional(),
  ALLOW_SYSTEM_PROVIDER_FALLBACK: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  SYSTEM_EMAIL_PROVIDER: z.enum(["smtp", "resend", "sendgrid", "ses", "console"]).default("console"),
  SYSTEM_EMAIL_FROM: z.string().default("AREVEI GTM <no-reply@example.com>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default("us-east-1"),

  APOLLO_API_KEY: z.string().optional(),
  PEOPLE_DATA_LABS_API_KEY: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),
  SNOV_CLIENT_ID: z.string().optional(),
  SNOV_CLIENT_SECRET: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  SENDGRID_WEBHOOK_PUBLIC_KEY: z.string().optional(),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_ID: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_OAUTH_TENANT: z.string().default("common"),

  UNIPILE_DSN: z.string().optional(),
  UNIPILE_API_KEY: z.string().optional(),
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

function emptyToUndefined(input: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(input)) out[k] = v === "" ? undefined : v;
  return out;
}

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(emptyToUndefined(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}

/** Names of env vars that must never be logged. Used by the logger redaction. */
export const SECRET_ENV_KEYS = [
  "ENCRYPTION_KEY",
  "JWT_SECRET",
  "SMTP_PASS",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENROUTER_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "APOLLO_API_KEY",
  "PEOPLE_DATA_LABS_API_KEY",
  "HUNTER_API_KEY",
  "SNOV_CLIENT_SECRET",
  "EXA_API_KEY",
  "FIRECRAWL_API_KEY",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "MICROSOFT_OAUTH_CLIENT_SECRET",
  "UNIPILE_API_KEY",
  "X_CLIENT_SECRET",
] as const;
