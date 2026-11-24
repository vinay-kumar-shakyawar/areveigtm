import Link from "next/link";
import { Target, Plus } from "lucide-react";
import { requireWorkspaceContext } from "@/server/auth/context";
import { listIcps, summarizeCriteria } from "@/server/modules/icp/service";
import type { IcpCriteriaV1 } from "@/server/modules/icp/schemas";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IcpRowActions } from "./icp-row-actions";
import { formatDistanceToNow } from "date-fns";

export const metadata = { title: "ICPs" };

export default async function IcpsPage(props: PageProps<"/w/[workspaceSlug]/icps">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const icps = await listIcps(ctx);
  const base = `/w/${workspaceSlug}/icps`;
  return (
    <>
      <PageHeader
        title="Ideal customer profiles"
        description="Describe who you sell to in plain language. We turn it into structured criteria that drive search, scoring and messaging."
        actions={
          <Button render={<Link href={`${base}/new`} />} nativeButton={false}>
            <Plus className="size-4" /> New ICP
          </Button>
        }
      />
      {icps.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No ICP yet"
          description="Start with a sentence like “Founders and heads of marketing at D2C ecommerce companies in the UAE with 10–100 employees”."
          action={
            <Button render={<Link href={`${base}/new`} />} nativeButton={false}>
              Create your first ICP
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Criteria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {icps.map((icp) => (
                <TableRow key={icp.id}>
                  <TableCell>
                    <Link href={`${base}/${icp.id}`} className="font-medium hover:underline">
                      {icp.name}
                    </Link>
                    {icp.isDefault && (
                      <Badge variant="secondary" className="ml-2">
                        default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">{summarizeCriteria(icp.criteria as IcpCriteriaV1)}</TableCell>
                  <TableCell>
                    <Badge variant={icp.status === "active" ? "default" : "outline"}>{icp.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{icp._count.leads}</TableCell>
                  <TableCell className="text-right tabular-nums">{icp._count.campaigns}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(icp.updatedAt, { addSuffix: true })}</TableCell>
                  <TableCell className="text-right">
                    <IcpRowActions slug={workspaceSlug} id={icp.id} status={icp.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
