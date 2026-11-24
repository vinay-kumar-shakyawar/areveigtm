import { nanoid } from "nanoid";
import { prisma } from "@/server/db/client";
import { createWorkspace } from "@/server/modules/workspace/service";
import type { Ctx } from "@/server/auth/context";
import type { WorkspaceRole } from "@prisma/client";

export async function makeUser(email = `${nanoid(8).toLowerCase()}@test.local`) {
  return prisma.user.create({ data: { email, name: "Test User", emailVerifiedAt: new Date() } });
}

export async function makeWorkspace(name = `WS ${nanoid(6)}`) {
  const user = await makeUser();
  const ws = await createWorkspace(user.id, { name, timezone: "UTC" });
  const ctx: Ctx = { workspaceId: ws.id, workspaceSlug: ws.slug, userId: user.id, role: "owner", requestId: nanoid(10), actorType: "user" };
  return { user, ws, ctx };
}

export function ctxAs(base: Ctx, role: WorkspaceRole, userId?: string): Ctx {
  return { ...base, role, userId: userId ?? base.userId, requestId: nanoid(10) };
}

export async function addMember(workspaceId: string, role: WorkspaceRole) {
  const user = await makeUser();
  await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, role } });
  return user;
}
