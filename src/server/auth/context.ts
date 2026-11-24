import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { getCurrentUser, type CurrentUser } from "@/server/auth/session";
import { ApiError } from "@/server/api/errors";
import { assertCan, type Permission } from "@/server/auth/rbac";
import { nanoid } from "nanoid";

/**
 * Tenant context passed to every service call. Services never accept a bare
 * workspaceId from the client; they receive this object.
 */
export interface Ctx {
  workspaceId: string;
  workspaceSlug: string;
  userId: string | null;
  role: WorkspaceRole;
  requestId: string;
  actorType: "user" | "api_key" | "system" | "job";
  apiKeyId?: string;
}

export function systemCtx(workspaceId: string, workspaceSlug = ""): Ctx {
  return { workspaceId, workspaceSlug, userId: null, role: "owner", requestId: nanoid(12), actorType: "system" };
}

export function jobCtx(workspaceId: string): Ctx {
  return { workspaceId, workspaceSlug: "", userId: null, role: "owner", requestId: nanoid(12), actorType: "job" };
}

export function requirePermission(ctx: Ctx, permission: Permission): void {
  assertCan(ctx.role, permission);
}

/** Memoised per request: membership lookup for a user in a workspace slug. */
export const resolveMembership = cache(async (userId: string, slug: string) => {
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: { members: { where: { userId } } },
  });
  if (!workspace || workspace.deletedAt) return null;
  const membership = workspace.members[0];
  if (!membership) return null;
  return { workspace, membership };
});

/** For server components and server actions under /w/[workspaceSlug]. Redirects when not allowed. */
export async function requireWorkspaceContext(slug: string): Promise<{ ctx: Ctx; user: CurrentUser; workspaceName: string }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/w/${slug}`)}`);
  const resolved = await resolveMembership(user.id, slug);
  if (!resolved) redirect("/");
  return {
    user,
    workspaceName: resolved.workspace.name,
    ctx: {
      workspaceId: resolved.workspace.id,
      workspaceSlug: slug,
      userId: user.id,
      role: resolved.membership.role,
      requestId: nanoid(12),
      actorType: "user",
    },
  };
}

/** Same as above but throws ApiError (for route handlers). */
export async function workspaceContextForUser(user: CurrentUser, slugOrId: string): Promise<Ctx> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  const workspace = await prisma.workspace.findFirst({
    where: { ...(isUuid ? { id: slugOrId } : { slug: slugOrId }), deletedAt: null },
    include: { members: { where: { userId: user.id } } },
  });
  if (!workspace || !workspace.members[0]) throw ApiError.forbidden("You are not a member of this workspace");
  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    userId: user.id,
    role: workspace.members[0].role,
    requestId: nanoid(12),
    actorType: "user",
  };
}
