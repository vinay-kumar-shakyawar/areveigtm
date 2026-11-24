import type { InboundEmail, MailboxProvider, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";
import { extractText } from "@/server/providers/mailbox/imap-smtp";
import { patchCredentials } from "@/server/providers/credential-store";

/** Microsoft 365 / Outlook through Microsoft Graph with OAuth 2.0 (Mail.Send, Mail.Read, offline_access). */
export interface MicrosoftMailboxCreds {
  emailAddress: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  clientId: string;
  clientSecret: string;
  tenant: string;
}
interface Config {
  fromName?: string;
}

export const MICROSOFT_SCOPES = ["offline_access", "User.Read", "Mail.Send", "Mail.Read"];

export async function refreshMicrosoftToken(creds: MicrosoftMailboxCreds): Promise<{ accessToken: string; refreshToken?: string; expiresAt: string }> {
  const { data } = await providerFetch<{ access_token: string; refresh_token?: string; expires_in: number }>("microsoft", `https://login.microsoftonline.com/${creds.tenant || "common"}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret, scope: MICROSOFT_SCOPES.join(" ") }).toString(),
  });
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() };
}

export function createMicrosoftMailbox(creds: MicrosoftMailboxCreds, config: Config, usage: UsageSink, onTokenRefresh?: (t: { accessToken: string; refreshToken?: string; expiresAt: string }) => Promise<void>): MailboxProvider {
  let token = creds.accessToken;
  let expiresAt = new Date(creds.expiresAt).getTime();
  async function auth(): Promise<Record<string, string>> {
    if (Date.now() > expiresAt - 60_000) {
      const t = await refreshMicrosoftToken(creds);
      token = t.accessToken;
      expiresAt = new Date(t.expiresAt).getTime();
      await onTokenRefresh?.(t);
    }
    return { Authorization: `Bearer ${token}` };
  }
  const BASE = "https://graph.microsoft.com/v1.0/me";
  return {
    id: "microsoft",
    category: "mailbox",
    async testConnection() {
      const started = Date.now();
      try {
        const { data } = await providerFetch<{ mail?: string; userPrincipalName?: string }>("microsoft", BASE, { headers: await auth() });
        return { ok: true, message: `Connected as ${data.mail ?? data.userPrincipalName}`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async send(email) {
      const internetHeaders = Object.entries({ ...(email.headers ?? {}), ...(email.inReplyTo ? { "In-Reply-To": email.inReplyTo, References: (email.references ?? [email.inReplyTo]).join(" ") } : {}) })
        .filter(([k]) => /^x-/i.test(k) || k === "In-Reply-To" || k === "References" || /List-Unsubscribe/i.test(k))
        .map(([name, value]) => ({ name: /^x-/i.test(name) ? name : `X-${name}`, value }));
      await providerFetch("microsoft", `${BASE}/sendMail`, {
        method: "POST",
        headers: { ...(await auth()), "Content-Type": "application/json" },
        expectJson: false,
        body: JSON.stringify({
          message: {
            subject: email.subject,
            body: { contentType: "Text", content: email.text },
            toRecipients: [{ emailAddress: { address: email.to.email, name: email.to.name } }],
            replyTo: email.replyTo ? [{ emailAddress: { address: email.replyTo } }] : undefined,
            internetMessageHeaders: internetHeaders.length ? internetHeaders : undefined,
          },
          saveToSentItems: true,
        }),
      });
      usage({ operation: "email.send", units: 1, unitLabel: "emails" });
      return { providerMessageId: `graph:${email.idempotencyKey ?? Date.now()}`, accepted: true };
    },
    async fetchInbound(cursor) {
      const sinceIso = (cursor as { since?: string } | undefined)?.since ?? new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data } = await providerFetch<{ value: { id: string; internetMessageId: string; conversationId: string; receivedDateTime: string; subject?: string; from?: { emailAddress: { address: string; name?: string } }; toRecipients?: { emailAddress: { address: string } }[]; body?: { contentType: string; content: string } }[] }>(
        "microsoft",
        `${BASE}/mailFolders/inbox/messages?$filter=receivedDateTime ge ${sinceIso}&$orderby=receivedDateTime asc&$top=50&$select=id,internetMessageId,conversationId,receivedDateTime,subject,from,toRecipients,body`,
        { headers: await auth() },
      );
      let latest = sinceIso;
      const messages: InboundEmail[] = data.value.map((m) => {
        if (m.receivedDateTime > latest) latest = m.receivedDateTime;
        const content = m.body?.contentType?.toLowerCase() === "html" ? (m.body.content ?? "").replace(/<[^>]+>/g, " ") : (m.body?.content ?? "");
        return {
          providerMessageId: m.internetMessageId ?? m.id,
          threadKey: m.conversationId,
          from: { email: m.from?.emailAddress.address.toLowerCase() ?? "", name: m.from?.emailAddress.name },
          to: (m.toRecipients ?? []).map((r) => r.emailAddress.address),
          subject: m.subject,
          text: extractText(`\n\n${content}`),
          receivedAt: m.receivedDateTime,
        };
      });
      usage({ operation: "email.inbound", units: messages.length, unitLabel: "messages" });
      return { messages, nextCursor: { since: latest } };
    },
  };
}

export const microsoftMailboxDescriptor: ProviderDescriptor<MicrosoftMailboxCreds, Config> = {
  id: "microsoft",
  category: "mailbox",
  displayName: "Microsoft 365 / Outlook",
  description: "Connect with Microsoft sign-in. Sends and reads through Microsoft Graph. Requires MICROSOFT_OAUTH_CLIENT_ID/SECRET on the server; admin consent may be needed.",
  docsUrl: "https://learn.microsoft.com/graph/api/resources/mail-api-overview",
  capabilities: ["email.send", "email.inbound", "mailbox.connect"],
  credentialFields: [],
  configFields: [{ key: "fromName", label: "From name", type: "text" }],
  create: ({ credentials, config, usage, integrationId }) =>
    createMicrosoftMailbox(
      { ...credentials, clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID || credentials.clientId, clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET || credentials.clientSecret, tenant: credentials.tenant || process.env.MICROSOFT_OAUTH_TENANT || "common" },
      config,
      usage,
      integrationId ? (t) => patchCredentials(integrationId, { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt }) : undefined,
    ),
};
