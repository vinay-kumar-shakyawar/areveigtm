import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { requestEnrichment, verifyField } from "@/server/modules/enrichment/service";
import { requestResearch } from "@/server/modules/intelligence/service";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enrich") }),
  z.object({ action: z.literal("research"), fetchWebsite: z.boolean().optional() }),
  z.object({ action: z.literal("verify_field"), field: z.enum(["email", "phone", "title", "linkedinUrl", "xHandle", "location", "country", "headline"]), state: z.enum(["verified", "invalid"]) }),
]);

export const POST = apiHandler({ body, rateLimit: { limit: 60, windowSec: 60 } }, async ({ ctx, params, body }) => {
  switch (body.action) {
    case "enrich":
      return { job: await requestEnrichment(ctx, params.id) };
    case "research":
      return { job: await requestResearch(ctx, params.id, { fetchWebsite: body.fetchWebsite }) };
    case "verify_field":
      await verifyField(ctx, params.id, body.field, body.state);
      return { ok: true };
  }
});
