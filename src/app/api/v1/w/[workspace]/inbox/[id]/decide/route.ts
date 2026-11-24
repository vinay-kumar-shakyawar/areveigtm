import { apiHandler } from "@/server/api/handler";
import { decide, decisionInput } from "@/server/modules/inbox/service";

/** Human decision on a reply: send / edit and send / snooze / mark / meeting / booking link / start sequence / dismiss / opt out. */
export const POST = apiHandler({ body: decisionInput }, async ({ ctx, body, params }) => ({ result: await decide(ctx, params.id, body) }));
