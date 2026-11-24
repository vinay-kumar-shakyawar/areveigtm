import { apiHandler } from "@/server/api/handler";
import { deleteRule, ruleInput, updateRule } from "@/server/modules/signals/service";

export const PATCH = apiHandler({ body: ruleInput.partial() }, async ({ ctx, params, body }) => {
  await updateRule(ctx, params.id, body);
  return { ok: true };
});

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteRule(ctx, params.id);
  return { ok: true };
});
