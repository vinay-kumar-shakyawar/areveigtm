import { requireWorkspaceContext } from "@/server/auth/context";
import { listMembers } from "@/server/modules/workspace/service";
import { can } from "@/server/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { MembersTable } from "./members-table";
import { InviteForm } from "./invite-form";

export default async function MembersPage(props: PageProps<"/w/[workspaceSlug]/settings/members">) {
  const { workspaceSlug } = await props.params;
  const { ctx, user } = await requireWorkspaceContext(workspaceSlug);
  const { members, invitations } = await listMembers(ctx);
  const canManage = can(ctx.role, "members.manage");
  return (
    <>
      <PageHeader title="Members" description="Owners manage billing-level settings, admins manage integrations and members, members operate leads, campaigns and the inbox." />
      {canManage && <InviteForm slug={workspaceSlug} />}
      <MembersTable
        slug={workspaceSlug}
        currentUserId={user.id}
        currentRole={ctx.role}
        canManage={canManage}
        members={members.map((m) => ({ userId: m.userId, email: m.user.email, name: m.user.name, role: m.role, joinedAt: m.joinedAt.toISOString(), lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null }))}
        invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
      />
    </>
  );
}
