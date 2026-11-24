import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { registerLinkedInWebhooks } from "@/server/modules/senders/service";

export const POST = apiHandler({ body: z.object({ integrationId: z.string().uuid().optional() }), allowApiKey: false, rateLimit: { limit: 10, windowSec: 600 } }, async ({ ctx, body }) => registerLinkedInWebhooks(ctx, body));
