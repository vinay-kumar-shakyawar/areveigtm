import { createHmac, createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isTrustedSnsCertUrl, verifySendGridSignature, verifySnsSignature, verifySvixSignature } from "@/server/modules/inbound/signatures";
import { extractText } from "@/server/providers/mailbox/imap-smtp";

describe("inbound webhook signatures", () => {
  it("verifies Svix (Resend) signatures and rejects stale or forged ones", () => {
    const secret = `whsec_${Buffer.from("super-secret-key-for-tests").toString("base64")}`;
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
    const id = "msg_123";
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
    expect(verifySvixSignature(secret, { id, timestamp: ts, signature: `v1,${sig}` }, body)).toBe(true);
    expect(verifySvixSignature(secret, { id, timestamp: ts, signature: `v1,other v1,${sig}` }, body)).toBe(true);
    expect(verifySvixSignature(secret, { id, timestamp: ts, signature: `v1,${sig}` }, body + " ")).toBe(false);
    expect(verifySvixSignature(secret, { id, timestamp: String(Number(ts) - 3600), signature: `v1,${sig}` }, body)).toBe(false);
    expect(verifySvixSignature(secret, { id: null, timestamp: ts, signature: `v1,${sig}` }, body)).toBe(false);
  });

  it("verifies SendGrid ECDSA signatures", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const body = JSON.stringify([{ event: "delivered", sg_event_id: "e1" }]);
    const ts = String(Math.floor(Date.now() / 1000));
    const signer = createSign("sha256");
    signer.update(ts + body);
    const sig = signer.sign({ key: privateKey, dsaEncoding: "der" }).toString("base64");
    expect(verifySendGridSignature(pub, sig, ts, body)).toBe(true);
    expect(verifySendGridSignature(pub, sig, ts, body + "x")).toBe(false);
    expect(verifySendGridSignature("not-a-key", sig, ts, body)).toBe(false);
  });

  it("verifies SNS notifications only from trusted certificate hosts", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = publicKey.export({ type: "spki", format: "pem" }) as string;
    const msg = { Type: "Notification", MessageId: "m1", TopicArn: "arn:aws:sns:us-east-1:1:ses", Message: JSON.stringify({ notificationType: "Bounce" }), Timestamp: "2026-11-17T00:00:00.000Z", SignatureVersion: "1", Signature: "", SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem" };
    const canonical = ["Message", "MessageId", "Timestamp", "TopicArn", "Type"].map((f) => `${f}\n${(msg as Record<string, string>)[f]}\n`).join("");
    const signer = createSign("sha1");
    signer.update(canonical);
    msg.Signature = signer.sign(privateKey).toString("base64");
    const fetchImpl = (async () => new Response(pem)) as unknown as typeof fetch;
    expect(await verifySnsSignature(msg, fetchImpl)).toBe(true);
    expect(await verifySnsSignature({ ...msg, Message: "tampered" }, fetchImpl)).toBe(false);
    expect(isTrustedSnsCertUrl("https://evil.example.com/sns.pem")).toBe(false);
    expect(isTrustedSnsCertUrl("http://sns.us-east-1.amazonaws.com/x.pem")).toBe(false);
    expect(await verifySnsSignature({ ...msg, SigningCertURL: "https://evil.example.com/sns.pem" }, fetchImpl)).toBe(false);
  });
});

describe("MIME text extraction", () => {
  it("prefers text/plain, decodes quoted-printable, and strips quoted history", () => {
    const raw = [
      "From: a@b.test",
      'Content-Type: multipart/alternative; boundary="XYZ"',
      "",
      "--XYZ",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Sounds good =E2=80=94 Tuesday works.",
      "",
      "On Mon, Sam wrote:",
      "> original",
      "--XYZ",
      "Content-Type: text/html",
      "",
      "<p>html</p>",
      "--XYZ--",
    ].join("\r\n");
    expect(extractText(raw)).toBe("Sounds good â\u0080\u0094 Tuesday works.".replace("â\u0080\u0094", "â\u0080\u0094"));
  });

  it("falls back to html with tags stripped", () => {
    const raw = ["Content-Type: text/html", "", "<div>Hello <b>there</b></div>"].join("\r\n");
    expect(extractText(raw).replace(/\s+/g, " ")).toContain("Hello there");
  });
});
