import "server-only";
import { z } from "zod";
import type { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { requirePermission, type Ctx } from "@/server/auth/context";
import { audit } from "@/server/modules/audit/service";
import { newOpaqueToken, sha256 } from "@/server/auth/tokens";
import { sendSystemEmail } from "@/server/email/system-mailer";
import { env } from "@/lib/env";
import { ROLE_RANK } from "@/server/auth/rbac";

const RESERVED_SLUGS = new Set(["new", "api", "w", "sign-in", "sign-up", "admin", "settings", "invite", "workspaces"]);

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "workspace";
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = RESERVED_SLUGS.has(base) ? `${base}-1` : base;
  for (let i = 2; i < 50; i++) {
    const taken = await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export const createWorkspaceInput = z.object({
  name: z.string().trim().min(2, "Give the workspace a name").max(80),
  timezone: z.string().min(1).max(64).default("UTC"),
});

export async function createWorkspace(userId: string, input: z.infer<typeof createWorkspaceInput>) {
  const slug = await uniqueSlug(input.name);
  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({ data: { name: input.name, slug, ownerUserId: userId } });
    await tx.workspaceMember.create({ data: { workspaceId: ws.id, userId, role: "owner" } });
    await tx.workspaceSettings.create({ data: { workspaceId: ws.id, timezone: input.timezone } });
    await tx.companyProfile.create({ data: { workspaceId: ws.id } });
    await tx.auditLog.create({
      data: { workspaceId: ws.id, actorUserId: userId, actorType: "user", action: "workspace.created", targetType: "workspace", targetId: ws.id },
    });
    return ws;
  });
  return workspace;
}

export async function listWorkspacesForUser(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, workspace: { deletedAt: null } },
    include: { workspace: { select: { id: true, name: true, slug: true, createdAt: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({ ...m.workspace, role: m.role }));
}

export async function getWorkspace(ctx: Ctx) {
  requirePermission(ctx, "workspace.read");
  const ws = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    include: { settings: true, _count: { select: { members: true } } },
  });
  if (!ws || ws.deletedAt) throw ApiError.notFound("workspace");
  return ws;
}

export const updateWorkspaceInput = z.object({
  name: z.string().trim().min(2).max(80).optional(),
});

export async function updateWorkspace(ctx: Ctx, input: z.infer<typeof updateWorkspaceInput>) {
  requirePermission(ctx, "workspace.update");
  const ws = await prisma.workspace.update({ where: { id: ctx.workspaceId }, data: { name: input.name } });
  await audit(ctx, "workspace.updated", { type: "workspace", id: ws.id }, { fields: Object.keys(input) });
  return ws;
}

export const sendingWindowSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const updateSettingsInput = z.object({
  timezone: z.string().min(1).max(64).optional(),
  sendingWindow: sendingWindowSchema.optional(),
  defaultDailyLimits: z
    .object({
      email: z.number().int().min(1).max(5000),
      linkedinInvites: z.number().int().min(1).max(30),
      linkedinMessages: z.number().int().min(1).max(100),
      xDms: z.number().int().min(1).max(100),
    })
    .partial()
    .optional(),
  aiAutoSendReplies: z.boolean().optional(),
  aiAutoSendMinConfidence: z.number().min(0.5).max(1).optional(),
  aiDefaultProvider: z.string().max(40).nullable().optional(),
  aiDefaultModel: z.string().max(120).nullable().optional(),
  bookingLink: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  unsubscribeFooterEnabled: z.boolean().optional(),
  plainTextEmail: z.boolean().optional(),
  allowConcurrentCampaigns: z.boolean().optional(),
  dataRetentionDays: z.number().int().min(7).max(3650).optional(),
});

export async function getSettings(ctx: Ctx) {
  requirePermission(ctx, "workspace.read");
  return prisma.workspaceSettings.upsert({
    where: { workspaceId: ctx.workspaceId },
    update: {},
    create: { workspaceId: ctx.workspaceId },
  });
}

export async function updateSettings(ctx: Ctx, input: z.infer<typeof updateSettingsInput>) {
  requirePermission(ctx, "settings.update");
  const current = await getSettings(ctx);
  const merged = {
    ...input,
    defaultDailyLimits: input.defaultDailyLimits
      ? { ...(current.defaultDailyLimits as object), ...input.defaultDailyLimits }
      : undefined,
  };
  const settings = await prisma.workspaceSettings.update({ where: { workspaceId: ctx.workspaceId }, data: merged });
  await audit(ctx, "workspace.settings.updated", { type: "workspace", id: ctx.workspaceId }, { fields: Object.keys(input) });
  return settings;
}

export async function softDeleteWorkspace(ctx: Ctx) {
  requirePermission(ctx, "workspace.delete");
  await prisma.$transaction([
    prisma.workspace.update({ where: { id: ctx.workspaceId }, data: { deletedAt: new Date() } }),
    // Credentials are removed immediately; the rest waits for the retention job.
    prisma.integrationCredential.deleteMany({ where: { integration: { workspaceId: ctx.workspaceId } } }),
  ]);
  await audit(ctx, "workspace.deleted", { type: "workspace", id: ctx.workspaceId });
}

