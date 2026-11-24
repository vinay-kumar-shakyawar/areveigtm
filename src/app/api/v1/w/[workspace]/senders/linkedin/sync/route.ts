import { apiHandler } from "@/server/api/handler";
import { syncLinkedInAccounts } from "@/server/modules/senders/service";

export const POST = apiHandler({ allowApiKey: false, rateLimit: { limit: 20, windowSec: 600 } }, async ({ ctx }) => syncLinkedInAccounts(ctx));
