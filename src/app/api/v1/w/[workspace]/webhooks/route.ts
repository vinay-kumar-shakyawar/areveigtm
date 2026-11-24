import { apiHandler } from "@/server/api/handler";
import { createSubscription, listSubscriptions, subscriptionInput, WEBHOOK_EVENTS } from "@/server/modules/webhooks/service";

export const GET = apiHandler({}, async ({ ctx }) => ({ subscriptions: await listSubscriptions(ctx), events: WEBHOOK_EVENTS }));

export const POST = apiHandler({ body: subscriptionInput }, async ({ ctx, body }) => {
  const subscription = await createSubscription(ctx, body);
  return Response.json({ subscription }, { status: 201 });
});
