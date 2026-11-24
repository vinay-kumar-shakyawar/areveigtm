import type { ProviderDescriptor, UsageSink, WebResearchProvider } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";

/** Firecrawl adapter: fetch a page as clean markdown, optional search. https://docs.firecrawl.dev */
interface Creds {
  apiKey: string;
}
type Config = Record<string, never>;
const BASE = "https://api.firecrawl.dev/v1";

function createFirecrawl(creds: Creds, _config: Config, usage: UsageSink): WebResearchProvider {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${creds.apiKey}` };
  return {
    id: "firecrawl",
    category: "company_data",
    async testConnection() {
      const started = Date.now();
      try {
        await providerFetch("firecrawl", `${BASE}/scrape`, { method: "POST", headers, body: JSON.stringify({ url: "https://example.com", formats: ["markdown"], onlyMainContent: true }) });
        return { ok: true, message: "Connected to Firecrawl", latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async fetchPage(url) {
      const { data } = await providerFetch<{ data?: { markdown?: string; metadata?: { title?: string; publishedTime?: string } } }>("firecrawl", `${BASE}/scrape`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
        timeoutMs: 60_000,
      });
      usage({ operation: "web.fetch", units: 1, unitLabel: "pages", estimatedCostCents: 1 });
      return { url, title: data.data?.metadata?.title, text: (data.data?.markdown ?? "").slice(0, 30000), publishedAt: data.data?.metadata?.publishedTime };
    },
    async searchWeb(query, options) {
      const { data } = await providerFetch<{ data?: { url: string; title?: string; markdown?: string; description?: string }[] }>("firecrawl", `${BASE}/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, limit: Math.min(options?.limit ?? 5, 20), scrapeOptions: { formats: ["markdown"] } }),
        timeoutMs: 60_000,
      });
      usage({ operation: "web.search", units: 1, unitLabel: "searches", estimatedCostCents: 2 });
      return (data.data ?? []).map((r) => ({ url: r.url, title: r.title, text: (r.markdown ?? r.description ?? "").slice(0, 8000) }));
    },
  };
}

export const firecrawlDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "firecrawl",
  category: "company_data",
  displayName: "Firecrawl",
  description: "Turn any website into clean text for company research.",
  docsUrl: "https://docs.firecrawl.dev",
  capabilities: ["web.fetch", "web.search"],
  credentialFields: [{ key: "apiKey", label: "API key", type: "secret", required: true }],
  configFields: [],
  systemEnvKeys: ["FIRECRAWL_API_KEY"],
  credentialsFromEnv: (env) => (env.FIRECRAWL_API_KEY ? { apiKey: env.FIRECRAWL_API_KEY } : null),
  create: ({ credentials, config, usage }) => createFirecrawl(credentials, config as Config, usage),
};
