import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { ApiError } from "@/server/api/errors";
import { requirePermission } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { ingestInboundEmail } from "@/server/modules/inbound/service";

/**
 * Development-only helper: simulate an inbound email reply from a known lead so
 * the inbox can be exercised without a live mailbox. Disabled in production.
 */
export const POST = apiHandler({ body: z.object({ leadId: z.string().uuid(), text: z.string().min(1).max(4000), subject: z.string().max(200).optional() }), allowApiKey: false }, async ({ ctx, body }) => {
  if (process.env.NODE_ENV === "production") throw ApiError.notFound("route");
  requirePermission(ctx, "inbox.decide");
  const lead = await prisma.lead.findFirst({ where: { id: body.leadId, workspaceId: ctx.workspaceId }, include: { contact: true } });
  if (!lead?.contact.email) throw ApiError.invalid("Lead has no email address");
  const sender = await prisma.senderAccount.findFirst({ where: { workspaceId: ctx.workspaceId, channel: "email", provider: "mock" }, include: { mailbox: true } });
  const last = await prisma.message.findFirst({ where: { workspaceId: ctx.workspaceId, leadId: lead.id, direction: "outbound", channel: "email", status: { in: ["sent", "delivered"] } }, orderBy: { sentAt: "desc" } });
  const result = await ingestInboundEmail(ctx.workspaceId, { senderAccountId: sender?.id ?? null, mailboxAddress: sender?.mailbox?.emailAddress ?? null }, {
    providerMessageId: `<simulated-${Date.now()}@${lead.contact.email.split("@")[1]}>`,
    inReplyTo: last?.providerMessageId ?? undefined,
    from: { email: lead.contact.email, name: lead.contact.fullName },
    to: [sender?.mailbox?.emailAddress ?? "sales@example.test"],
    subject: body.subject ?? (last?.subject ? `Re: ${last.subject}` : "Re: your note"),
    text: body.text,
    receivedAt: new Date().toISOString(),
  });
  return { result, simulated: true };
});
