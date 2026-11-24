import { apiHandler } from "@/server/api/handler";
import { createSearch, createSearchInput, listProvidersForSearch, listSearches } from "@/server/modules/discovery/service";

export const GET = apiHandler({}, async ({ ctx }) => ({ searches: await listSearches(ctx), providers: await listProvidersForSearch(ctx).catch(() => []) }));

export const POST = apiHandler({ body: createSearchInput }, async ({ ctx, body }) => {
  const search = await createSearch(ctx, body);
  return Response.json({ search }, { status: 201 });
});
