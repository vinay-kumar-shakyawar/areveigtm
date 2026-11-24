import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { sequenceInput } from "@/server/modules/sequences/schemas";
import { approveSequence, getSequence, saveAsNewSequence, setSequenceStatus, updateSequence } from "@/server/modules/sequences/service";
import { previewMessage } from "@/server/modules/messaging/service";

export const GET = apiHandler({}, async ({ ctx, params }) => ({ sequence: await getSequence(ctx, params.id) }));

export const PUT = apiHandler({ body: sequenceInput.extend({ expectedRevision: z.number().int().min(1) }) }, async ({ ctx, params, body }) => {
  const { expectedRevision, ...input } = body;
  return { sequence: await updateSequence(ctx, params.id, input, expectedRevision) };
});

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), expectedRevision: z.number().int().min(1) }),
  z.object({ action: z.literal("status"), status: z.enum(["active", "paused", "draft", "archived"]) }),
  z.object({ action: z.literal("fork") }).merge(sequenceInput),
  z.object({ action: z.literal("preview"), campaignLeadId: z.string().uuid(), stepIndex: z.number().int().min(0).max(29) }),
]);

export const POST = apiHandler({ body: action, rateLimit: { limit: 60, windowSec: 60 } }, async ({ ctx, params, body }) => {
  switch (body.action) {
    case "approve":
      return { sequence: await approveSequence(ctx, params.id, body.expectedRevision) };
    case "status":
      return { sequence: await setSequenceStatus(ctx, params.id, body.status) };
    case "fork": {
      const input = { ...body, action: undefined };
      return { sequence: await saveAsNewSequence(ctx, params.id, sequenceInput.parse(input)) };
    }
    case "preview":
      return { message: await previewMessage(ctx, body.campaignLeadId, body.stepIndex) };
  }
});
