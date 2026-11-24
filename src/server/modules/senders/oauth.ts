import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db/client";
import { env } from "@/lib/env";
import { ApiError } from "@/server/api/errors";
import { writeCredentials } from "@/server/providers/credential-store";
import { GOOGLE_SCOPES } from "@/server/providers/mailbox/google";
import { MICROSOFT_SCOPES } from "@/server/providers/mailbox/microsoft";
import { X_SCOPES } from "@/server/providers/x/x-api";
import { registerXSender } from "@/server/modules/senders/service";
import { normalizeEmail } from "@/lib/normalize";
import { systemCtx } from "@/server/auth/context";
import { audit } from "@/server/modules/audit/service";

/**
 * OAuth 2.0 connect flows for Gmail, Microsoft 365 and X. The state parameter
 * is an HMAC-signed JSON blob (workspace, user, provider, nonce, expiry). The
 * PKCE verifier lives in a short-lived HttpOnly cookie, never in the URL.
 */
export type OAuthProvider = "google" | "microsoft" | "x";

export interface OAuthState {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  provider: OAuthProvider;
  nonce: string;
  exp: number;
}

function b64url(buf: Buffer) {
  return buf.toString("base64url");
}

export function signState(state: Omit<OAuthState, "nonce" | "exp">): { token: string; nonce: string } {
  const nonce = b64url(randomBytes(16));
  const payload = b64url(Buffer.from(JSON.stringify({ ...state, nonce, exp: Date.now() + 10 * 60_000 } satisfies OAuthState)));
  const sig = createHmac("sha256", env().JWT_SECRET).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, nonce };
}

export function verifyState(token: string | null): OAuthState | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", env().JWT_SECRET).update(payload).digest("base64url");
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (state.exp < Date.now()) return null;
    return state;
  } catch {
    return null;
  }
}

export function redirectUri(provider: OAuthProvider) {
  return `${env().APP_BASE_URL}/api/oauth/${provider}/callback`;
}

export function pkcePair() {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function isConfigured(provider: OAuthProvider): boolean {
  const e = env();
  if (provider === "google") return Boolean(e.GOOGLE_OAUTH_CLIENT_ID && e.GOOGLE_OAUTH_CLIENT_SECRET);
  if (provider === "microsoft") return Boolean(e.MICROSOFT_OAUTH_CLIENT_ID && e.MICROSOFT_OAUTH_CLIENT_SECRET);
  return Boolean(e.X_CLIENT_ID);
}

export function authorizationUrl(provider: OAuthProvider, state: string, pkceChallenge?: string): string {
  const e = env();
  if (provider === "google") {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({ client_id: e.GOOGLE_OAUTH_CLIENT_ID!, redirect_uri: redirectUri("google"), response_type: "code", scope: GOOGLE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).toString();
    return u.toString();
  }
  if (provider === "microsoft") {
    const u = new URL(`https://login.microsoftonline.com/${e.MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/authorize`);
    u.search = new URLSearchParams({ client_id: e.MICROSOFT_OAUTH_CLIENT_ID!, redirect_uri: redirectUri("microsoft"), response_type: "code", response_mode: "query", scope: MICROSOFT_SCOPES.join(" "), state }).toString();
    return u.toString();
  }
  const u = new URL("https://x.com/i/oauth2/authorize");
  u.search = new URLSearchParams({ client_id: e.X_CLIENT_ID!, redirect_uri: redirectUri("x"), response_type: "code", scope: X_SCOPES.join(" "), state, code_challenge: pkceChallenge ?? "", code_challenge_method: "S256" }).toString();
  return u.toString();
}

async function tokenRequest(url: string, params: Record<string, string>, headers: Record<string, string> = {}) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers }, body: new URLSearchParams(params).toString() });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw ApiError.invalid(`Token exchange failed: ${(data.error_description as string) ?? (data.error as string) ?? res.status}`);
  return data as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

