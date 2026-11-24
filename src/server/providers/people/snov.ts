import type { EnrichmentProvider, EnrichmentResult, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";

/** Snov.io adapter: OAuth client-credentials, email finder/verifier. https://snov.io/api */
interface Creds {
  clientId: string;
  clientSecret: string;
}
type Config = Record<string, never>;
const BASE = "https://api.snov.io";

function createSnov(creds: Creds, _config: Config, usage: UsageSink): EnrichmentProvider {
  let token: { value: string; expiresAt: number } | null = null;
  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 30_000) return token.value;
    const { data } = await providerFetch<{ access_token: string; expires_in: number }>("snov", `${BASE}/v1/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: creds.clientId, client_secret: creds.clientSecret }),
    });
    token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return token.value;
  }
  async function authed<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const t = await accessToken();
    const { data } = await providerFetch<T>("snov", `${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
    return data;
  }
  return {
    id: "snov",
    category: "people_data",
    async testConnection() {
      const started = Date.now();
      try {
        const data = await authed<{ balance?: string }>("/v1/get-balance", {});
        return { ok: true, message: `Connected to Snov.io${data.balance ? ` (balance ${data.balance})` : ""}`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async enrichPerson(input) {
      if (input.firstName && input.lastName && input.companyDomain) return this.findEmail!({ firstName: input.firstName, lastName: input.lastName, companyDomain: input.companyDomain });
      return { found: false, fields: {} };
    },
    async findEmail(input) {
      const data = await authed<{ success?: boolean; data?: { emails?: { email: string; emailStatus?: string }[] } }>("/v1/get-emails-from-names", {
        firstName: input.firstName,
        lastName: input.lastName,
        domain: input.companyDomain,
      });
      usage({ operation: "email.find", units: 1, unitLabel: "lookups" });
      const best = data.data?.emails?.[0];
      if (!best?.email) return { found: false, fields: {} };
      const status = best.emailStatus === "valid" ? "valid" : best.emailStatus === "unverifiable" ? "risky" : "unknown";
      const f: EnrichmentResult["fields"] = {
        email: { value: best.email, confidence: status === "valid" ? 0.9 : 0.5, verified: status === "valid" },
        emailStatus: { value: status, confidence: 0.7 },
      };
      return { found: true, fields: f };
    },
    async verifyEmail(email) {
      const data = await authed<{ [k: string]: { result?: string } | undefined }>("/v1/get-emails-verification-status", { emails: [email] });
      usage({ operation: "email.verify", units: 1, unitLabel: "verifications" });
      const r = data[email]?.result;
      return { status: r === "valid" ? "valid" : r === "not_valid" ? "invalid" : r === "unverifiable" ? "risky" : "unknown" };
    },
  };
}

export const snovDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "snov",
  category: "people_data",
  displayName: "Snov.io",
  description: "Email finder and verification.",
  docsUrl: "https://snov.io/api",
  capabilities: ["email.find", "email.verify", "people.enrich"],
  credentialFields: [
    { key: "clientId", label: "Client ID", type: "text", required: true },
    { key: "clientSecret", label: "Client secret", type: "secret", required: true },
  ],
  configFields: [],
  systemEnvKeys: ["SNOV_CLIENT_ID", "SNOV_CLIENT_SECRET"],
  credentialsFromEnv: (env) => (env.SNOV_CLIENT_ID && env.SNOV_CLIENT_SECRET ? { clientId: env.SNOV_CLIENT_ID, clientSecret: env.SNOV_CLIENT_SECRET } : null),
  create: ({ credentials, config, usage }) => createSnov(credentials, config as Config, usage),
};
