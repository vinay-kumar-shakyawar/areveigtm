import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Credential vault: AES-256-GCM with a versioned key. This is the only module
 * allowed to read `IntegrationCredential.ciphertext` or webhook secrets.
 * Never return plaintext secrets from an API handler.
 */

export const CURRENT_KEY_VERSION = 1;

function keyFor(version: number): Buffer {
  if (version !== CURRENT_KEY_VERSION) {
    // Key rotation hook: older versions would be read from ENCRYPTION_KEY_V<n>.
    const legacy = process.env[`ENCRYPTION_KEY_V${version}`];
    if (!legacy) throw new Error(`No encryption key for version ${version}`);
    return Buffer.from(legacy, "base64");
  }
  return Buffer.from(env().ENCRYPTION_KEY, "base64");
}

export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export function seal(plaintext: string, aad?: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(CURRENT_KEY_VERSION), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: CURRENT_KEY_VERSION };
}

export function open(sealed: SealedSecret, aad?: string): string {
  const decipher = createDecipheriv("aes-256-gcm", keyFor(sealed.keyVersion), sealed.iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(sealed.authTag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
}

/** Prisma `Bytes` columns want plain Uint8Array values. */
export function sealedToDb(s: SealedSecret): { ciphertext: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; authTag: Uint8Array<ArrayBuffer>; keyVersion: number } {
  return { ciphertext: toBytes(s.ciphertext), iv: toBytes(s.iv), authTag: toBytes(s.authTag), keyVersion: s.keyVersion };
}

export function toBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(buf.length));
  out.set(buf);
  return out;
}

/** Seal a JSON credential object. */
export function sealJson(value: unknown, aad?: string): SealedSecret {
  return seal(JSON.stringify(value), aad);
}

export function openJson<T = unknown>(sealed: SealedSecret, aad?: string): T {
  return JSON.parse(open(sealed, aad)) as T;
}

/** Last four characters of the most identifying secret field, for display. */
export function fingerprintOf(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return "••••";
  return `…${trimmed.slice(-4)}`;
}
