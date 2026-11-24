import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { applyDraft, draftFromWebsite } from "@/server/modules/company/service";

export const POST = apiHandler({ body: z.object({ website: z.string().min(3).max(300) }), rateLimit: { limit: 10, windowSec: 60 } }, async ({ ctx, body }) => {
  return draftFromWebsite(ctx, body.website);
});

export const PUT = apiHandler({ body: z.object({ fields: z.array(z.string()).optional() }) }, async ({ ctx, body }) => {
  return { profile: await applyDraft(ctx, body.fields as never) };
});
