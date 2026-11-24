import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { listSignals, manualSignalInput, recordManualSignal, requestSignalSync, signalListQuery } from "@/server/modules/signals/service";

export const GET = apiHandler({ query: signalListQuery }, async ({ ctx, query }) => listSignals(ctx, query));

export const POST = apiHandler(
  { body: z.discriminatedUnion("action", [z.object({ action: z.literal("record") }).merge(manualSignalInput), z.object({ action: z.literal("sync"), roles: z.array(z.string()).optional(), sinceDays: z.number().int().min(1).max(365).optional() })]) },
  async ({ ctx, body }) => {
    if (body.action === "sync") return { job: await requestSignalSync(ctx, { roles: body.roles, sinceDays: body.sinceDays }) };
    const input = { ...body, action: undefined };
    return Response.json({ signal: await recordManualSignal(ctx, input) }, { status: 201 });
  },
);
