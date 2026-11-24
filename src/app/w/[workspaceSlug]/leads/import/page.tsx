import { requireWorkspaceContext } from "@/server/auth/context";
import { PageHeader } from "@/components/app/page-header";
import { CsvImporter } from "./csv-importer";

export const metadata = { title: "Import leads" };

export default async function ImportPage(props: PageProps<"/w/[workspaceSlug]/leads/import">) {
  const { workspaceSlug } = await props.params;
  await requireWorkspaceContext(workspaceSlug);
  return (
    <>
      <PageHeader title="Import a CSV" description="Upload a list you already have. Map the columns, then import. People already in the workspace are merged by email, LinkedIn URL or X handle." />
      <CsvImporter slug={workspaceSlug} />
    </>
  );
}
