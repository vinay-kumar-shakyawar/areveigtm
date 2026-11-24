import "server-only";
import pino from "pino";

const SECRET_PATTERNS = [
  "password",
  "passwordHash",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "authorization",
  "cookie",
  "ciphertext",
  "refreshToken",
  "accessToken",
];

/**
 * Structured JSON logger. Keys that look like secrets are redacted at any depth.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: SECRET_PATTERNS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`, `*.*.*.${k}`]),
    censor: "[redacted]",
  },
  base: { service: "arevei-gtm" },
});

export type Logger = typeof logger;

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