// ───────────────────────────── Members ─────────────────────────────

export async function listMembers(ctx: Ctx) {
  requirePermission(ctx, "members.read");
  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { user: { select: { id: true, email: true, name: true, lastLoginAt: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.workspaceInvitation.findMany({
      where: { workspaceId: ctx.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { members, invitations };
}

export const inviteInput = z.object({
  email: z.string().trim().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function inviteMember(ctx: Ctx, input: z.infer<typeof inviteInput>) {
  requirePermission(ctx, "members.manage");
  const email = input.email.toLowerCase();
  const existing = await prisma.workspaceMember.findFirst({ where: { workspaceId: ctx.workspaceId, user: { email } } });
  if (existing) throw ApiError.conflict("That person is already a member");
  const { token, tokenHash } = newOpaqueToken(24);
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
  await prisma.workspaceInvitation.deleteMany({ where: { workspaceId: ctx.workspaceId, email, acceptedAt: null } });
  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId: ctx.workspaceId,
      email,
      role: input.role,
      tokenHash,
      invitedByUserId: ctx.userId!,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  const link = `${env().APP_BASE_URL}/invite/${token}`;
  await sendSystemEmail({
    to: email,
    subject: `You are invited to ${ws.name} on AREVEI GTM`,
    text: `Join the ${ws.name} workspace: ${link}\n\nThis link expires in 7 days.`,
  });
  await audit(ctx, "member.invited", { type: "invitation", id: invitation.id }, { email, role: input.role });
  return { invitation, link };
}

export async function revokeInvitation(ctx: Ctx, invitationId: string) {
  requirePermission(ctx, "members.manage");
  const res = await prisma.workspaceInvitation.deleteMany({ where: { id: invitationId, workspaceId: ctx.workspaceId } });
  if (res.count === 0) throw ApiError.notFound("invitation");
  await audit(ctx, "member.invitation_revoked", { type: "invitation", id: invitationId });
}

export async function previewInvitation(token: string) {
  const inv = await prisma.workspaceInvitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { workspace: { select: { name: true, slug: true } } },
  });
  if (!inv || inv.acceptedAt || inv.expiresAt.getTime() < Date.now()) return null;
  return inv;
}

export async function acceptInvitation(token: string, userId: string, userEmail: string) {
  const inv = await previewInvitation(token);
  if (!inv) throw ApiError.invalid("This invitation is no longer valid");
  if (inv.email !== userEmail.toLowerCase()) throw ApiError.forbidden("This invitation was sent to a different email address");
  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId } },
      update: {},
      create: { workspaceId: inv.workspaceId, userId, role: inv.role },
    });
    await tx.workspaceInvitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await tx.auditLog.create({
      data: { workspaceId: inv.workspaceId, actorUserId: userId, actorType: "user", action: "member.joined", targetType: "user", targetId: userId },
    });
  });
  return inv.workspace;
}

export async function changeMemberRole(ctx: Ctx, memberUserId: string, role: WorkspaceRole) {
  requirePermission(ctx, "members.manage");
  if (role === "owner") requirePermission(ctx, "members.change_owner");
  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: memberUserId } },
  });
  if (!target) throw ApiError.notFound("member");
  if (target.role === "owner" && ctx.role !== "owner") throw ApiError.forbidden("Only the owner can change the owner");
  if (ROLE_RANK[role] > ROLE_RANK[ctx.role]) throw ApiError.forbidden("You cannot grant a role above your own");
  if (role === "owner") {
    await prisma.$transaction([
      prisma.workspaceMember.updateMany({ where: { workspaceId: ctx.workspaceId, role: "owner" }, data: { role: "admin" } }),
      prisma.workspaceMember.update({ where: { id: target.id }, data: { role: "owner" } }),
      prisma.workspace.update({ where: { id: ctx.workspaceId }, data: { ownerUserId: memberUserId } }),
    ]);
  } else {
    if (target.role === "owner") throw ApiError.invalid("Transfer ownership to someone else first");
    await prisma.workspaceMember.update({ where: { id: target.id }, data: { role } });
  }
  await audit(ctx, "member.role_changed", { type: "user", id: memberUserId }, { role });
}

export async function removeMember(ctx: Ctx, memberUserId: string) {
  requirePermission(ctx, "members.manage");
  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: memberUserId } },
  });
  if (!target) throw ApiError.notFound("member");
  if (target.role === "owner") throw ApiError.invalid("The owner cannot be removed. Transfer ownership first.");
  if (ROLE_RANK[target.role] >= ROLE_RANK[ctx.role] && ctx.role !== "owner") throw ApiError.forbidden("You cannot remove this member");
  await prisma.workspaceMember.delete({ where: { id: target.id } });
  await audit(ctx, "member.removed", { type: "user", id: memberUserId });
}
