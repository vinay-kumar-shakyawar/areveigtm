import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { regenerateDraft } from "@/server/modules/inbox/service";

export const POST = apiHandler({ body: z.object({ instructions: z.string().max(500).optional() }), rateLimit: { limit: 60, windowSec: 600 } }, async ({ ctx, body, params }) => ({ draft: await regenerateDraft(ctx, params.id, body.instructions) }));
