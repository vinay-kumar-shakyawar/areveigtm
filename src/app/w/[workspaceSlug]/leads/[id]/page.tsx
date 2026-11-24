import Link from "next/link";
import { requireWorkspaceContext } from "@/server/auth/context";
import { getLead } from "@/server/modules/leads/service";
import { listIcps } from "@/server/modules/icp/service";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { LeadProfile } from "./lead-profile";
import type { LeadResearchOutput } from "@/server/modules/intelligence/service";

export default async function LeadPage(props: PageProps<"/w/[workspaceSlug]/leads/[id]">) {
  const { workspaceSlug, id } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const [lead, icps, members] = await Promise.all([
    getLead(ctx, id),
    listIcps(ctx),
    prisma.workspaceMember.findMany({ where: { workspaceId: ctx.workspaceId }, include: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  const research = lead.research[0];
  return (
    <>
      <PageHeader
        title={lead.contact.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{lead.status.replace(/_/g, " ")}</Badge>
            <span>{lead.contact.title ?? "No title"}</span>
            {lead.account && (
              <span>
                at <span className="font-medium text-foreground">{lead.account.name}</span>
              </span>
            )}
            {lead.icpProfile && (
              <Link href={`/w/${workspaceSlug}/icps/${lead.icpProfile.id}`} className="underline">
                ICP: {lead.icpProfile.name}
              </Link>
            )}
          </span>
        }
      />
      <LeadProfile
        slug={workspaceSlug}
        lead={{
          id: lead.id,
          status: lead.status,
          stage: lead.stage,
          notes: lead.notes ?? "",
          ownerUserId: lead.ownerUserId,
          icpProfileId: lead.icpProfileId,
          createdAt: lead.createdAt.toISOString(),
          contact: {
            firstName: lead.contact.firstName ?? "",
            lastName: lead.contact.lastName ?? "",
            title: lead.contact.title ?? "",
            email: lead.contact.email ?? "",
            emailStatus: lead.contact.emailStatus,
            phone: lead.contact.phone ?? "",
            linkedinUrl: lead.contact.linkedinUrl ?? "",
            xHandle: lead.contact.xHandle ?? "",
            location: lead.contact.location ?? "",
            country: lead.contact.country ?? "",
            companyNameRaw: lead.contact.companyNameRaw ?? "",
            headline: lead.contact.headline ?? "",
            doNotContact: lead.contact.doNotContact,
          },
          account: lead.account
            ? { id: lead.account.id, name: lead.account.name, domain: lead.account.domain, industry: lead.account.industry, headcount: lead.account.headcount, location: lead.account.location, description: lead.account.description, technologies: lead.account.technologies, fundingStage: lead.account.fundingStage }
            : null,
          sources: lead.sources.map((s) => ({ id: s.id, kind: s.kind, provider: s.provider, occurredAt: s.occurredAt.toISOString(), evidence: s.evidence as Record<string, unknown> | null })),
          enrichments: lead.contact.enrichments.map((e) => ({ id: e.id, provider: e.provider, field: e.field, value: e.value, confidence: e.confidence, verificationState: e.verificationState, sourceUrl: e.sourceUrl, fetchedAt: e.fetchedAt.toISOString(), applied: Boolean(e.appliedAt) })),
          scores: lead.scores.map((s) => ({ kind: s.kind, score: s.score, explanation: s.explanation as { factors?: { factor: string; weight: number; evidence: string; contribution: number }[]; confidence?: number }, computedAt: s.computedAt.toISOString(), model: s.model })),
          research: research ? { summary: research.summary as unknown as LeadResearchOutput, sources: research.sources as { url: string; title: string | null }[] | null, computedAt: research.computedAt.toISOString(), provider: research.modelProvider, model: research.model } : null,
          signals: [...(lead.account?.signals ?? []), ...lead.contact.signals].map((s) => ({ id: s.id, eventType: s.eventType, title: s.title, occurredAt: s.occurredAt.toISOString(), url: s.url, isInferred: s.isInferred, relevanceScore: s.relevanceScore, source: s.source })),
          campaigns: lead.campaignLeads.map((cl) => ({ id: cl.id, campaign: cl.campaign, sequence: cl.sequence, status: cl.status, currentStepIndex: cl.currentStepIndex })),
          conversations: lead.conversations.map((c) => ({ id: c.id, channel: c.channel, status: c.status, lastMessageAt: c.lastMessageAt?.toISOString() ?? null })),
          activity: lead.activity.map((a) => ({ id: a.id, action: a.action, outcome: a.outcome, occurredAt: a.occurredAt.toISOString(), metadata: a.metadata as Record<string, unknown> | null })),
        }}
        icps={icps.map((i) => ({ id: i.id, name: i.name }))}
        members={members.map((m) => ({ id: m.user.id, name: m.user.name ?? m.user.email }))}
      />
    </>
  );
}
