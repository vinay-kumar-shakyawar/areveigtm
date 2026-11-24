import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { listPendingMessages } from "@/server/modules/messaging/service";

export const GET = apiHandler({ query: z.object({ campaignId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }) }, async ({ ctx, query }) => ({
  messages: await listPendingMessages(ctx, { campaignId: query.campaignId, limit: query.limit }),
}));
