import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { requireWorkspaceContext } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage(props: PageProps<"/w/[workspaceSlug]">) {
  const { workspaceSlug } = await props.params;
  const { ctx, workspaceName } = await requireWorkspaceContext(workspaceSlug);
  const since = thirtyDaysAgo();
  const base = `/w/${workspaceSlug}`;

  const [leads, qualified, campaignsActive, sent, replies, meetings, profile, icps, integrations, senders, recent] = await Promise.all([
    prisma.lead.count({ where: { workspaceId: ctx.workspaceId } }),
    prisma.lead.count({ where: { workspaceId: ctx.workspaceId, status: { in: ["qualified", "meeting_booked"] } } }),
    prisma.campaign.count({ where: { workspaceId: ctx.workspaceId, status: "active" } }),
    prisma.activityEvent.count({ where: { workspaceId: ctx.workspaceId, action: "message.sent", outcome: "ok", occurredAt: { gte: since } } }),
    prisma.activityEvent.count({ where: { workspaceId: ctx.workspaceId, action: "reply.received", occurredAt: { gte: since } } }),
    prisma.activityEvent.count({ where: { workspaceId: ctx.workspaceId, action: "meeting.booked", occurredAt: { gte: since } } }),
    prisma.companyProfile.findUnique({ where: { workspaceId: ctx.workspaceId }, select: { approvedAt: true } }),
    prisma.icpProfile.count({ where: { workspaceId: ctx.workspaceId, status: { not: "archived" } } }),
    prisma.integration.groupBy({ by: ["category"], where: { workspaceId: ctx.workspaceId, enabled: true } }),
    prisma.senderAccount.count({ where: { workspaceId: ctx.workspaceId, status: "connected" } }),
    prisma.activityEvent.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { occurredAt: "desc" },
      take: 10,
      include: { lead: { include: { contact: { select: { fullName: true } } } }, campaign: { select: { name: true } } },
    }),
  ]);

  const hasLlm = integrations.some((i) => i.category === "llm");
  const hasData = integrations.some((i) => i.category === "people_data" || i.category === "company_data");
  const checklist = [
    { done: Boolean(profile?.approvedAt), label: "Approve your company profile", href: `${base}/company` },
    { done: hasLlm, label: "Connect an AI provider", href: `${base}/integrations` },
    { done: icps > 0, label: "Define an ideal customer profile", href: `${base}/icps` },
    { done: hasData, label: "Connect a lead data provider", href: `${base}/integrations` },
    { done: leads > 0, label: "Find and import your first leads", href: `${base}/leads` },
    { done: senders > 0, label: "Connect a sending account", href: `${base}/integrations/senders` },
    { done: campaignsActive > 0, label: "Launch a campaign", href: `${base}/campaigns` },
  ];
  const remaining = checklist.filter((c) => !c.done).length;

  return (
    <>
      <PageHeader title={`Welcome to ${workspaceName}`} description="Your pipeline at a glance. Figures cover the last 30 days unless stated." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Leads" value={leads} hint="all time" />
        <StatCard label="Qualified" value={qualified} hint="all time" />
        <StatCard label="Active campaigns" value={campaignsActive} />
        <StatCard label="Messages sent" value={sent} />
        <StatCard label="Replies" value={replies} hint={sent ? `${Math.round((replies / sent) * 100)}% of sent` : "no sends yet"} />
        <StatCard label="Meetings" value={meetings} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{remaining === 0 ? "Setup complete" : `Setup: ${checklist.length - remaining} of ${checklist.length} done`}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {checklist.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    {item.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-muted-foreground" />}
                    <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
                    {!item.done && <ArrowRight className="ml-auto size-4 text-muted-foreground" />}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <Button render={<Link href={`${base}/analytics`} />} nativeButton={false} variant="ghost" size="sm">
              Analytics
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing has happened yet. Activity appears here as you import leads and run campaigns.</p>
            ) : (
              <ul className="divide-y">
                {recent.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{humanAction(e.action)}</span>
                      {e.lead && <span className="text-muted-foreground"> · {e.lead.contact.fullName}</span>}
                      {e.campaign && <span className="text-muted-foreground"> · {e.campaign.name}</span>}
                      {e.outcome !== "ok" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{e.outcome}</span>}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(e.occurredAt, { addSuffix: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function thirtyDaysAgo(): Date {
  return new Date(Date.now() - 30 * 24 * 3600 * 1000);
}

function humanAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
