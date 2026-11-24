import type { EmailSendProvider, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";

/** Resend adapter. https://resend.com/docs/api-reference */
interface Creds {
  apiKey: string;
}
type Config = Record<string, never>;
const BASE = "https://api.resend.com";

function createResend(creds: Creds, _config: Config, usage: UsageSink): EmailSendProvider {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${creds.apiKey}` };
  return {
    id: "resend",
    category: "email",
    async testConnection() {
      const started = Date.now();
      try {
        const { data } = await providerFetch<{ data?: { name: string; status: string }[] }>("resend", `${BASE}/domains`, { headers });
        const verified = (data.data ?? []).filter((d) => d.status === "verified").map((d) => d.name);
        return { ok: true, message: verified.length ? `Connected. Verified domains: ${verified.join(", ")}` : "Connected. No verified sending domain yet.", latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async send(email) {
      const { data } = await providerFetch<{ id: string }>("resend", `${BASE}/emails`, {
        method: "POST",
        headers: { ...headers, ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}) },
        body: JSON.stringify({
          from: email.from.name ? `${email.from.name} <${email.from.email}>` : email.from.email,
          to: [email.to.email],
          reply_to: email.replyTo,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: { ...(email.headers ?? {}), ...(email.inReplyTo ? { "In-Reply-To": email.inReplyTo, References: (email.references ?? [email.inReplyTo]).join(" ") } : {}) },
        }),
      });
      usage({ operation: "email.send", units: 1, unitLabel: "emails", estimatedCostCents: 0 });
      return { providerMessageId: data.id, accepted: true };
    },
    async getDomainStatus(domain) {
      const { data } = await providerFetch<{ data?: { name: string; status: string; records?: { record: string; type: string; status: string }[] }[] }>("resend", `${BASE}/domains`, { headers });
      const d = (data.data ?? []).find((x) => x.name === domain);
      if (!d) return { verified: false, details: { message: "Domain not added to Resend" } };
      const rec = (type: string) => d.records?.filter((r) => r.record.toUpperCase() === type).every((r) => r.status === "verified");
      return { verified: d.status === "verified", spf: rec("SPF"), dkim: rec("DKIM"), dmarc: undefined, details: d };
    },
  };
}

export const resendDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "resend",
  category: "email",
  displayName: "Resend",
  description: "Transactional and outbound email API with domain verification and delivery webhooks.",
  docsUrl: "https://resend.com/docs",
  capabilities: ["email.send"],
  credentialFields: [
    { key: "apiKey", label: "API key", type: "secret", required: true, placeholder: "re_…" },
    { key: "webhookSigningSecret", label: "Webhook signing secret (optional)", type: "secret", required: false, placeholder: "whsec_…", help: "From Resend → Webhooks after adding the AREVEI endpoint shown under Sending accounts." },
  ],
  configFields: [],
  systemEnvKeys: ["RESEND_API_KEY"],
  credentialsFromEnv: (env) => (env.RESEND_API_KEY ? { apiKey: env.RESEND_API_KEY } : null),
  create: ({ credentials, config, usage }) => createResend(credentials, config as Config, usage),
};
