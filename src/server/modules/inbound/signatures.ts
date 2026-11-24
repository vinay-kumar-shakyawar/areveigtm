import { createHmac, createPublicKey, createVerify, timingSafeEqual } from "node:crypto";

/** Constant-time string compare that tolerates length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Svix-style signature used by Resend: `svix-id`, `svix-timestamp`,
 * `svix-signature: v1,<base64>` (space separated list). Secret is `whsec_<base64>`.
 */
export function verifySvixSignature(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, rawBody: string, toleranceSec = 300): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest("base64");
  return headers.signature
    .split(" ")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((entry) => {
      const [version, sig] = entry.split(",");
      return version === "v1" && sig !== undefined && safeEqual(sig, expected);
    });
}

/**
 * SendGrid Event Webhook signature (ECDSA P-256, SHA-256). The verification key
 * is the base64 DER public key shown in SendGrid's UI.
 */
export function verifySendGridSignature(publicKeyBase64: string, signatureBase64: string | null, timestamp: string | null, rawBody: string): boolean {
  if (!signatureBase64 || !timestamp) return false;
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyBase64, "base64"), format: "der", type: "spki" });
    const verifier = createVerify("sha256");
    verifier.update(timestamp + rawBody);
    return verifier.verify({ key, dsaEncoding: "der" }, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}

/** Amazon SNS message signature verification (SignatureVersion 1 = SHA1, 2 = SHA256). */
const certCache = new Map<string, Promise<string>>();

export interface SnsMessage {
  Type: string;
  MessageId: string;
  TopicArn?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  Token?: string;
  SubscribeURL?: string;
}

export function isTrustedSnsCertUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname) && u.pathname.endsWith(".pem");
  } catch {
    return false;
  }
}

export async function verifySnsSignature(msg: SnsMessage, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!isTrustedSnsCertUrl(msg.SigningCertURL)) return false;
  const fields = msg.Type === "Notification" ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  const canonical = fields
    .filter((f) => (msg as unknown as Record<string, string | undefined>)[f] !== undefined)
    .map((f) => `${f}\n${(msg as unknown as Record<string, string>)[f]}\n`)
    .join("");
  let certPromise = certCache.get(msg.SigningCertURL);
  if (!certPromise) {
    certPromise = fetchImpl(msg.SigningCertURL).then((r) => r.text());
    certCache.set(msg.SigningCertURL, certPromise);
  }
  try {
    const cert = await certPromise;
    const verifier = createVerify(msg.SignatureVersion === "2" ? "sha256" : "sha1");
    verifier.update(canonical, "utf8");
    return verifier.verify(cert, msg.Signature, "base64");
  } catch {
    certCache.delete(msg.SigningCertURL);
    return false;
  }
}

/** HMAC token binding a public callback URL to one integration (used for provider notify URLs). */
export function callbackToken(secret: string, ...parts: string[]): string {
  return createHmac("sha256", secret).update(parts.join("|")).digest("hex").slice(0, 32);
}
