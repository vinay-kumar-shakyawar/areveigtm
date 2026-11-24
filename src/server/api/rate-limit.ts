import "server-only";
import { ApiError } from "@/server/api/errors";

/**
 * Sliding-window rate limiter. In-memory per process; good for a single
 * instance. Swap `store` for Redis when REDIS_URL is configured and the app
 * runs on several instances.
 */
const store = new Map<string, number[]>();
let lastSweep = Date.now();

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  if (now - lastSweep > 60_000) {
    for (const [k, v] of store) {
      const kept = v.filter((t) => now - t < windowMs);
      if (kept.length === 0) store.delete(k);
      else store.set(k, kept);
    }
    lastSweep = now;
  }
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    throw new ApiError("rate_limited", "Too many requests. Slow down and retry.", {
      details: { retryAfterSec: Math.ceil((hits[0] + windowMs - now) / 1000) },
    });
  }
  hits.push(now);
  store.set(key, hits);
}

export function resetRateLimits(): void {
  store.clear();
}
