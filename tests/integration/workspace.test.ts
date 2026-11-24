import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { makeWorkspace, ctxAs, addMember, makeUser } = await import("../helpers");
const ws = await import("@/server/modules/workspace/service");

describe("workspace service", () => {
  it("creates a workspace with owner membership, settings and an empty company profile", async () => {
    const { ws: created, user } = await makeWorkspace("Acme Robotics");
    expect(created.slug).toMatch(/^acme-robotics/);
    const members = await prisma.workspaceMember.findMany({ where: { workspaceId: created.id } });
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
    expect(await prisma.workspaceSettings.findUnique({ where: { workspaceId: created.id } })).toBeTruthy();
    expect(await prisma.companyProfile.findUnique({ where: { workspaceId: created.id } })).toBeTruthy();
    const list = await ws.listWorkspacesForUser(user.id);
    expect(list.map((w) => w.id)).toContain(created.id);
  });

  it("generates unique slugs for duplicate names", async () => {
    const a = await makeWorkspace("Same Name");
    const b = await makeWorkspace("Same Name");
    expect(a.ws.slug).not.toBe(b.ws.slug);
  });

  it("enforces role permissions on settings and members", async () => {
    const { ctx, ws: created } = await makeWorkspace();
    const member = await addMember(created.id, "member");
    const memberCtx = ctxAs(ctx, "member", member.id);
    await expect(ws.updateSettings(memberCtx, { timezone: "Europe/Paris" })).rejects.toThrow(/cannot perform/);
    await expect(ws.inviteMember(memberCtx, { email: "x@test.local", role: "member" })).rejects.toThrow(/cannot perform/);
    const settings = await ws.updateSettings(ctx, { timezone: "Europe/Paris", aiAutoSendReplies: true });
    expect(settings.timezone).toBe("Europe/Paris");
    expect(settings.aiAutoSendReplies).toBe(true);
  });

  it("invites, accepts, changes roles and removes members", async () => {
    const { ctx, ws: created } = await makeWorkspace();
    const invitee = await makeUser();
    const { link } = await ws.inviteMember(ctx, { email: invitee.email, role: "admin" });
    const token = link.split("/invite/")[1];
    const other = await makeUser();
    await expect(ws.acceptInvitation(token, other.id, other.email)).rejects.toThrow(/different email/);
    const joined = await ws.acceptInvitation(token, invitee.id, invitee.email);
    expect(joined.slug).toBe(created.slug);
    const { members } = await ws.listMembers(ctx);
    expect(members.find((m) => m.userId === invitee.id)?.role).toBe("admin");

    // Admin cannot grant owner, owner can transfer.
    const adminCtx = ctxAs(ctx, "admin", invitee.id);
    await expect(ws.changeMemberRole(adminCtx, ctx.userId!, "member")).rejects.toThrow();
    await ws.changeMemberRole(ctx, invitee.id, "owner");
    const after = await prisma.workspace.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.ownerUserId).toBe(invitee.id);
    const me = await prisma.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: created.id, userId: ctx.userId! } } });
    expect(me.role).toBe("admin");

    // New owner removes the old owner (now admin).
    const newOwnerCtx = ctxAs(ctx, "owner", invitee.id);
    await ws.removeMember(newOwnerCtx, ctx.userId!);
    expect(await prisma.workspaceMember.count({ where: { workspaceId: created.id } })).toBe(1);
  });

  it("writes audit rows for sensitive actions", async () => {
    const { ctx } = await makeWorkspace();
    await ws.updateSettings(ctx, { plainTextEmail: false });
    const rows = await prisma.auditLog.findMany({ where: { workspaceId: ctx.workspaceId } });
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["workspace.created", "workspace.settings.updated"]));
  });
});
