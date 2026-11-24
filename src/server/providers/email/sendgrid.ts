import type { EmailSendProvider, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";

/** SendGrid v3 adapter. https://docs.sendgrid.com/api-reference */
interface Creds {
  apiKey: string;
}
type Config = Record<string, never>;
const BASE = "https://api.sendgrid.com/v3";

function createSendGrid(creds: Creds, _config: Config, usage: UsageSink): EmailSendProvider {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${creds.apiKey}` };
  return {
    id: "sendgrid",
    category: "email",
    async testConnection() {
      const started = Date.now();
      try {
        const { data } = await providerFetch<{ username?: string }>("sendgrid", `${BASE}/user/username`, { headers });
        return { ok: true, message: `Connected as ${data.username ?? "SendGrid user"}`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async send(email) {
      const { headers: resHeaders } = await providerFetch("sendgrid", `${BASE}/mail/send`, {
        method: "POST",
        headers,
        expectJson: false,
        body: JSON.stringify({
          personalizations: [{ to: [{ email: email.to.email, name: email.to.name }] }],
          from: { email: email.from.email, name: email.from.name },
          reply_to: email.replyTo ? { email: email.replyTo } : undefined,
          subject: email.subject,
          content: [{ type: "text/plain", value: email.text }, ...(email.html ? [{ type: "text/html", value: email.html }] : [])],
          headers: { ...(email.headers ?? {}), ...(email.inReplyTo ? { "In-Reply-To": email.inReplyTo, References: (email.references ?? [email.inReplyTo]).join(" ") } : {}) },
          custom_args: email.idempotencyKey ? { arevei_message_id: email.idempotencyKey } : undefined,
          tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
        }),
      });
      usage({ operation: "email.send", units: 1, unitLabel: "emails" });
      return { providerMessageId: resHeaders.get("x-message-id") ?? `sendgrid:${email.idempotencyKey ?? Date.now()}`, accepted: true };
    },
    async getDomainStatus(domain) {
      const { data } = await providerFetch<{ domain: string; valid: boolean; dns?: Record<string, { valid: boolean }> }[]>("sendgrid", `${BASE}/whitelabel/domains?domain=${encodeURIComponent(domain)}`, { headers });
      const d = Array.isArray(data) ? data.find((x) => x.domain === domain) : undefined;
      if (!d) return { verified: false, details: { message: "Domain not authenticated in SendGrid" } };
      return { verified: d.valid, dkim: d.dns ? Object.entries(d.dns).filter(([k]) => k.startsWith("dkim")).every(([, v]) => v.valid) : undefined, spf: d.dns?.mail_cname?.valid, details: d };
    },
  };
}

export const sendgridDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "sendgrid",
  category: "email",
  displayName: "SendGrid",
  description: "Email API with domain authentication and event webhooks.",
  docsUrl: "https://docs.sendgrid.com",
  capabilities: ["email.send"],
  credentialFields: [{ key: "apiKey", label: "API key", type: "secret", required: true, placeholder: "SG.…" }],
  configFields: [{ key: "webhookPublicKey", label: "Event webhook verification key (optional)", type: "text", help: "Base64 public key from SendGrid → Settings → Mail Settings → Event Webhook → Signed." }],
  systemEnvKeys: ["SENDGRID_API_KEY"],
  credentialsFromEnv: (env) => (env.SENDGRID_API_KEY ? { apiKey: env.SENDGRID_API_KEY } : null),
  create: ({ credentials, config, usage }) => createSendGrid(credentials, config as Config, usage),
};
