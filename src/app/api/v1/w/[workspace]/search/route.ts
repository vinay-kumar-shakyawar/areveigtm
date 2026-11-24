import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { prisma } from "@/server/db/client";

const PAGES = [
  { title: "Dashboard", href: "" },
  { title: "Company profile", href: "/company" },
  { title: "ICPs", href: "/icps" },
  { title: "Leads", href: "/leads" },
  { title: "Signals", href: "/signals" },
  { title: "Campaigns", href: "/campaigns" },
  { title: "Inbox", href: "/inbox" },
  { title: "Analytics", href: "/analytics" },
  { title: "Integrations", href: "/integrations" },
  { title: "Settings", href: "/settings" },
  { title: "Members", href: "/settings/members" },
  { title: "API keys", href: "/settings/api-keys" },
];

export const GET = apiHandler(
  { query: z.object({ q: z.string().trim().max(100).default("") }), rateLimit: { limit: 120, windowSec: 60 } },
  async ({ ctx, query }) => {
    const q = query.q;
    const base = `/w/${ctx.workspaceSlug}`;
    const pages = PAGES.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase())).map((p) => ({
      type: "page" as const,
      id: p.href || "dashboard",
      title: p.title,
      href: `${base}${p.href}`,
    }));
    if (!q) return { items: pages };
    const [leads, campaigns, icps] = await Promise.all([
      prisma.lead.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          contact: {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { companyNameRaw: { contains: q, mode: "insensitive" } },
            ],
          },
        },
        include: { contact: { select: { fullName: true, title: true, companyNameRaw: true } } },
        take: 8,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.campaign.findMany({
        where: { workspaceId: ctx.workspaceId, name: { contains: q, mode: "insensitive" } },
        take: 5,
        select: { id: true, name: true, status: true },
      }),
      prisma.icpProfile.findMany({
        where: { workspaceId: ctx.workspaceId, name: { contains: q, mode: "insensitive" } },
        take: 5,
        select: { id: true, name: true, status: true },
      }),
    ]);
    return {
      items: [
        ...pages,
        ...leads.map((l) => ({
          type: "lead" as const,
          id: l.id,
          title: l.contact.fullName,
          subtitle: [l.contact.title, l.contact.companyNameRaw].filter(Boolean).join(" · "),
          href: `${base}/leads/${l.id}`,
        })),
        ...campaigns.map((c) => ({ type: "campaign" as const, id: c.id, title: c.name, subtitle: c.status, href: `${base}/campaigns/${c.id}` })),
        ...icps.map((i) => ({ type: "icp" as const, id: i.id, title: i.name, subtitle: i.status, href: `${base}/icps/${i.id}` })),
      ],
    };
  },
);
