import { apiHandler } from "@/server/api/handler";
import { listWorkspacesForUser } from "@/server/modules/workspace/service";

export const GET = apiHandler({ workspaceParam: false, allowApiKey: false }, async ({ user }) => {
  const workspaces = await listWorkspacesForUser(user!.id);
  return { user: { id: user!.id, email: user!.email, name: user!.name, emailVerifiedAt: user!.emailVerifiedAt }, workspaces };
});
