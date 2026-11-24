import { requireWorkspaceContext } from "@/server/auth/context";
import { getIcp } from "@/server/modules/icp/service";
import type { IcpCriteriaV1 } from "@/server/modules/icp/schemas";
import { PageHeader } from "@/components/app/page-header";
import { IcpEditor } from "../icp-editor";

export default async function EditIcpPage(props: PageProps<"/w/[workspaceSlug]/icps/[id]">) {
  const { workspaceSlug, id } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const icp = await getIcp(ctx, id);
  return (
    <>
      <PageHeader title={icp.name} description={`${icp.status} · revision ${icp.revision}`} />
      <IcpEditor
        slug={workspaceSlug}
        existing={{
          id: icp.id,
          name: icp.name,
          description: icp.description ?? "",
          criteria: icp.criteria as IcpCriteriaV1,
          status: icp.status,
          isDefault: icp.isDefault,
          revision: icp.revision,
          rationale: (icp.aiRationale as { rationale?: string } | null)?.rationale ?? null,
        }}
      />
    </>
  );
}
