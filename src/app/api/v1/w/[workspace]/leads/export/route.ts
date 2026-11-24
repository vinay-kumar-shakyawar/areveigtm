import { apiHandler } from "@/server/api/handler";
import { exportLeadsCsv, leadListQuery } from "@/server/modules/leads/service";

export const GET = apiHandler({ query: leadListQuery, rateLimit: { limit: 10, windowSec: 60 } }, async ({ ctx, query }) => {
  const csv = await exportLeadsCsv(ctx, query);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` } });
});
