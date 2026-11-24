import { ProviderError, type ProviderErrorCode } from "@/server/providers/types";

/**
 * Small fetch wrapper used by adapters: timeouts, JSON parsing and a uniform
 * error mapping so modules can decide on retries and fallbacks.
 */
export async function providerFetch<T = unknown>(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number; expectJson?: boolean } = {},
): Promise<{ status: number; data: T; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error).name === "AbortError";
    throw new ProviderError(provider, "unavailable", aborted ? `${provider} request timed out` : `${provider} is unreachable: ${(err as Error).message}`);
  }
  clearTimeout(timer);
  const text = await res.text();
  let data: unknown = text;
  if (init.expectJson !== false) {
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    throw new ProviderError(provider, mapStatus(res.status), extractMessage(data) ?? `${provider} returned HTTP ${res.status}`, {
      status: res.status,
      details: typeof data === "string" ? data.slice(0, 500) : data,
    });
  }
  return { status: res.status, data: data as T, headers: res.headers };
}

export function mapStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "invalid_request";
}

function extractMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  const candidates = [d.message, d.error, d.detail, d.errors, (d.error as Record<string, unknown> | undefined)?.message];
  for (const c of candidates) {
    if (typeof c === "string") return c.slice(0, 300);
    if (Array.isArray(c) && typeof c[0] === "string") return c[0].slice(0, 300);
    if (Array.isArray(c) && c[0] && typeof c[0] === "object" && typeof (c[0] as Record<string, unknown>).message === "string") {
      return String((c[0] as Record<string, unknown>).message).slice(0, 300);
    }
  }
  return undefined;
}

export function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const started = Date.now();
  return fn().then((result) => ({ result, latencyMs: Date.now() - started }));
}
