import { requireWorkspaceContext } from "@/server/auth/context";
import { listIcps } from "@/server/modules/icp/service";
import { DEFAULT_TEMPLATES } from "@/server/modules/sequences/service";
import { PageHeader } from "@/components/app/page-header";
import { NewCampaignForm } from "./new-campaign-form";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage(props: PageProps<"/w/[workspaceSlug]/campaigns/new">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const icps = await listIcps(ctx);
  return (
    <>
      <PageHeader title="New campaign" description="Name the objective, pick channels and a starting sequence. You can edit every step afterwards." />
      <NewCampaignForm slug={workspaceSlug} icps={icps.filter((i) => i.status !== "archived").map((i) => ({ id: i.id, name: i.name }))} templates={DEFAULT_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description }))} />
    </>
  );
}
