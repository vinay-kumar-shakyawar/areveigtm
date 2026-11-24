import { apiHandler } from "@/server/api/handler";
import { markRead } from "@/server/modules/inbox/service";

export const POST = apiHandler({}, async ({ ctx, params }) => {
  await markRead(ctx, params.id);
  return { ok: true };
});
