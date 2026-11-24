import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { changeMemberRole, removeMember } from "@/server/modules/workspace/service";

export const PATCH = apiHandler({ body: z.object({ role: z.enum(["owner", "admin", "member"]) }), allowApiKey: false }, async ({ ctx, body, params }) => {
  await changeMemberRole(ctx, params.userId, body.role);
  return { ok: true };
});

export const DELETE = apiHandler({ allowApiKey: false }, async ({ ctx, params }) => {
  await removeMember(ctx, params.userId);
  return { ok: true };
});
