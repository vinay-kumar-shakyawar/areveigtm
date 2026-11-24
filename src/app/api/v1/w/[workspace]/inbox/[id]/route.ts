import { apiHandler } from "@/server/api/handler";
import { getConversation, updateConversation, updateConversationInput } from "@/server/modules/inbox/service";

export const GET = apiHandler({}, async ({ ctx, params }) => ({ conversation: await getConversation(ctx, params.id) }));

export const PATCH = apiHandler({ body: updateConversationInput }, async ({ ctx, body, params }) => ({ conversation: await updateConversation(ctx, params.id, body) }));
