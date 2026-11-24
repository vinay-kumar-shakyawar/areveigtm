import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { sequenceInput } from "@/server/modules/sequences/schemas";
import { createSequence, DEFAULT_TEMPLATES, listSequences } from "@/server/modules/sequences/service";

export const GET = apiHandler({ query: z.object({ campaignId: z.string().uuid().optional(), templates: z.enum(["true", "false"]).optional() }) }, async ({ ctx, query }) => ({
  sequences: await listSequences(ctx, { campaignId: query.campaignId, templatesOnly: query.templates === "true" }),
  defaultTemplates: DEFAULT_TEMPLATES,
}));

export const POST = apiHandler({ body: sequenceInput.extend({ campaignId: z.string().uuid().nullable().optional() }) }, async ({ ctx, body }) => {
  const { campaignId, ...input } = body;
  const sequence = await createSequence(ctx, campaignId ?? null, input);
  return Response.json({ sequence }, { status: 201 });
});
