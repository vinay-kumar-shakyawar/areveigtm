import { requireWorkspaceContext } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText } from "lucide-react";
import { format } from "date-fns";

export default async function AuditPage(props: PageProps<"/w/[workspaceSlug]/settings/audit">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  if (!can(ctx.role, "audit.read")) {
    return (
      <>
        <PageHeader title="Audit log" />
        <EmptyState icon={ScrollText} title="Admins only" description="The audit log is visible to owners and admins." />
      </>
    );
  }
  const rows = await prisma.auditLog.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { email: true, name: true } } },
  });
  return (
    <>
      <PageHeader title="Audit log" description="Who changed what. Secrets are never recorded here." />
      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No entries yet" />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{format(r.createdAt, "yyyy-MM-dd HH:mm")}</TableCell>
                  <TableCell className="text-sm">{r.actor?.name ?? r.actor?.email ?? r.actorType}</TableCell>
                  <TableCell className="text-sm font-medium">{r.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.targetType ? `${r.targetType}${r.targetId ? ` · ${r.targetId.slice(0, 8)}` : ""}` : ""}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{r.metadata ? JSON.stringify(r.metadata) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
