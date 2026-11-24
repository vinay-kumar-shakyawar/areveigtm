import { apiHandler } from "@/server/api/handler";
import { rotateSecret } from "@/server/modules/webhooks/service";

export const POST = apiHandler({ allowApiKey: false }, async ({ ctx, params }) => rotateSecret(ctx, params.id));
