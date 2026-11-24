import type { ProviderDescriptor, UsageSink, WebResearchProvider } from "@/server/providers/types";
import { ProviderError } from "@/server/providers/types";

/**
 * Built-in page fetcher with no API key: plain HTTP GET + HTML-to-text.
 * Good enough for a company's own website; falls back gracefully for JS-only sites.
 */
function htmlToText(html: string): { title?: string; text: string } {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<(br|p|div|li|h[1-6]|tr|section|article|header|footer)[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  s = s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return { title, text: s.slice(0, 30000) };
}

function isPrivateHost(host: string): boolean {
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

export function createBuiltinFetch(usage: UsageSink): WebResearchProvider {
  return {
    id: "builtin",
    category: "company_data",
    async testConnection() {
      return { ok: true, message: "Built-in fetcher needs no credentials", latencyMs: 0 };
    },
    async fetchPage(url) {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      if (!["http:", "https:"].includes(u.protocol) || isPrivateHost(u.hostname)) {
        throw new ProviderError("builtin", "invalid_request", "Only public http(s) URLs can be fetched");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const res = await fetch(u, { headers: { "User-Agent": "AREVEI-GTM/1.0 (+company research)", Accept: "text/html,*/*" }, signal: controller.signal, redirect: "follow" });
        if (!res.ok) throw new ProviderError("builtin", res.status === 404 ? "not_found" : "unavailable", `Fetch failed with HTTP ${res.status}`, { status: res.status });
        const html = (await res.text()).slice(0, 2_000_000);
        usage({ operation: "web.fetch", units: 1, unitLabel: "pages" });
        const { title, text } = htmlToText(html);
        return { url: res.url, title, text };
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError("builtin", "unavailable", `Could not fetch ${u.hostname}: ${(err as Error).message}`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const builtinFetchDescriptor: ProviderDescriptor = {
  id: "builtin",
  category: "company_data",
  displayName: "Built-in page fetcher",
  description: "Fetches public web pages directly. No key needed; works for most company websites.",
  capabilities: ["web.fetch"],
  credentialFields: [],
  configFields: [],
  create: ({ usage }) => createBuiltinFetch(usage),
};
