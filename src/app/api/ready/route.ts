import { prisma } from "@/server/db/client";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: "up" });
  } catch {
    return Response.json({ ok: false, database: "down" }, { status: 503 });
  }
}
