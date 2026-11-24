import { requireWorkspaceContext } from "@/server/auth/context";
import { listWorkspacesForUser } from "@/server/modules/workspace/service";
import { prisma } from "@/server/db/client";
import { AppShell } from "@/components/app/app-shell";
import { Toaster } from "@/components/ui/sonner";

export default async function WorkspaceLayout(props: LayoutProps<"/w/[workspaceSlug]">) {
  const { workspaceSlug } = await props.params;
  const { ctx, user, workspaceName } = await requireWorkspaceContext(workspaceSlug);
  const [workspaces, unread] = await Promise.all([
    listWorkspacesForUser(user.id),
    prisma.notification.count({
      where: { workspaceId: ctx.workspaceId, readAt: null, OR: [{ userId: null }, { userId: user.id }] },
    }),
  ]);
  return (
    <AppShell
      user={{ id: user.id, email: user.email, name: user.name }}
      workspace={{ id: ctx.workspaceId, slug: workspaceSlug, name: workspaceName, role: ctx.role }}
      workspaces={workspaces.map((w) => ({ slug: w.slug, name: w.name }))}
      unreadNotifications={unread}
    >
      {props.children}
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
