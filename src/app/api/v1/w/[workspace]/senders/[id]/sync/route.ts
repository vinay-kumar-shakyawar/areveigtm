import { apiHandler } from "@/server/api/handler";
import { syncInboxNow } from "@/server/modules/senders/service";

export const POST = apiHandler({ allowApiKey: false, rateLimit: { limit: 30, windowSec: 600 } }, async ({ ctx, params }) => ({ result: await syncInboxNow(ctx, params.id) }));
