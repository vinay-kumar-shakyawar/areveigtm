import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { makeWorkspace, ctxAs, addMember } = await import("../helpers");
const svc = await import("@/server/modules/integrations/service");
const registry = await import("@/server/providers/registry");
const { mockLlmState } = await import("@/server/providers/mock");
const { ProviderError } = await import("@/server/providers/types");
import type { LlmProvider } from "@/server/providers/types";

describe("integrations and provider registry", () => {
  it("stores credentials encrypted and never exposes them", async () => {
    const { ctx } = await makeWorkspace();
    const view = await svc.createIntegration(ctx, { category: "llm", provider: "anthropic", credentials: { apiKey: "sk-ant-secret-1234" }, config: { model: "claude-opus-5-5" } });
    expect(JSON.stringify(view)).not.toContain("sk-ant-secret");
    expect(view.credential?.fingerprint).toBe("…1234");
    const raw = await prisma.integrationCredential.findUniqueOrThrow({ where: { integrationId: view.id } });
    expect(Buffer.from(raw.ciphertext).toString("utf8")).not.toContain("sk-ant-secret");
    const listed = await svc.listIntegrations(ctx);
    expect(JSON.stringify(listed)).not.toContain("sk-ant-secret");
  });

  it("members cannot manage integrations but can read them", async () => {
    const { ctx, ws } = await makeWorkspace();
    const member = await addMember(ws.id, "member");
    const mctx = ctxAs(ctx, "member", member.id);
    await expect(svc.createIntegration(mctx, { category: "llm", provider: "mock" })).rejects.toThrow(/cannot perform/);
    await expect(svc.listIntegrations(mctx)).resolves.toEqual([]);
  });

  it("resolves workspace providers in priority order with the default first", async () => {
    const { ctx } = await makeWorkspace();
    await svc.createIntegration(ctx, { category: "llm", provider: "openai", credentials: { apiKey: "sk-a" }, priority: 10 });
    const mock = await svc.createIntegration(ctx, { category: "llm", provider: "mock", isDefault: true, priority: 50 });
    const resolved = await registry.resolveProviders<LlmProvider>(ctx.workspaceId, "llm.structured");
    expect(resolved.map((r) => r.descriptor.id)).toEqual(["mock", "openai"]);
    expect(resolved[0].integrationId).toBe(mock.id);
  });

  it("generates structured output through the mock provider and records usage", async () => {
    const { ctx } = await makeWorkspace();
    await svc.createIntegration(ctx, { category: "llm", provider: "mock" });
    mockLlmState.nextStructured = { titles: ["Head of Marketing"], seniority: ["Director"] };
    const schema = z.object({ titles: z.array(z.string()), seniority: z.array(z.string()) });
    const { result, provider } = await registry.withFallback<LlmProvider, z.infer<typeof schema>>(ctx.workspaceId, "llm.structured", async (p) => {
      const r = await p.instance.generateStructured({ schema, messages: [{ role: "user", content: "extract" }], purpose: "test" });
      return r.data;
    });
    expect(result.titles).toEqual(["Head of Marketing"]);
    expect(provider.descriptor.id).toBe("mock");
    // Usage is recorded asynchronously; give it a tick.
    await new Promise((r) => setTimeout(r, 50));
    const usage = await prisma.providerUsage.findMany({ where: { workspaceId: ctx.workspaceId } });
    expect(usage.some((u) => u.operation === "llm.structured" && u.provider === "mock")).toBe(true);
  });

  it("rejects schema mismatches from the model", async () => {
    const { ctx } = await makeWorkspace();
    await svc.createIntegration(ctx, { category: "llm", provider: "mock" });
    mockLlmState.nextStructured = { wrong: true };
    const schema = z.object({ titles: z.array(z.string()) });
    await expect(registry.withFallback<LlmProvider, unknown>(ctx.workspaceId, "llm.structured", (p) => p.instance.generateStructured({ schema, messages: [{ role: "user", content: "x" }] }))).rejects.toThrow(
      /did not match/,
    );
  });

  it("falls back to the next provider on retryable errors and surfaces auth errors", async () => {
    const { ctx } = await makeWorkspace();
    await svc.createIntegration(ctx, { category: "llm", provider: "mock", isDefault: true });
    await svc.createIntegration(ctx, { category: "llm", provider: "mock", label: "second", priority: 200 });
    let calls = 0;
    const { provider } = await registry.withFallback<LlmProvider, string>(ctx.workspaceId, "llm.generate", async (p) => {
      calls++;
      if (calls === 1) throw new ProviderError("mock", "rate_limited", "slow down");
      return p.descriptor.id;
    });
    expect(calls).toBe(2);
    expect(provider.descriptor.id).toBe("mock");
    await expect(
      registry.withFallback<LlmProvider, string>(ctx.workspaceId, "llm.generate", async () => {
        throw new ProviderError("mock", "auth", "bad key");
      }),
    ).rejects.toThrow(/authentication failed/);
  });

  it("reports not_configured when nothing can serve a capability", async () => {
    const { ctx } = await makeWorkspace();
    await expect(registry.resolveProvider(ctx.workspaceId, "people.search")).rejects.toThrow(/No provider is configured/);
    // Keyless built-in fetcher is always available for web.fetch
    const fetcher = await registry.resolveProvider(ctx.workspaceId, "web.fetch");
    expect(fetcher.descriptor.id).toBe("builtin");
  });

  it("test connection updates health and tenant isolation holds", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const created = await svc.createIntegration(a.ctx, { category: "people_data", provider: "mock" });
    const res = await svc.testIntegration(a.ctx, created.id);
    expect(res.ok).toBe(true);
    const row = await prisma.integration.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.healthStatus).toBe("healthy");
    await expect(svc.testIntegration(b.ctx, created.id)).rejects.toThrow(/not found/);
    await expect(svc.updateIntegration(b.ctx, created.id, { enabled: false })).rejects.toThrow(/not found/);
    await expect(svc.deleteIntegration(b.ctx, created.id)).rejects.toThrow(/not found/);
  });
});
