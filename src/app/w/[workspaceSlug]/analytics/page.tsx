import { requireWorkspaceContext } from "@/server/auth/context";
import { overview } from "@/server/modules/analytics/service";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/app/page-header";
import { AnalyticsView } from "./analytics-view";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage(props: PageProps<"/w/[workspaceSlug]/analytics">) {
  const { workspaceSlug } = await props.params;
  const search = await props.searchParams;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const days = Number(search.days) > 0 ? Math.min(Number(search.days), 365) : 30;
  const campaignId = typeof search.campaignId === "string" && /^[0-9a-f-]{36}$/i.test(search.campaignId) ? search.campaignId : undefined;
  const [data, campaigns] = await Promise.all([
    overview(ctx, { days, campaignId }),
    prisma.campaign.findMany({ where: { workspaceId: ctx.workspaceId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return (
    <>
      <PageHeader title="Analytics" description="Every metric is computed from stored events with a documented denominator. Hover any ratio to see how it is defined." />
      <AnalyticsView slug={workspaceSlug} days={days} campaignId={campaignId ?? null} campaigns={campaigns} data={data} />
    </>
  );
}
