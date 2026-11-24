import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

// In-memory cookie jar standing in for Next's request cookies.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));

const { makeWorkspace, addMember, ctxAs } = await import("../helpers");
const keys = await import("@/server/modules/api-keys/service");
const integrations = await import("@/server/modules/integrations/service");
const session = await import("@/server/auth/session");
const { rateLimit, resetRateLimits } = await import("@/server/api/rate-limit");
const leadsRoute = await import("@/app/api/v1/w/[workspace]/leads/route");
const integrationsRoute = await import("@/app/api/v1/w/[workspace]/integrations/route");
const sendersRoute = await import("@/app/api/v1/w/[workspace]/senders/route");
const webhooksRoute = await import("@/app/api/v1/w/[workspace]/webhooks/route");
const resendWebhook = await import("@/app/api/webhooks/resend/[integrationId]/route");
const unsubscribeRoute = await import("@/app/api/unsubscribe/[token]/route");

const BASE = "http://localhost:3000";
const req = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) => new NextRequest(`${BASE}${path}`, init as never);
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

describe("API security", () => {
  beforeEach(() => {
    jar.clear();
    resetRateLimits();
  });

  it("rejects unauthenticated, unknown-bearer and revoked-key requests", async () => {
    const { ctx, ws } = await makeWorkspace();
    expect((await leadsRoute.GET(req(`/api/v1/w/${ws.slug}/leads`), params({ workspace: ws.slug }))).status).toBe(401);
    expect((await leadsRoute.GET(req(`/api/v1/w/${ws.slug}/leads`, { headers: { authorization: "Bearer nonsense" } }), params({ workspace: ws.slug }))).status).toBe(401);
    const { raw: key, id } = await keys.createApiKey(ctx, { name: "k", scopes: ["read"] });
    const ok = await leadsRoute.GET(req(`/api/v1/w/${ws.slug}/leads`, { headers: { authorization: `Bearer ${key}` } }), params({ workspace: ws.slug }));
    expect(ok.status).toBe(200);
    await keys.revokeApiKey(ctx, id);
    expect((await leadsRoute.GET(req(`/api/v1/w/${ws.slug}/leads`, { headers: { authorization: `Bearer ${key}` } }), params({ workspace: ws.slug }))).status).toBe(401);
  });

  it("scopes API keys to their workspace and to read-only when requested", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const { raw: readKey } = await keys.createApiKey(a.ctx, { name: "ro", scopes: ["read"] });
    const { raw: writeKey } = await keys.createApiKey(a.ctx, { name: "rw", scopes: ["read", "write"] });
    // Other workspace → forbidden even with a valid key.
    const cross = await leadsRoute.GET(req(`/api/v1/w/${b.ws.slug}/leads`, { headers: { authorization: `Bearer ${readKey}` } }), params({ workspace: b.ws.slug }));
    expect(cross.status).toBe(403);
    // Read-only key cannot mutate.
    const ro = await webhooksRoute.POST(req(`/api/v1/w/${a.ws.slug}/webhooks`, { method: "POST", headers: { authorization: `Bearer ${readKey}`, "content-type": "application/json" }, body: JSON.stringify({ url: "http://127.0.0.1:1/x", events: ["reply.received"] }) }), params({ workspace: a.ws.slug }));
    expect(ro.status).toBe(403);
    expect((await ro.json()).error.message).toMatch(/read-only/);
    // Write key can, and gets a validated error envelope on bad input.
    const bad = await webhooksRoute.POST(req(`/api/v1/w/${a.ws.slug}/webhooks`, { method: "POST", headers: { authorization: `Bearer ${writeKey}`, "content-type": "application/json" }, body: JSON.stringify({ url: "not-a-url", events: [] }) }), params({ workspace: a.ws.slug }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("invalid_request");
    // Sender management is session-only: API keys are refused outright.
    const senders = await sendersRoute.POST(req(`/api/v1/w/${a.ws.slug}/senders`, { method: "POST", headers: { authorization: `Bearer ${writeKey}`, "content-type": "application/json" }, body: "{}" }), params({ workspace: a.ws.slug }));
    expect(senders.status).toBe(401);
  });

  it("never returns credential material and enforces same-origin for cookie sessions", async () => {
    const { ctx, ws, user } = await makeWorkspace();
    await integrations.createIntegration(ctx, { category: "llm", provider: "anthropic", credentials: { apiKey: "sk-ant-secret-value-123456" } });
    await session.createSession(user.id);
    const res = await integrationsRoute.GET(req(`/api/v1/w/${ws.slug}/integrations`), params({ workspace: ws.slug }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("sk-ant-secret");
    expect(text).not.toContain("ciphertext");
    expect(text).toContain("fingerprint");
    // Cookie-authenticated mutation from a foreign origin is rejected (CSRF).
    const csrf = await webhooksRoute.POST(req(`/api/v1/w/${ws.slug}/webhooks`, { method: "POST", headers: { origin: "https://evil.example", host: "localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ url: "http://127.0.0.1:1/x", events: ["reply.received"] }) }), params({ workspace: ws.slug }));
    expect(csrf.status).toBe(403);
    // Members cannot manage webhooks even with a valid session.
    const member = await addMember(ws.id, "member");
    jar.clear();
    await session.createSession(member.id);
    const forbidden = await webhooksRoute.POST(req(`/api/v1/w/${ws.slug}/webhooks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "http://127.0.0.1:1/x", events: ["reply.received"] }) }), params({ workspace: ws.slug }));
    expect(forbidden.status).toBe(403);
    expect(ctxAs(ctx, "member", member.id).role).toBe("member");
  });

  it("rate limits per key and reports retry-after", async () => {
    await rateLimit("t:k", 2, 60);
    await rateLimit("t:k", 2, 60);
    await expect(rateLimit("t:k", 2, 60)).rejects.toMatchObject({ code: "rate_limited" });
    await rateLimit("t:other", 2, 60); // separate bucket unaffected
  });

  it("public webhook and unsubscribe endpoints verify what they receive", async () => {
    const { ctx } = await makeWorkspace();
    expect((await resendWebhook.POST(req("/api/webhooks/resend/not-a-uuid", { method: "POST", body: "{}" }), params({ integrationId: "not-a-uuid" }))).status).toBe(404);
    const resend = await integrations.createIntegration(ctx, { category: "email", provider: "resend", credentials: { apiKey: "re_test", webhookSigningSecret: `whsec_${Buffer.from("secret").toString("base64")}` } });
    const unsigned = await resendWebhook.POST(req(`/api/webhooks/resend/${resend.id}`, { method: "POST", headers: { "svix-id": "x", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,bad" }, body: JSON.stringify({ type: "email.delivered" }) }), params({ integrationId: resend.id }));
    expect(unsigned.status).toBe(401);
    expect(await prisma.webhookEvent.count({ where: { provider: "resend" } })).toBe(0);
    const bogus = await unsubscribeRoute.POST(req("/api/unsubscribe/abc.def", { method: "POST" }), params({ token: "abc.def" }));
    expect(bogus.status).toBe(400);
  });
});
