import nodemailer from "nodemailer";
import type { InboundEmail, MailboxProvider, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { ProviderError } from "@/server/providers/types";

/**
 * Any mailbox over SMTP (send) + IMAP (read). Works for Google Workspace and
 * Microsoft 365 with app passwords as well as generic hosts.
 */
export interface SmtpImapCreds {
  emailAddress: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  imapHost?: string;
  imapPort?: string;
  imapUser?: string;
  imapPass?: string;
}
interface Config {
  smtpSecure?: boolean;
  imapSecure?: boolean;
  fromName?: string;
}

export function createSmtpImap(creds: SmtpImapCreds, config: Config, usage: UsageSink): MailboxProvider {
  const smtpPort = Number(creds.smtpPort || 587);
  const transport = () =>
    nodemailer.createTransport({
      host: creds.smtpHost,
      port: smtpPort,
      secure: config.smtpSecure ?? smtpPort === 465,
      auth: { user: creds.smtpUser, pass: creds.smtpPass },
      connectionTimeout: 15_000,
    });
  const hasImap = Boolean(creds.imapHost);

  return {
    id: "smtp_imap",
    category: "mailbox",
    async testConnection() {
      const started = Date.now();
      try {
        await transport().verify();
        let imapNote = "IMAP not configured (replies will not be read)";
        if (hasImap) {
          const { ImapFlow } = await import("imapflow");
          const client = new ImapFlow({ host: creds.imapHost!, port: Number(creds.imapPort || 993), secure: config.imapSecure ?? true, auth: { user: creds.imapUser || creds.smtpUser, pass: creds.imapPass || creds.smtpPass }, logger: false });
          await client.connect();
          await client.logout();
          imapNote = "IMAP ok";
        }
        return { ok: true, message: `SMTP ok; ${imapNote}`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async send(email) {
      try {
        const info = await transport().sendMail({
          from: { name: email.from.name ?? config.fromName ?? "", address: email.from.email },
          to: email.to.name ? { name: email.to.name, address: email.to.email } : email.to.email,
          replyTo: email.replyTo,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: email.headers,
          inReplyTo: email.inReplyTo,
          references: email.references,
        });
        usage({ operation: "email.send", units: 1, unitLabel: "emails" });
        return { providerMessageId: info.messageId, accepted: Boolean(info.accepted?.length) };
      } catch (err) {
        const msg = (err as Error).message;
        throw new ProviderError("smtp_imap", /auth|535|534/i.test(msg) ? "auth" : /4\d\d|rate|too many/i.test(msg) ? "rate_limited" : "unavailable", msg);
      }
    },
    async fetchInbound(cursor) {
      if (!hasImap) return { messages: [] };
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({ host: creds.imapHost!, port: Number(creds.imapPort || 993), secure: config.imapSecure ?? true, auth: { user: creds.imapUser || creds.smtpUser, pass: creds.imapPass || creds.smtpPass }, logger: false });
      const lastUid = Number((cursor as { uid?: number } | undefined)?.uid ?? 0);
      const messages: InboundEmail[] = [];
      let maxUid = lastUid;
      await client.connect();
      try {
        const lock = await client.getMailboxLock("INBOX");
        try {
          const range = lastUid > 0 ? `${lastUid + 1}:*` : { since: new Date(Date.now() - 7 * 86400_000) };
          for await (const msg of client.fetch(range, { uid: true, envelope: true, source: true }, { uid: typeof range === "string" })) {
            if (msg.uid <= lastUid) continue;
            maxUid = Math.max(maxUid, msg.uid);
            const env = msg.envelope;
            const from = env?.from?.[0];
            const text = extractText(msg.source?.toString("utf8") ?? "");
            messages.push({
              providerMessageId: env?.messageId ?? `imap:${msg.uid}`,
              inReplyTo: env?.inReplyTo ?? undefined,
              from: { email: from?.address ?? "", name: from?.name ?? undefined },
              to: (env?.to ?? []).map((t) => t.address ?? "").filter(Boolean),
              subject: env?.subject ?? undefined,
              text,
              receivedAt: new Date(env?.date ?? Date.now()).toISOString(),
            });
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout().catch(() => {});
      }
      usage({ operation: "email.inbound", units: messages.length, unitLabel: "messages" });
      return { messages, nextCursor: { uid: maxUid } };
    },
  };
}

/** Minimal MIME text extraction: prefers text/plain, strips quoted history. */
export function extractText(raw: string): string {
  const [headerPart, ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const headers = headerPart ?? "";
  let body = bodyParts.join("\n\n");
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(headers)?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`);
    const plain = parts.find((p) => /content-type:\s*text\/plain/i.test(p));
    const chosen = plain ?? parts.find((p) => /content-type:\s*text\/html/i.test(p)) ?? "";
    const [, ...rest] = chosen.split(/\r?\n\r?\n/);
    body = rest.join("\n\n");
    if (/content-transfer-encoding:\s*base64/i.test(chosen)) body = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    if (/content-transfer-encoding:\s*quoted-printable/i.test(chosen)) body = decodeQuotedPrintable(body);
    if (!plain) body = body.replace(/<[^>]+>/g, " ");
  } else if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    body = decodeQuotedPrintable(body);
  } else if (/content-transfer-encoding:\s*base64/i.test(headers)) {
    body = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  }
  if (!boundary && /content-type:\s*text\/html/i.test(headers)) body = body.replace(/<[^>]+>/g, " ");
  // Drop quoted replies and signatures.
  const lines = body.split(/\r?\n/);
  const cut = lines.findIndex((l) => /^(On .+wrote:|>|-----Original Message-----|From: .+)/.test(l.trim()));
  const kept = cut > 0 ? lines.slice(0, cut) : lines;
  return kept.join("\n").trim().slice(0, 20000);
}

function decodeQuotedPrintable(s: string): string {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

export const smtpImapDescriptor: ProviderDescriptor<SmtpImapCreds, Config> = {
  id: "smtp_imap",
  category: "mailbox",
  displayName: "Any mailbox (SMTP + IMAP)",
  description: "Send from your own mailbox over SMTP and read replies over IMAP. Use an app password for Google Workspace or Microsoft 365.",
  capabilities: ["email.send", "email.inbound", "mailbox.connect"],
  credentialFields: [
    { key: "emailAddress", label: "Mailbox email address", type: "text", required: true },
    { key: "smtpHost", label: "SMTP host", type: "text", required: true, placeholder: "smtp.gmail.com" },
    { key: "smtpPort", label: "SMTP port", type: "text", required: true, placeholder: "587" },
    { key: "smtpUser", label: "SMTP username", type: "text", required: true },
    { key: "smtpPass", label: "SMTP password / app password", type: "secret", required: true },
    { key: "imapHost", label: "IMAP host (for replies)", type: "text", required: false, placeholder: "imap.gmail.com" },
    { key: "imapPort", label: "IMAP port", type: "text", required: false, placeholder: "993" },
    { key: "imapUser", label: "IMAP username (if different)", type: "text", required: false },
    { key: "imapPass", label: "IMAP password (if different)", type: "secret", required: false },
  ],
  configFields: [
    { key: "fromName", label: "From name", type: "text" },
    { key: "smtpSecure", label: "SMTP uses TLS on connect (port 465)", type: "boolean", default: false },
  ],
  create: ({ credentials, config, usage }) => createSmtpImap(credentials, config, usage),
};
