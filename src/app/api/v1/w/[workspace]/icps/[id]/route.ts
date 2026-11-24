import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { icpInput } from "@/server/modules/icp/schemas";
import { deleteIcp, duplicateIcp, getIcp, setIcpStatus, updateIcp } from "@/server/modules/icp/service";

export const GET = apiHandler({}, async ({ ctx, params }) => ({ icp: await getIcp(ctx, params.id) }));

export const PATCH = apiHandler({ body: icpInput.partial().extend({ expectedRevision: z.number().int().optional() }) }, async ({ ctx, params, body }) => {
  const { expectedRevision, ...input } = body;
  return { icp: await updateIcp(ctx, params.id, input, expectedRevision) };
});

export const POST = apiHandler({ body: z.object({ action: z.enum(["duplicate", "activate", "archive", "draft"]) }) }, async ({ ctx, params, body }) => {
  if (body.action === "duplicate") return { icp: await duplicateIcp(ctx, params.id) };
  const status = body.action === "activate" ? "active" : body.action === "archive" ? "archived" : "draft";
  return { icp: await setIcpStatus(ctx, params.id, status) };
});

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteIcp(ctx, params.id);
  return { ok: true };
});
