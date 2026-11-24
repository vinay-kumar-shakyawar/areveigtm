import { requireWorkspaceContext } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { catalog, CATEGORY_LABELS, listIntegrations, usageSummary } from "@/server/modules/integrations/service";
import Link from "next/link";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { IntegrationsPanel } from "./integrations-panel";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage(props: PageProps<"/w/[workspaceSlug]/integrations">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const [integrations, usage] = await Promise.all([listIntegrations(ctx), usageSummary(ctx)]);
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Bring your own API keys. Credentials are encrypted at rest, never shown again after saving, and only used server-side. Add several providers per category to get automatic fallback."
        actions={
          <Button render={<Link href={`/w/${workspaceSlug}/integrations/senders`} />} nativeButton={false}>
            <Send className="size-4" /> Sending accounts
          </Button>
        }
      />
      <IntegrationsPanel
        slug={workspaceSlug}
        canManage={can(ctx.role, "integrations.manage")}
        catalog={catalog()}
        categoryLabels={CATEGORY_LABELS}
        integrations={integrations.map((i) => ({
          ...i,
          lastHealthCheckAt: i.lastHealthCheckAt?.toISOString() ?? null,
          createdAt: i.createdAt.toISOString(),
          updatedAt: i.updatedAt.toISOString(),
          credential: i.credential ? { ...i.credential, rotatedAt: i.credential.rotatedAt?.toISOString() ?? null, revokedAt: i.credential.revokedAt?.toISOString() ?? null, expiresAt: i.credential.expiresAt?.toISOString() ?? null } : null,
        }))}
        usage={usage}
      />
    </>
  );
}
