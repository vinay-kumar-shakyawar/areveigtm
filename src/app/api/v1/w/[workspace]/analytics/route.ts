import { apiHandler } from "@/server/api/handler";
import { analyticsQuery, overview } from "@/server/modules/analytics/service";

export const GET = apiHandler({ query: analyticsQuery }, async ({ ctx, query }) => overview(ctx, query));
