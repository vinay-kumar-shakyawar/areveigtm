import { apiHandler } from "@/server/api/handler";
import { deleteLead, getLead, updateLead, updateLeadInput } from "@/server/modules/leads/service";

export const GET = apiHandler({}, async ({ ctx, params }) => ({ lead: await getLead(ctx, params.id) }));

export const PATCH = apiHandler({ body: updateLeadInput }, async ({ ctx, params, body }) => ({ lead: await updateLead(ctx, params.id, body) }));

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteLead(ctx, params.id);
  return { ok: true };
});
