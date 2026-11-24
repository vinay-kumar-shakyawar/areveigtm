import { apiHandler } from "@/server/api/handler";
import { testSubscription } from "@/server/modules/webhooks/service";

export const POST = apiHandler({ rateLimit: { limit: 30, windowSec: 600 } }, async ({ ctx, params }) => ({ delivery: await testSubscription(ctx, params.id) }));
