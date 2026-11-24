import type { InboundEmail, MailboxProvider, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";
import { extractText } from "@/server/providers/mailbox/imap-smtp";
import { patchCredentials } from "@/server/providers/credential-store";

/**
 * Gmail / Google Workspace through the Gmail REST API with OAuth 2.0 tokens
 * obtained by the /api/oauth/google flow. Scopes: gmail.send, gmail.readonly.
 */
export interface GoogleMailboxCreds {
  emailAddress: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  clientId: string;
  clientSecret: string;
}
interface Config {
  fromName?: string;
}

export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/userinfo.email"];

export async function refreshGoogleToken(creds: GoogleMailboxCreds): Promise<{ accessToken: string; expiresAt: string }> {
  const { data } = await providerFetch<{ access_token: string; expires_in: number }>("google", "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret }).toString(),
  });
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() };
}

export function createGoogleMailbox(creds: GoogleMailboxCreds, config: Config, usage: UsageSink, onTokenRefresh?: (t: { accessToken: string; expiresAt: string }) => Promise<void>): MailboxProvider {
  let token = creds.accessToken;
  let expiresAt = new Date(creds.expiresAt).getTime();
  async function auth(): Promise<Record<string, string>> {
    if (Date.now() > expiresAt - 60_000) {
      const t = await refreshGoogleToken(creds);
      token = t.accessToken;
      expiresAt = new Date(t.expiresAt).getTime();
      await onTokenRefresh?.(t);
    }
    return { Authorization: `Bearer ${token}` };
  }
  const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
  return {
    id: "google",
    category: "mailbox",
    async testConnection() {
      const started = Date.now();
      try {
        const { data } = await providerFetch<{ emailAddress: string }>("google", `${BASE}/profile`, { headers: await auth() });
        return { ok: true, message: `Connected as ${data.emailAddress}`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async send(email) {
      const mime = [
        `From: ${email.from.name ? `${email.from.name} <${email.from.email}>` : email.from.email}`,
        `To: ${email.to.email}`,
        email.replyTo ? `Reply-To: ${email.replyTo}` : null,
        `Subject: ${email.subject}`,
        email.inReplyTo ? `In-Reply-To: ${email.inReplyTo}` : null,
        email.inReplyTo ? `References: ${(email.references ?? [email.inReplyTo]).join(" ")}` : null,
        ...Object.entries(email.headers ?? {}).map(([k, v]) => `${k}: ${v}`),
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        email.text,
      ]
        .filter((l) => l !== null)
        .join("\r\n");
      const raw = Buffer.from(mime).toString("base64url");
      const { data } = await providerFetch<{ id: string; threadId: string }>("google", `${BASE}/messages/send`, { method: "POST", headers: { ...(await auth()), "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
      usage({ operation: "email.send", units: 1, unitLabel: "emails" });
      return { providerMessageId: data.id, accepted: true };
    },
    async fetchInbound(cursor) {
      const since = (cursor as { since?: number } | undefined)?.since ?? Math.floor(Date.now() / 1000) - 7 * 86400;
      const q = `in:inbox after:${since}`;
      const { data } = await providerFetch<{ messages?: { id: string }[] }>("google", `${BASE}/messages?q=${encodeURIComponent(q)}&maxResults=50`, { headers: await auth() });
      const messages: InboundEmail[] = [];
      let latest = since;
      for (const m of data.messages ?? []) {
        const { data: full } = await providerFetch<{ id: string; threadId: string; internalDate: string; payload?: { headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: { mimeType: string; body?: { data?: string } }[] } }>("google", `${BASE}/messages/${m.id}?format=full`, { headers: await auth() });
        const h = (name: string) => full.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value;
        const plain = full.payload?.parts?.find((p) => p.mimeType === "text/plain")?.body?.data ?? full.payload?.body?.data;
        const text = plain ? extractText(`\n\n${Buffer.from(plain, "base64url").toString("utf8")}`) : "";
        const fromRaw = h("From") ?? "";
        const fromMatch = /^(.*?)<([^>]+)>$/.exec(fromRaw);
        messages.push({
          providerMessageId: h("Message-ID") ?? full.id,
          threadKey: full.threadId,
          inReplyTo: h("In-Reply-To") ?? undefined,
          references: h("References")?.split(/\s+/),
          from: { email: (fromMatch?.[2] ?? fromRaw).trim().toLowerCase(), name: fromMatch?.[1]?.trim().replace(/^"|"$/g, "") || undefined },
          to: (h("To") ?? "").split(",").map((s) => s.trim()),
          subject: h("Subject") ?? undefined,
          text,
          receivedAt: new Date(Number(full.internalDate)).toISOString(),
        });
        latest = Math.max(latest, Math.floor(Number(full.internalDate) / 1000));
      }
      usage({ operation: "email.inbound", units: messages.length, unitLabel: "messages" });
      return { messages, nextCursor: { since: latest } };
    },
  };
}

export const googleMailboxDescriptor: ProviderDescriptor<GoogleMailboxCreds, Config> = {
  id: "google",
  category: "mailbox",
  displayName: "Gmail / Google Workspace",
  description: "Connect with Google sign-in. Sends from your Gmail and reads replies through the Gmail API. Requires GOOGLE_OAUTH_CLIENT_ID/SECRET on the server.",
  docsUrl: "https://developers.google.com/gmail/api",
  capabilities: ["email.send", "email.inbound", "mailbox.connect"],
  credentialFields: [], // populated by the OAuth flow, not typed by hand
  configFields: [{ key: "fromName", label: "From name", type: "text" }],
  create: ({ credentials, config, usage, integrationId }) =>
    createGoogleMailbox(
      { ...credentials, clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || credentials.clientId, clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || credentials.clientSecret },
      config,
      usage,
      integrationId ? (t) => patchCredentials(integrationId, { accessToken: t.accessToken, expiresAt: t.expiresAt }) : undefined,
    ),
};
