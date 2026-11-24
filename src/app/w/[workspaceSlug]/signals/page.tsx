import { requireWorkspaceContext } from "@/server/auth/context";
import { listRules, listSignals, signalListQuery } from "@/server/modules/signals/service";
import { listIcps } from "@/server/modules/icp/service";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/app/page-header";
import { SignalsPanel } from "./signals-panel";

export const metadata = { title: "Signals" };

export default async function SignalsPage(props: PageProps<"/w/[workspaceSlug]/signals">) {
  const { workspaceSlug } = await props.params;
  const sp = await props.searchParams;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const query = signalListQuery.parse({ eventType: sp.eventType, accountId: sp.accountId, inferred: sp.inferred, cursor: sp.cursor, limit: 100 });
  const [page, rules, icps, campaigns] = await Promise.all([
    listSignals(ctx, query),
    listRules(ctx),
    listIcps(ctx),
    prisma.campaign.findMany({ where: { workspaceId: ctx.workspaceId, status: { not: "archived" } }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Buying signals" description="Observed events come from providers or your team; inferred ones come from AI research and are always labelled. Rules decide what happens when a relevant signal appears." />
      <SignalsPanel
        slug={workspaceSlug}
        signals={page.items.map((s) => ({ id: s.id, eventType: s.eventType, title: s.title, occurredAt: s.occurredAt.toISOString(), url: s.url, source: s.source, provider: s.provider, isInferred: s.isInferred, confidence: s.confidence, relevanceScore: s.relevanceScore, evidence: s.evidence as Record<string, unknown> | null, account: s.account, contact: s.contact ? { id: s.contact.id, fullName: s.contact.fullName, leadId: s.contact.lead?.id ?? null } : null }))}
        rules={rules.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, match: r.match as { eventTypes?: string[]; minRelevance?: number; includeInferred?: boolean }, action: r.action, campaign: r.campaign, icpProfile: r.icpProfile }))}
        icps={icps.map((i) => ({ id: i.id, name: i.name }))}
        campaigns={campaigns}
        filter={{ eventType: query.eventType ?? "", inferred: query.inferred ?? "" }}
      />
    </>
  );
}
