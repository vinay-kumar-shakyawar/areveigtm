import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { prisma } from "@/server/db/client";
import { completeTask } from "@/server/modules/execution/service";
import { requirePermission } from "@/server/auth/context";

export const GET = apiHandler({ query: z.object({ status: z.enum(["open", "done", "cancelled"]).default("open") }) }, async ({ ctx, query }) => {
  requirePermission(ctx, "campaigns.read");
  const tasks = await prisma.task.findMany({
    where: { workspaceId: ctx.workspaceId, status: query.status },
    include: { lead: { include: { contact: { select: { fullName: true, linkedinUrl: true, xHandle: true, email: true } } } }, stepRun: { include: { message: { select: { subject: true, body: true, channel: true } } } } },
    orderBy: { dueAt: "asc" },
    take: 200,
  });
  return { tasks };
});

export const POST = apiHandler({ body: z.object({ taskId: z.string().uuid(), action: z.enum(["done", "cancel"]) }) }, async ({ ctx, body }) => {
  requirePermission(ctx, "campaigns.manage");
  if (body.action === "done") {
    await completeTask(ctx, body.taskId);
  } else {
    await prisma.task.updateMany({ where: { id: body.taskId, workspaceId: ctx.workspaceId }, data: { status: "cancelled" } });
  }
  return { ok: true };
});
