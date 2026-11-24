import { apiHandler } from "@/server/api/handler";
import { createWorkspace, createWorkspaceInput, listWorkspacesForUser } from "@/server/modules/workspace/service";

export const GET = apiHandler({ workspaceParam: false }, async ({ user, ctx }) => {
  if (!user) return { workspaces: [{ id: ctx.workspaceId, slug: ctx.workspaceSlug, role: ctx.role }] };
  return { workspaces: await listWorkspacesForUser(user.id) };
});

export const POST = apiHandler({ workspaceParam: false, allowApiKey: false, body: createWorkspaceInput }, async ({ user, body }) => {
  const ws = await createWorkspace(user!.id, body);
  return Response.json({ workspace: { id: ws.id, slug: ws.slug, name: ws.name } }, { status: 201 });
});
