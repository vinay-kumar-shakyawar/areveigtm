import { apiHandler } from "@/server/api/handler";
import { createRule, listRules, ruleInput } from "@/server/modules/signals/service";

export const GET = apiHandler({}, async ({ ctx }) => ({ rules: await listRules(ctx) }));

export const POST = apiHandler({ body: ruleInput }, async ({ ctx, body }) => {
  const rule = await createRule(ctx, body);
  return Response.json({ rule }, { status: 201 });
});
