import { apiHandler } from "@/server/api/handler";
import { deleteSender, listSenders, updateSender, updateSenderInput } from "@/server/modules/senders/service";

export const PATCH = apiHandler({ body: updateSenderInput, allowApiKey: false }, async ({ ctx, body, params }) => {
  await updateSender(ctx, params.id, body);
  const senders = await listSenders(ctx);
  return { sender: senders.find((s) => s.id === params.id) };
});

export const DELETE = apiHandler({ allowApiKey: false }, async ({ ctx, params }) => {
  await deleteSender(ctx, params.id);
  return { ok: true };
});
