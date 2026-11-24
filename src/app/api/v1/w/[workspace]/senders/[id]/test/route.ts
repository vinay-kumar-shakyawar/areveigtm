import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { sendTestEmail } from "@/server/modules/senders/service";

/** Sends one real test email. Explicit user action; rate limited. */
export const POST = apiHandler({ body: z.object({ to: z.string().email() }), allowApiKey: false, rateLimit: { limit: 10, windowSec: 600 } }, async ({ ctx, body, params }) => {
  return { result: await sendTestEmail(ctx, params.id, body.to) };
});
