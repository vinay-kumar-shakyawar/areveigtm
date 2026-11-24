import { apiHandler } from "@/server/api/handler";
import { inviteInput, inviteMember, listMembers } from "@/server/modules/workspace/service";

export const GET = apiHandler({}, async ({ ctx }) => {
  const { members, invitations } = await listMembers(ctx);
  return {
    members: members.map((m) => ({ userId: m.userId, email: m.user.email, name: m.user.name, role: m.role, joinedAt: m.joinedAt })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
  };
});

export const POST = apiHandler({ body: inviteInput, allowApiKey: false }, async ({ ctx, body }) => {
  const { invitation } = await inviteMember(ctx, body);
  return Response.json({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt } }, { status: 201 });
});
