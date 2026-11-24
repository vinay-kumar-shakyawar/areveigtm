import { requireWorkspaceContext } from "@/server/auth/context";
import { campaignStats, getCampaign, listEnrollments } from "@/server/modules/campaigns/service";
import { listPendingMessages } from "@/server/modules/messaging/service";
import { prisma } from "@/server/db/client";
import { can } from "@/server/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { CampaignDetail } from "./campaign-detail";
import type { StepInput } from "@/server/modules/sequences/schemas";
import { toStepInput } from "@/server/modules/sequences/service";

export default async function CampaignPage(props: PageProps<"/w/[workspaceSlug]/campaigns/[id]">) {
  const { workspaceSlug, id } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const [campaign, stats, enrollments, pending, tasks, senders] = await Promise.all([
    getCampaign(ctx, id),
    campaignStats(ctx, id),
    listEnrollments(ctx, id),
    listPendingMessages(ctx, { campaignId: id }),
    prisma.task.findMany({ where: { workspaceId: ctx.workspaceId, status: "open", campaignLead: { campaignId: id } }, include: { lead: { include: { contact: { select: { fullName: true, linkedinUrl: true, xHandle: true, email: true } } } } }, orderBy: { dueAt: "asc" } }),
    prisma.senderAccount.findMany({ where: { workspaceId: ctx.workspaceId, status: "connected" }, select: { id: true, channel: true, displayName: true, provider: true } }),
  ]);
  const sequence = campaign.sequences.find((s) => s.status !== "archived") ?? campaign.sequences[0] ?? null;
  return (
    <>
      <PageHeader
        title={campaign.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={campaign.status === "active" ? "default" : "outline"}>{campaign.status}</Badge>
            <span>{campaign.channels.join(" · ")}</span>
            {campaign.icpProfile && <span>· ICP {campaign.icpProfile.name}</span>}
            {campaign.objective && <span>· {campaign.objective}</span>}
          </span>
        }
      />
      <CampaignDetail
        slug={workspaceSlug}
        canActivate={can(ctx.role, "campaigns.activate")}
        campaign={{ id: campaign.id, name: campaign.name, status: campaign.status, channels: campaign.channels, approvalMode: campaign.approvalMode, icpProfileId: campaign.icpProfileId }}
        stats={stats}
        sequence={
          sequence
            ? { id: sequence.id, name: sequence.name, status: sequence.status, revision: sequence.revision, approvedRevision: sequence.approvedRevision, executionModel: sequence.executionModel as "linear" | "tracks", enrolled: sequence._count.campaignLeads, steps: sequence.steps.map(toStepInput) as StepInput[] }
            : null
        }
        enrollments={enrollments.map((e) => ({
          id: e.id,
          leadId: e.leadId,
          name: e.lead.contact.fullName,
          title: e.lead.contact.title,
          company: e.lead.account?.name ?? e.lead.contact.companyNameRaw,
          status: e.status,
          stopReason: e.stopReason,
          currentStepIndex: e.currentStepIndex,
          nextActionAt: e.nextActionAt?.toISOString() ?? null,
          runs: e.stepRuns.map((r) => ({ stepIndex: r.stepIndex, status: r.status, scheduledFor: r.scheduledFor.toISOString() })),
        }))}
        pending={pending.map((m) => ({ id: m.id, channel: m.channel, subject: m.subject, body: m.body, leadId: m.leadId, leadName: m.lead?.contact.fullName ?? "", leadTitle: m.lead?.contact.title ?? null, company: m.lead?.account?.name ?? m.lead?.contact.companyNameRaw ?? null, stepIndex: m.stepRuns[0]?.stepIndex ?? 0, aiMeta: m.aiMeta as { reasoning?: string; personalizationUsed?: string[]; risks?: string[]; provider?: string } | null, createdAt: m.createdAt.toISOString() }))}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title, instructions: t.instructions, leadId: t.leadId, leadName: t.lead?.contact.fullName ?? "", linkedinUrl: t.lead?.contact.linkedinUrl ?? null, xHandle: t.lead?.contact.xHandle ?? null, dueAt: t.dueAt?.toISOString() ?? null }))}
        senders={senders}
      />
    </>
  );
}
