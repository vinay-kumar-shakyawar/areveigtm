import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Opaque random token (base64url) and its SHA-256 hash for storage. */
export function newOpaqueToken(bytes = 32): { token: string; tokenHash: string } {
  const token = randomBytes(bytes).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 6-digit numeric one-time code. */
export function newOneTimeCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** HMAC of a code bound to the email + purpose so a code for one email cannot be replayed on another. */
export function codeHash(email: string, purpose: string, code: string): string {
  return createHmac("sha256", env().JWT_SECRET).update(`${email.toLowerCase()}|${purpose}|${code}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Hash an IP for audit purposes without storing the raw address. */
export function ipHash(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", env().JWT_SECRET).update(ip).digest("hex").slice(0, 32);
}