export async function exchangeCode(provider: OAuthProvider, code: string, pkceVerifier?: string) {
  const e = env();
  if (provider === "google") {
    const t = await tokenRequest("https://oauth2.googleapis.com/token", { code, client_id: e.GOOGLE_OAUTH_CLIENT_ID!, client_secret: e.GOOGLE_OAUTH_CLIENT_SECRET!, redirect_uri: redirectUri("google"), grant_type: "authorization_code" });
    const profile = (await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as { email?: string };
    return { ...t, email: profile.email ?? null };
  }
  if (provider === "microsoft") {
    const t = await tokenRequest(`https://login.microsoftonline.com/${e.MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/token`, { code, client_id: e.MICROSOFT_OAUTH_CLIENT_ID!, client_secret: e.MICROSOFT_OAUTH_CLIENT_SECRET!, redirect_uri: redirectUri("microsoft"), grant_type: "authorization_code", scope: MICROSOFT_SCOPES.join(" ") });
    const me = (await (await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as { mail?: string; userPrincipalName?: string };
    return { ...t, email: me.mail ?? me.userPrincipalName ?? null };
  }
  const basic: Record<string, string> = e.X_CLIENT_SECRET ? { Authorization: `Basic ${Buffer.from(`${e.X_CLIENT_ID}:${e.X_CLIENT_SECRET}`).toString("base64")}` } : {};
  const t = await tokenRequest("https://api.x.com/2/oauth2/token", { code, client_id: e.X_CLIENT_ID!, redirect_uri: redirectUri("x"), grant_type: "authorization_code", code_verifier: pkceVerifier ?? "" }, basic);
  const me = (await (await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as { data?: { id: string; username: string } };
  return { ...t, email: null, xUser: me.data ?? null };
}

/** Persist tokens as a mailbox integration and create the sender + mailbox rows. */
export async function completeMailboxConnect(state: OAuthState, tokens: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; email: string | null }) {
  const email = normalizeEmail(tokens.email);
  if (!email) throw ApiError.invalid("The provider did not return a mailbox address");
  if (state.provider === "x") throw ApiError.invalid("X is not a mailbox provider");
  const mailboxProvider = state.provider;
  if (!tokens.refresh_token) throw ApiError.invalid("No refresh token was granted. Remove the app from your account and connect again.");
  const e = env();
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
  const integration = await prisma.integration.upsert({
    where: { workspaceId_category_provider_label: { workspaceId: state.workspaceId, category: "mailbox", provider: state.provider, label: email } },
    create: { workspaceId: state.workspaceId, category: "mailbox", provider: state.provider, label: email, enabled: true, priority: 100, config: { fromName: "" }, createdByUserId: state.userId, healthStatus: "healthy", lastHealthCheckAt: new Date() },
    update: { enabled: true, healthStatus: "healthy", lastHealthCheckAt: new Date() },
  });
  const creds: Record<string, string> =
    state.provider === "google"
      ? { emailAddress: email, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: expiresAt.toISOString(), clientId: e.GOOGLE_OAUTH_CLIENT_ID ?? "", clientSecret: e.GOOGLE_OAUTH_CLIENT_SECRET ?? "" }
      : { emailAddress: email, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: expiresAt.toISOString(), clientId: e.MICROSOFT_OAUTH_CLIENT_ID ?? "", clientSecret: e.MICROSOFT_OAUTH_CLIENT_SECRET ?? "", tenant: e.MICROSOFT_OAUTH_TENANT };
  await writeCredentials(integration.id, creds, { kind: "oauth", scopes: tokens.scope?.split(" ") ?? [], expiresAt });
  const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId: state.workspaceId } });
  const existingMailbox = await prisma.emailMailbox.findFirst({ where: { workspaceId: state.workspaceId, emailAddress: email }, include: { senderAccount: true } });
  let senderId: string;
  if (existingMailbox) {
    await prisma.senderAccount.update({ where: { id: existingMailbox.senderAccountId }, data: { status: "connected", integrationId: integration.id, provider: state.provider, connectedAt: new Date() } });
    await prisma.emailMailbox.update({ where: { id: existingMailbox.id }, data: { provider: mailboxProvider, inboundMode: mailboxProvider === "google" ? "gmail_api" : "graph_poll" } });
    senderId = existingMailbox.senderAccountId;
  } else {
    const sender = await prisma.senderAccount.create({ data: { workspaceId: state.workspaceId, channel: "email", provider: state.provider, displayName: email, handle: email, status: "connected", integrationId: integration.id, ownerUserId: state.userId, timezone: settings?.timezone, connectedAt: new Date() } });
    await prisma.emailMailbox.create({ data: { workspaceId: state.workspaceId, senderAccountId: sender.id, emailAddress: email, provider: mailboxProvider, domain: email.split("@")[1], dailyLimit: ((settings?.defaultDailyLimits as { email?: number } | null)?.email ?? 40), inboundMode: state.provider === "google" ? "gmail_api" : "graph_poll" } });
    senderId = sender.id;
  }
  await audit({ ...systemCtx(state.workspaceId, state.workspaceSlug), userId: state.userId, actorType: "user" }, "sender.connected", { type: "sender", id: senderId }, { provider: state.provider, email });
  return { senderId, email };
}

export async function completeXConnect(state: OAuthState, tokens: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; xUser: { id: string; username: string } | null }) {
  if (!tokens.xUser) throw ApiError.invalid("X did not return the connected user");
  const e = env();
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 7200) * 1000);
  const label = `@${tokens.xUser.username}`;
  const integration = await prisma.integration.upsert({
    where: { workspaceId_category_provider_label: { workspaceId: state.workspaceId, category: "x", provider: "x_api", label } },
    create: { workspaceId: state.workspaceId, category: "x", provider: "x_api", label, enabled: true, priority: 100, config: {}, createdByUserId: state.userId, healthStatus: "healthy", lastHealthCheckAt: new Date() },
    update: { enabled: true, healthStatus: "healthy", lastHealthCheckAt: new Date() },
  });
  await writeCredentials(integration.id, { accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? "", expiresAt: expiresAt.toISOString(), clientId: e.X_CLIENT_ID ?? "", clientSecret: e.X_CLIENT_SECRET ?? "", userId: tokens.xUser.id, handle: tokens.xUser.username }, { kind: "oauth", scopes: tokens.scope?.split(" ") ?? [], expiresAt });
  const sender = await registerXSender(state.workspaceId, integration.id, { userId: tokens.xUser.id, handle: tokens.xUser.username }, state.userId);
  await audit({ ...systemCtx(state.workspaceId, state.workspaceSlug), userId: state.userId, actorType: "user" }, "sender.connected", { type: "sender", id: sender.id }, { provider: "x_api", handle: tokens.xUser.username });
  return { senderId: sender.id, handle: tokens.xUser.username };
}
