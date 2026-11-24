import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { icpInput } from "@/server/modules/icp/schemas";
import { createIcp, extractIcpFromDescription, listIcps } from "@/server/modules/icp/service";

export const GET = apiHandler({}, async ({ ctx }) => ({ icps: await listIcps(ctx) }));

export const POST = apiHandler({ body: icpInput }, async ({ ctx, body }) => {
  const icp = await createIcp(ctx, body);
  return Response.json({ icp }, { status: 201 });
});

/** Plain language → criteria (does not save). */
export const PUT = apiHandler(
  { body: z.object({ description: z.string().trim().min(10).max(2000), existing: z.unknown().optional() }), rateLimit: { limit: 20, windowSec: 60 } },
  async ({ ctx, body }) => {
    return { extraction: await extractIcpFromDescription(ctx, body.description, body.existing as never) };
  },
);
