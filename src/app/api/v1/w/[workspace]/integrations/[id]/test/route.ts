import { apiHandler } from "@/server/api/handler";
import { testIntegration } from "@/server/modules/integrations/service";

export const POST = apiHandler({ allowApiKey: false, rateLimit: { limit: 30, windowSec: 60 } }, async ({ ctx, params }) => {
  return { result: await testIntegration(ctx, params.id) };
});
