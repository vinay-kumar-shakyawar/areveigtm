import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspaceContext } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { listSenders } from "@/server/modules/senders/service";
import { listIntegrations } from "@/server/modules/integrations/service";
import { isConfigured } from "@/server/modules/senders/oauth";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SendersPanel } from "./senders-panel";

export const metadata = { title: "Sending accounts" };

export default async function SendersPage(props: PageProps<"/w/[workspaceSlug]/integrations/senders">) {
  const { workspaceSlug } = await props.params;
  const search = await props.searchParams;
  const { ctx, user } = await requireWorkspaceContext(workspaceSlug);
  const [senders, integrations] = await Promise.all([listSenders(ctx), listIntegrations(ctx)]);
  const emailIntegrations = integrations.filter((i) => (i.category === "email" || i.category === "mailbox") && i.enabled && i.provider !== "google" && i.provider !== "microsoft");
  const linkedinIntegrations = integrations.filter((i) => i.category === "linkedin" && i.enabled);
  return (
    <>
      <PageHeader
        title="Sending accounts"
        description="The identities your campaigns send from. Email senders bind a provider or mailbox to a from-address. LinkedIn and X accounts are connected only through authorized provider flows."
        actions={
          <Button variant="outline" render={<Link href={`/w/${workspaceSlug}/integrations`} />} nativeButton={false}>
            <ArrowLeft className="size-4" /> Integrations
          </Button>
        }
      />
      <SendersPanel
        slug={workspaceSlug}
        canManage={can(ctx.role, "senders.manage")}
        userEmail={user.email}
        appBaseUrl={env().APP_BASE_URL}
        flash={{ oauth: typeof search.oauth === "string" ? search.oauth : null, connected: search.connected === "1", error: typeof search.error === "string" ? search.error : null, linkedin: typeof search.linkedin === "string" ? search.linkedin : null }}
        oauth={{ google: isConfigured("google"), microsoft: isConfigured("microsoft"), x: isConfigured("x") }}
        emailIntegrations={emailIntegrations.map((i) => ({ id: i.id, provider: i.provider, label: i.label, category: i.category }))}
        linkedinIntegrations={linkedinIntegrations.map((i) => ({ id: i.id, provider: i.provider, label: i.label }))}
        senders={senders.map((s) => ({
          ...s,
          connectedAt: s.connectedAt?.toISOString() ?? null,
          lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
          mailbox: s.mailbox ? { ...s.mailbox, lastInboundSyncAt: s.mailbox.lastInboundSyncAt?.toISOString() ?? null } : null,
        }))}
      />
    </>
  );
}
