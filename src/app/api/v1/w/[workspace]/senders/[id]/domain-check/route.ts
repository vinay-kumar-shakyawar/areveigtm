import { apiHandler } from "@/server/api/handler";
import { checkSenderDomain } from "@/server/modules/senders/service";

export const POST = apiHandler({ allowApiKey: false, rateLimit: { limit: 20, windowSec: 600 } }, async ({ ctx, params }) => ({ report: await checkSenderDomain(ctx, params.id) }));
