import { apiHandler } from "@/server/api/handler";
import { createEmailSender, createEmailSenderInput, listSenders } from "@/server/modules/senders/service";

export const GET = apiHandler({}, async ({ ctx }) => ({ senders: await listSenders(ctx) }));

export const POST = apiHandler({ body: createEmailSenderInput, allowApiKey: false }, async ({ ctx, body }) => {
  const id = await createEmailSender(ctx, body);
  const senders = await listSenders(ctx);
  return Response.json({ sender: senders.find((s) => s.id === id) }, { status: 201 });
});
