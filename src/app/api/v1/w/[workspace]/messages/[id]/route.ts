import { apiHandler } from "@/server/api/handler";
import { reviewInput, reviewMessage } from "@/server/modules/messaging/service";

export const POST = apiHandler({ body: reviewInput }, async ({ ctx, params, body }) => ({ message: await reviewMessage(ctx, params.id, body) }));
