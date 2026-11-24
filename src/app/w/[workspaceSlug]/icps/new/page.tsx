import { requireWorkspaceContext } from "@/server/auth/context";
import { PageHeader } from "@/components/app/page-header";
import { IcpEditor } from "../icp-editor";

export const metadata = { title: "New ICP" };

export default async function NewIcpPage(props: PageProps<"/w/[workspaceSlug]/icps/new">) {
  const { workspaceSlug } = await props.params;
  await requireWorkspaceContext(workspaceSlug);
  return (
    <>
      <PageHeader title="New ideal customer profile" description="Describe the customer, let AI draft the criteria, then refine by hand." />
      <IcpEditor slug={workspaceSlug} />
    </>
  );
}
