import { apiHandler } from "@/server/api/handler";
import { deleteIntegration, updateIntegration, updateIntegrationInput } from "@/server/modules/integrations/service";

export const PATCH = apiHandler({ body: updateIntegrationInput, allowApiKey: false }, async ({ ctx, body, params }) => {
  return { integration: await updateIntegration(ctx, params.id, body) };
});

export const DELETE = apiHandler({ allowApiKey: false }, async ({ ctx, params }) => {
  await deleteIntegration(ctx, params.id);
  return { ok: true };
});
