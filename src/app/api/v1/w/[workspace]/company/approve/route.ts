import { apiHandler } from "@/server/api/handler";
import { approveCompanyProfile } from "@/server/modules/company/service";

export const POST = apiHandler({}, async ({ ctx }) => ({ profile: await approveCompanyProfile(ctx) }));
