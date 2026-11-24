import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { prisma } from "@/server/db/client";

export const GET = apiHandler({}, async ({ ctx }) => {
  const where = { workspaceId: ctx.workspaceId, OR: [{ userId: null }, { userId: ctx.userId ?? "" }] };
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return { items, unread };
});

export const POST = apiHandler(
  { body: z.object({ all: z.boolean().optional(), ids: z.array(z.string().uuid()).optional() }) },
  async ({ ctx, body }) => {
    const where = { workspaceId: ctx.workspaceId, readAt: null, OR: [{ userId: null }, { userId: ctx.userId ?? "" }] };
    const res = await prisma.notification.updateMany({
      where: body.all ? where : { ...where, id: { in: body.ids ?? [] } },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  },
);
