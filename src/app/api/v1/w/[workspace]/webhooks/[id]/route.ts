import { apiHandler } from "@/server/api/handler";
import { deleteSubscription, updateSubscription, updateSubscriptionInput } from "@/server/modules/webhooks/service";

export const PATCH = apiHandler({ body: updateSubscriptionInput }, async ({ ctx, body, params }) => ({ subscription: await updateSubscription(ctx, params.id, body) }));

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteSubscription(ctx, params.id);
  return { ok: true };
});
