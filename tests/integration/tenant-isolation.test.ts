import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { makeWorkspace } = await import("../helpers");
const ws = await import("@/server/modules/workspace/service");
const keys = await import("@/server/modules/api-keys/service");

/**
 * Every service must refuse ids that belong to another workspace. New
 * services should add a case here.
 */
describe("tenant isolation", () => {
  it("members and invitations are invisible across workspaces", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const { invitation } = await ws.inviteMember(a.ctx, { email: "p@test.local", role: "member" });
    await expect(ws.revokeInvitation(b.ctx, invitation.id)).rejects.toThrow(/not found/);
    await expect(ws.removeMember(b.ctx, a.user.id)).rejects.toThrow(/not found/);
    const bMembers = await ws.listMembers(b.ctx);
    expect(bMembers.members.map((m) => m.userId)).not.toContain(a.user.id);
    expect(bMembers.invitations).toHaveLength(0);
  });

  it("api keys cannot be revoked from another workspace", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const { id } = await keys.createApiKey(a.ctx, { name: "k", scopes: ["read"] });
    await expect(keys.revokeApiKey(b.ctx, id)).rejects.toThrow(/not found/);
    expect((await keys.listApiKeys(b.ctx)).map((k) => k.id)).not.toContain(id);
    await keys.revokeApiKey(a.ctx, id);
  });

  it("settings updates only touch the caller's workspace", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    await ws.updateSettings(a.ctx, { timezone: "Asia/Dubai" });
    const sb = await prisma.workspaceSettings.findUniqueOrThrow({ where: { workspaceId: b.ctx.workspaceId } });
    expect(sb.timezone).toBe("UTC");
  });
});
