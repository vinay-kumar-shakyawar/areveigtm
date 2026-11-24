import { Webhook } from "lucide-react";
import { requireWorkspaceContext } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { listSubscriptions, WEBHOOK_EVENTS } from "@/server/modules/webhooks/service";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { WebhooksPanel } from "./webhooks-panel";

export const metadata = { title: "Webhooks" };

export default async function WebhooksPage(props: PageProps<"/w/[workspaceSlug]/settings/webhooks">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  if (!can(ctx.role, "webhooks.manage")) {
    return (
      <>
        <PageHeader title="Webhooks" />
        <EmptyState icon={Webhook} title="Admins only" description="Ask a workspace admin to manage webhook endpoints." />
      </>
    );
  }
  const subscriptions = await listSubscriptions(ctx);
  return (
    <>
      <PageHeader title="Webhooks" description="Signed HTTPS notifications for replies, sends, bounces, unsubscribes and meetings." />
      <WebhooksPanel slug={workspaceSlug} events={WEBHOOK_EVENTS} subscriptions={subscriptions.map((s) => ({ ...s, disabledAt: s.disabledAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() }))} />
    </>
  );
}
