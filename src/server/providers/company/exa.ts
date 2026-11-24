import type { ProviderDescriptor, SignalProvider, UsageSink, WebResearchProvider } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";

/** Exa adapter: neural web search with page contents; also used for hiring-signal discovery. https://docs.exa.ai */
interface Creds {
  apiKey: string;
}
type Config = Record<string, never>;
const BASE = "https://api.exa.ai";

interface ExaResult {
  id: string;
  url: string;
  title?: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
}

function createExa(creds: Creds, _config: Config, usage: UsageSink): WebResearchProvider & SignalProvider {
  const headers = { "Content-Type": "application/json", "x-api-key": creds.apiKey };
  async function search(query: string, options: { limit?: number; includeDomains?: string[]; recentDays?: number; category?: string } = {}) {
    const body: Record<string, unknown> = {
      query,
      numResults: Math.min(options.limit ?? 10, 50),
      type: "auto",
      contents: { text: { maxCharacters: 4000 }, highlights: { numSentences: 3 } },
    };
    if (options.includeDomains?.length) body.includeDomains = options.includeDomains;
    if (options.recentDays) body.startPublishedDate = new Date(Date.now() - options.recentDays * 86400_000).toISOString();
    if (options.category) body.category = options.category;
    const { data } = await providerFetch<{ results: ExaResult[] }>("exa", `${BASE}/search`, { method: "POST", headers, body: JSON.stringify(body) });
    usage({ operation: "web.search", units: 1, unitLabel: "searches", estimatedCostCents: 1 });
    return data.results;
  }
  return {
    id: "exa",
    category: "company_data",
    async testConnection() {
      const started = Date.now();
      try {
        await providerFetch("exa", `${BASE}/search`, { method: "POST", headers, body: JSON.stringify({ query: "arevei", numResults: 1 }) });
        return { ok: true, message: "Connected to Exa", latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async searchWeb(query, options) {
      const results = await search(query, options);
      return results.map((r) => ({ url: r.url, title: r.title, text: r.text ?? r.highlights?.join(" ") ?? "", publishedAt: r.publishedDate }));
    },
    async fetchPage(url) {
      const { data } = await providerFetch<{ results: ExaResult[] }>("exa", `${BASE}/contents`, {
        method: "POST",
        headers,
        body: JSON.stringify({ urls: [url], text: { maxCharacters: 20000 } }),
      });
      usage({ operation: "web.fetch", units: 1, unitLabel: "pages", estimatedCostCents: 1 });
      const r = data.results[0];
      return { url, title: r?.title, text: r?.text ?? "", publishedAt: r?.publishedDate };
    },
    async listSignals(query) {
      const roles = query.roles?.length ? query.roles.join(" OR ") : "senior hire";
      const domains = query.companyDomains;
      const results = await search(`job posting hiring ${roles}`, { limit: query.limit, includeDomains: domains, recentDays: query.sinceDays ?? 30 });
      return {
        events: results.map((r) => {
          const host = safeHost(r.url);
          return {
            dedupeKey: `exa:hiring:${r.url}`,
            eventType: "hiring" as const,
            title: r.title ? `Hiring: ${r.title}` : "Job posting observed",
            occurredAt: r.publishedDate ?? new Date().toISOString(),
            url: r.url,
            company: { name: host ?? "Unknown", domain: host },
            evidence: { excerpt: (r.highlights?.join(" ") ?? r.text ?? "").slice(0, 600), source: "exa.search" },
            confidence: 0.6,
          };
        }),
      };
    },
  };
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export const exaDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "exa",
  category: "company_data",
  displayName: "Exa",
  description: "Neural web search with full-page contents; powers company research and hiring-signal discovery.",
  docsUrl: "https://docs.exa.ai",
  capabilities: ["web.search", "web.fetch", "signals.hiring"],
  credentialFields: [{ key: "apiKey", label: "API key", type: "secret", required: true }],
  configFields: [],
  systemEnvKeys: ["EXA_API_KEY"],
  credentialsFromEnv: (env) => (env.EXA_API_KEY ? { apiKey: env.EXA_API_KEY } : null),
  create: ({ credentials, config, usage }) => createExa(credentials, config as Config, usage),
};
