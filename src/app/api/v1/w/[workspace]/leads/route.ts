import { apiHandler } from "@/server/api/handler";
import { csvImportInput, importCsv, leadListQuery, listLeads } from "@/server/modules/leads/service";
import { withIdempotency } from "@/server/api/idempotency";

export const GET = apiHandler({ query: leadListQuery }, async ({ ctx, query }) => listLeads(ctx, query));

/** CSV / API import of supplied contacts. */
export const POST = apiHandler({ body: csvImportInput }, async ({ ctx, body }) => {
  const { result, replayed } = await withIdempotency(ctx, "leads.import", body.requestId, body, () => importCsv(ctx, body));
  return Response.json({ batch: result, replayed }, { status: replayed ? 200 : 201 });
});
