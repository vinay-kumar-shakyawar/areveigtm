import Link from "next/link";
import { requireWorkspaceContext } from "@/server/auth/context";
import { listIcps } from "@/server/modules/icp/service";
import { criteriaFromIcp, listProvidersForSearch } from "@/server/modules/discovery/service";
import type { IcpCriteriaV1 } from "@/server/modules/icp/schemas";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Plug } from "lucide-react";
import { SearchWizard } from "./search-wizard";

export const metadata = { title: "Find leads" };

export default async function NewSearchPage(props: PageProps<"/w/[workspaceSlug]/leads/searches/new">) {
  const { workspaceSlug } = await props.params;
  const sp = await props.searchParams;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const [icps, providers] = await Promise.all([listIcps(ctx), listProvidersForSearch(ctx).catch(() => [])]);
  if (providers.length === 0) {
    return (
      <>
        <PageHeader title="Find leads" />
        <EmptyState
          icon={Plug}
          title="Connect a lead data provider first"
          description="Searches run against your own Hunter, Apollo or People Data Labs account. Add one under Integrations; in development you can use the mock provider."
          action={
            <Button render={<Link href={`/w/${workspaceSlug}/integrations`} />} nativeButton={false}>
              Go to Integrations
            </Button>
          }
        />
      </>
    );
  }
  const preselect = typeof sp.icp === "string" ? sp.icp : icps.find((i) => i.isDefault)?.id ?? icps[0]?.id ?? null;
  return (
    <>
      <PageHeader title="Find leads" description="Pick an ICP, adjust the filters, preview the estimate, then run. Nothing is imported until you review the results." />
      <SearchWizard
        slug={workspaceSlug}
        providers={providers}
        icps={icps.filter((i) => i.status !== "archived").map((i) => ({ id: i.id, name: i.name, criteria: criteriaFromIcp(i.criteria as IcpCriteriaV1) }))}
        preselectIcpId={preselect}
      />
    </>
  );
}
