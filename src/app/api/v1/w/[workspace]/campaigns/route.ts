import { apiHandler } from "@/server/api/handler";
import { campaignInput, createCampaign, listCampaigns } from "@/server/modules/campaigns/service";

export const GET = apiHandler({}, async ({ ctx }) => ({ campaigns: await listCampaigns(ctx) }));

export const POST = apiHandler({ body: campaignInput }, async ({ ctx, body }) => {
  const campaign = await createCampaign(ctx, body);
  return Response.json({ campaign }, { status: 201 });
});
