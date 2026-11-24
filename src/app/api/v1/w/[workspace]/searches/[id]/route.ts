import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { requestIdSchema } from "@/server/api/idempotency";
import { decideResults, decisionsInput, duplicateSearch, getSearch, getSearchResults, importGoodFits, previewSearch, runSearch, saveSearchAs } from "@/server/modules/discovery/service";

export const GET = apiHandler({ query: z.object({ filter: z.enum(["all", "undecided", "good_fit", "not_a_fit"]).default("all") }) }, async ({ ctx, params, query }) => {
  const [search, results] = await Promise.all([getSearch(ctx, params.id), getSearchResults(ctx, params.id, query.filter)]);
  return { search, results };
});

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview") }),
  z.object({ action: z.literal("run"), requestId: requestIdSchema }),
  z.object({ action: z.literal("decide") }).merge(decisionsInput),
  z.object({ action: z.literal("import") }),
  z.object({ action: z.literal("save"), name: z.string().min(1).max(120) }),
  z.object({ action: z.literal("duplicate") }),
]);

export const POST = apiHandler({ body: action, rateLimit: { limit: 60, windowSec: 60 } }, async ({ ctx, params, body }) => {
  switch (body.action) {
    case "preview":
      return { search: await previewSearch(ctx, params.id) };
    case "run":
      return { search: await runSearch(ctx, params.id, body.requestId) };
    case "decide":
      return { result: await decideResults(ctx, params.id, { decisions: body.decisions, finish: body.finish }) };
    case "import":
      return { result: await importGoodFits(ctx, params.id) };
    case "save":
      return { search: await saveSearchAs(ctx, params.id, body.name) };
    case "duplicate":
      return { search: await duplicateSearch(ctx, params.id) };
  }
});
