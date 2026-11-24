import type { LinkedInProvider, PersonRecord, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";

/**
 * Unipile adapter: an authorized multi-channel messaging API. Accounts are
 * connected through Unipile's hosted auth page (no credential handling on our
 * side). Endpoints per https://developer.unipile.com. Live verification pending.
 */
interface Creds {
  dsn: string; // e.g. api1.unipile.com:13111
  apiKey: string;
}
type Config = Record<string, never>;

function base(dsn: string) {
  return /^https?:\/\//.test(dsn) ? dsn.replace(/\/$/, "") : `https://${dsn.replace(/\/$/, "")}`;
}

export interface UnipileExtras {
  createHostedAuthLink(input: { successUrl: string; failureUrl: string; notifyUrl: string; name: string }): Promise<{ url: string }>;
  /** Registers messaging + account-status webhooks pointing at our endpoint with a shared-secret header. */
  registerWebhooks(input: { url: string; secret: string }): Promise<{ ids: string[] }>;
}

export function createUnipile(creds: Creds, _config: Config, usage: UsageSink): LinkedInProvider & UnipileExtras {
  const headers = { "X-API-KEY": creds.apiKey, Accept: "application/json", "Content-Type": "application/json" };
  const url = (p: string) => `${base(creds.dsn)}/api/v1${p}`;
  return {
    id: "unipile",
    category: "linkedin",
    async testConnection() {
      const started = Date.now();
      try {
        const { data } = await providerFetch<{ items?: { id: string; type: string; name: string }[] }>("unipile", url("/accounts"), { headers });
        const li = (data.items ?? []).filter((a) => a.type === "LINKEDIN");
        return { ok: true, message: `Connected. ${li.length} LinkedIn account(s) linked.`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async createHostedAuthLink(input) {
      const { data } = await providerFetch<{ url: string }>("unipile", url("/hosted/accounts/link"), {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "create", providers: ["LINKEDIN"], api_url: base(creds.dsn), expiresOn: new Date(Date.now() + 3600_000).toISOString(), success_redirect_url: input.successUrl, failure_redirect_url: input.failureUrl, notify_url: input.notifyUrl, name: input.name }),
      });
      return { url: data.url };
    },
    async registerWebhooks({ url: target, secret }) {
      const ids: string[] = [];
      for (const source of ["messaging", "account_status"] as const) {
        const { data } = await providerFetch<{ webhook_id?: string; id?: string }>("unipile", url("/webhooks"), {
          method: "POST",
          headers,
          body: JSON.stringify({ source, request_url: target, name: `arevei-${source}`, headers: [{ key: "x-arevei-secret", value: secret }], ...(source === "messaging" ? { events: ["message_received"] } : {}) }),
        });
        ids.push(data.webhook_id ?? data.id ?? source);
      }
      return { ids };
    },
    async listAccounts() {
      const { data } = await providerFetch<{ items?: { id: string; type: string; name: string; sources?: { status: string }[] }[] }>("unipile", url("/accounts"), { headers });
      return (data.items ?? [])
        .filter((a) => a.type === "LINKEDIN")
        .map((a) => ({ externalAccountId: a.id, displayName: a.name, status: a.sources?.some((s) => s.status === "OK") ? ("connected" as const) : a.sources?.some((s) => s.status === "CREDENTIALS") ? ("disconnected" as const) : ("limited" as const) }));
    },
    async getProfile(linkedinUrl) {
      const identifier = /linkedin\.com\/in\/([^/?#]+)/i.exec(linkedinUrl)?.[1];
      if (!identifier) return null;
      const accounts = await this.listAccounts();
      const account = accounts.find((a) => a.status === "connected");
      if (!account) return null;
      const { data } = await providerFetch<{ provider_id: string; first_name?: string; last_name?: string; headline?: string; location?: string; public_identifier?: string; work_experience?: { company?: string; position?: string }[] }>("unipile", url(`/users/${encodeURIComponent(identifier)}?account_id=${account.externalAccountId}`), { headers });
      usage({ operation: "linkedin.profile", units: 1, unitLabel: "lookups" });
      const person: PersonRecord = {
        providerRecordId: data.provider_id,
        firstName: data.first_name,
        lastName: data.last_name,
        fullName: [data.first_name, data.last_name].filter(Boolean).join(" "),
        headline: data.headline,
        title: data.work_experience?.[0]?.position,
        location: data.location,
        linkedinUrl: data.public_identifier ? `https://www.linkedin.com/in/${data.public_identifier}` : linkedinUrl,
        company: data.work_experience?.[0]?.company ? { name: data.work_experience[0].company } : undefined,
      };
      return person;
    },
    async sendInvitation({ accountId, linkedinUrl, note }) {
      const identifier = /linkedin\.com\/in\/([^/?#]+)/i.exec(linkedinUrl)?.[1] ?? linkedinUrl;
      const { data: user } = await providerFetch<{ provider_id: string }>("unipile", url(`/users/${encodeURIComponent(identifier)}?account_id=${accountId}`), { headers });
      const { data } = await providerFetch<{ object: string; invitation_id?: string }>("unipile", url("/users/invite"), { method: "POST", headers, body: JSON.stringify({ account_id: accountId, provider_id: user.provider_id, message: note || undefined }) });
      usage({ operation: "linkedin.invite", units: 1, unitLabel: "invites" });
      return { providerRef: data.invitation_id ?? `invite:${user.provider_id}` };
    },
    async sendMessage({ accountId, linkedinUrl, text }) {
      const identifier = /linkedin\.com\/in\/([^/?#]+)/i.exec(linkedinUrl)?.[1] ?? linkedinUrl;
      const { data: user } = await providerFetch<{ provider_id: string }>("unipile", url(`/users/${encodeURIComponent(identifier)}?account_id=${accountId}`), { headers });
      const { data } = await providerFetch<{ chat_id?: string; message_id?: string }>("unipile", url("/chats"), { method: "POST", headers, body: JSON.stringify({ account_id: accountId, attendees_ids: [user.provider_id], text }) });
      usage({ operation: "linkedin.message", units: 1, unitLabel: "messages" });
      return { providerRef: data.message_id ?? `msg:${Date.now()}`, threadKey: data.chat_id };
    },
    async fetchInbox({ accountId, cursor }) {
      const after = (cursor as { after?: string } | undefined)?.after;
      const { data } = await providerFetch<{ items?: { id: string; chat_id: string; text?: string; timestamp: string; is_sender: number; sender_attendee_id?: string; sender?: { public_identifier?: string } }[]; cursor?: string }>(
        "unipile",
        url(`/messages?account_id=${accountId}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`),
        { headers },
      );
      usage({ operation: "linkedin.inbox", units: data.items?.length ?? 0, unitLabel: "messages" });
      return {
        messages: (data.items ?? []).map((m) => ({
          providerMessageId: m.id,
          threadKey: m.chat_id,
          fromLinkedinUrl: m.sender?.public_identifier ? `https://www.linkedin.com/in/${m.sender.public_identifier}` : undefined,
          text: m.text ?? "",
          receivedAt: m.timestamp,
          direction: m.is_sender ? ("outbound" as const) : ("inbound" as const),
        })),
        nextCursor: data.cursor ? { after: data.cursor } : undefined,
      };
    },
  };
}

export const unipileDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "unipile",
  category: "linkedin",
  displayName: "LinkedIn via Unipile",
  description: "Authorized messaging API. Team members connect their own LinkedIn through Unipile's hosted page; AREVEI never sees LinkedIn passwords or session cookies.",
  docsUrl: "https://developer.unipile.com",
  capabilities: ["linkedin.invite", "linkedin.message", "linkedin.inbox", "linkedin.profile"],
  credentialFields: [
    { key: "dsn", label: "Unipile DSN", type: "text", required: true, placeholder: "api1.unipile.com:13111" },
    { key: "apiKey", label: "API key", type: "secret", required: true },
  ],
  configFields: [],
  systemEnvKeys: ["UNIPILE_DSN", "UNIPILE_API_KEY"],
  credentialsFromEnv: (env) => (env.UNIPILE_DSN && env.UNIPILE_API_KEY ? { dsn: env.UNIPILE_DSN, apiKey: env.UNIPILE_API_KEY } : null),
  create: ({ credentials, config, usage }) => createUnipile(credentials, config as Config, usage),
};
