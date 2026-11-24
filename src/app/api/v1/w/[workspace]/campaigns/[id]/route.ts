import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { campaignInput, campaignStats, enrollInput, enrollLeads, getCampaign, listEnrollments, setCampaignStatus, stopEnrollment, updateCampaign } from "@/server/modules/campaigns/service";
import { requestTick } from "@/server/modules/execution/service";

export const GET = apiHandler({}, async ({ ctx, params }) => {
  const [campaign, stats, enrollments] = await Promise.all([getCampaign(ctx, params.id), campaignStats(ctx, params.id), listEnrollments(ctx, params.id)]);
  return { campaign, stats, enrollments };
});

export const PATCH = apiHandler({ body: campaignInput.partial() }, async ({ ctx, params, body }) => ({ campaign: await updateCampaign(ctx, params.id, body) }));

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["active", "paused", "completed", "archived", "draft"]) }),
  z.object({ action: z.literal("enroll") }).merge(enrollInput),
  z.object({ action: z.literal("stop"), campaignLeadId: z.string().uuid(), reason: z.enum(["manual", "not_interested", "disqualified"]).default("manual") }),
  z.object({ action: z.literal("run_now") }),
]);

export const POST = apiHandler({ body: action }, async ({ ctx, params, body }) => {
  switch (body.action) {
    case "status":
      return { campaign: await setCampaignStatus(ctx, params.id, body.status) };
    case "enroll":
      return { result: await enrollLeads(ctx, params.id, { leadIds: body.leadIds, sequenceId: body.sequenceId, senderAccountId: body.senderAccountId }) };
    case "stop":
      return { enrollment: await stopEnrollment(ctx, body.campaignLeadId, body.reason) };
    case "run_now":
      return { job: await requestTick(ctx) };
  }
});
