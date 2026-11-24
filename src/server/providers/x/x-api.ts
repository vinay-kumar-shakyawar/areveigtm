import type { ProviderDescriptor, UsageSink, XProvider } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";
import { patchCredentials } from "@/server/providers/credential-store";

/**
 * X API v2 with OAuth 2.0 user context (PKCE). Tokens come from the
 * /api/oauth/x flow and are stored per connected sender. Only documented,
 * permitted operations: read own user, resolve a handle, send a DM, check
 * following. No follow/like automation, no scraping.
 */
export interface XCreds {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  clientId: string;
  clientSecret?: string;
  userId?: string;
  handle?: string;
}
type Config = Record<string, never>;

export const X_SCOPES = ["tweet.read", "users.read", "dm.read", "dm.write", "follows.read", "offline_access"];
const BASE = "https://api.x.com/2";

export async function refreshXToken(creds: XCreds): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (creds.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`;
  const { data } = await providerFetch<{ access_token: string; refresh_token: string; expires_in: number }>("x", "https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refreshToken, client_id: creds.clientId }).toString(),
  });
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() };
}

export function createXProvider(creds: XCreds, _config: Config, usage: UsageSink, onTokenRefresh?: (t: { accessToken: string; refreshToken: string; expiresAt: string }) => Promise<void>): XProvider {
  let token = creds.accessToken;
  let expiresAt = new Date(creds.expiresAt).getTime();
  async function auth(): Promise<Record<string, string>> {
    if (Date.now() > expiresAt - 60_000 && creds.refreshToken) {
      const t = await refreshXToken(creds);
      token = t.accessToken;
      expiresAt = new Date(t.expiresAt).getTime();
      await onTokenRefresh?.(t);
    }
    return { Authorization: `Bearer ${token}` };
  }
  return {
    id: "x_api",
    category: "x",
    async testConnection() {
      const started = Date.now();
      try {
        const me = await this.getMe();
        return { ok: true, message: `Connected as @${me.handle}`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async getMe() {
      const { data } = await providerFetch<{ data: { id: string; username: string } }>("x", `${BASE}/users/me`, { headers: await auth() });
      return { userId: data.data.id, handle: data.data.username };
    },
    async resolveHandle(handle) {
      const h = handle.replace(/^@/, "");
      try {
        const { data } = await providerFetch<{ data?: { id: string; username: string; name?: string } }>("x", `${BASE}/users/by/username/${encodeURIComponent(h)}`, { headers: await auth() });
        usage({ operation: "x.lookup", units: 1, unitLabel: "lookups" });
        return data.data ? { userId: data.data.id, handle: data.data.username, name: data.data.name } : null;
      } catch (err) {
        if ((err as { code?: string }).code === "not_found") return null;
        throw err;
      }
    },
    async sendDm({ recipientUserId, text }) {
      const { data } = await providerFetch<{ data: { dm_conversation_id: string; dm_event_id: string } }>("x", `${BASE}/dm_conversations/with/${recipientUserId}/messages`, {
        method: "POST",
        headers: { ...(await auth()), "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      usage({ operation: "x.dm", units: 1, unitLabel: "messages" });
      return { providerRef: data.data.dm_event_id };
    },
    async checkFollows({ userIds }) {
      // Reads the authenticated user's followers (bounded) and reports presence; absence is unknown, not a verified negative.
      const me = await this.getMe();
      const followers = new Set<string>();
      let token: string | undefined;
      for (let i = 0; i < 5; i++) {
        const { data } = await providerFetch<{ data?: { id: string }[]; meta?: { next_token?: string } }>("x", `${BASE}/users/${me.userId}/followers?max_results=1000${token ? `&pagination_token=${token}` : ""}`, { headers: await auth() });
        for (const f of data.data ?? []) followers.add(f.id);
        token = data.meta?.next_token;
        if (!token) break;
      }
      usage({ operation: "x.followers", units: 1, unitLabel: "checks" });
      return userIds.map((userId) => ({ userId, follows: followers.has(userId) ? true : null }));
    },
  };
}

export const xApiDescriptor: ProviderDescriptor<XCreds, Config> = {
  id: "x_api",
  category: "x",
  displayName: "X (official API)",
  description: "Connect an X account with OAuth 2.0. Sends DMs and checks followers through the official API only. Requires X_CLIENT_ID/SECRET on the server and a project with DM access.",
  docsUrl: "https://developer.x.com/en/docs/x-api",
  capabilities: ["x.dm", "x.followers", "x.profile"],
  credentialFields: [],
  configFields: [],
  create: ({ credentials, config, usage, integrationId }) =>
    createXProvider(
      { ...credentials, clientId: process.env.X_CLIENT_ID || credentials.clientId, clientSecret: process.env.X_CLIENT_SECRET || credentials.clientSecret },
      config as Config,
      usage,
      integrationId ? (t) => patchCredentials(integrationId, { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt }) : undefined,
    ),
};
