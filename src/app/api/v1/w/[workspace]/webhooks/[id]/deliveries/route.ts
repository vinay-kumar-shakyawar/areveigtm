import { apiHandler } from "@/server/api/handler";
import { listDeliveries } from "@/server/modules/webhooks/service";

export const GET = apiHandler({}, async ({ ctx, params }) => ({ deliveries: await listDeliveries(ctx, params.id) }));
