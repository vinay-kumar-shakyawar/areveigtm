import { apiHandler } from "@/server/api/handler";
import { inboxCounts, inboxQuery, listConversations } from "@/server/modules/inbox/service";

export const GET = apiHandler({ query: inboxQuery }, async ({ ctx, query }) => {
  const [conversations, counts] = await Promise.all([listConversations(ctx, query), inboxCounts(ctx)]);
  return { conversations, counts };
});
