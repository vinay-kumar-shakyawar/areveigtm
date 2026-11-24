import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { companyProfileInput } from "@/server/modules/company/schemas";
import { getCompanyProfile, updateCompanyProfile } from "@/server/modules/company/service";

export const GET = apiHandler({}, async ({ ctx }) => ({ profile: await getCompanyProfile(ctx) }));

export const PATCH = apiHandler({ body: companyProfileInput.extend({ expectedRevision: z.number().int().optional() }) }, async ({ ctx, body }) => {
  const { expectedRevision, ...input } = body;
  return { profile: await updateCompanyProfile(ctx, input, { expectedRevision }) };
});
