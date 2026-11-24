import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { createLinkedInConnectLink } from "@/server/modules/senders/service";

export const POST = apiHandler({ body: z.object({ integrationId: z.string().uuid().optional() }), allowApiKey: false }, async ({ ctx, body }) => createLinkedInConnectLink(ctx, body));
