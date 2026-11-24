import { apiHandler } from "@/server/api/handler";
import { catalog, createIntegration, listIntegrations, upsertIntegrationInput, usageSummary } from "@/server/modules/integrations/service";

export const GET = apiHandler({}, async ({ ctx }) => {
  const [integrations, usage] = await Promise.all([listIntegrations(ctx), usageSummary(ctx)]);
  return { integrations, catalog: catalog(), usage };
});

export const POST = apiHandler({ body: upsertIntegrationInput, allowApiKey: false }, async ({ ctx, body }) => {
  const integration = await createIntegration(ctx, body);
  return Response.json({ integration }, { status: 201 });
});
