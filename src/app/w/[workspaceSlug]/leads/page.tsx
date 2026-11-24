import Link from "next/link";
import { Users, Search, Upload, Download, History } from "lucide-react";
import { requireWorkspaceContext } from "@/server/auth/context";
import { leadListQuery, listLeads } from "@/server/modules/leads/service";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeadFilters } from "./lead-filters";
import { formatDistanceToNow } from "date-fns";

export const metadata = { title: "Leads" };

export default async function LeadsPage(props: PageProps<"/w/[workspaceSlug]/leads">) {
  const { workspaceSlug } = await props.params;
  const sp = await props.searchParams;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const query = leadListQuery.parse({ q: sp.q, status: sp.status, stage: sp.stage, sourceKind: sp.source, cursor: sp.cursor, limit: 50 });
  const page = await listLeads(ctx, query);
  const base = `/w/${workspaceSlug}/leads`;
  const hasFilters = Boolean(query.q || query.status || query.stage || query.sourceKind);
  const exportQs = new URLSearchParams(Object.entries({ q: query.q, status: query.status, stage: query.stage, sourceKind: query.sourceKind }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Leads"
        description="One record per person. Sources, enrichment, scores and conversations all hang off it."
        actions={
          <>
            <Button variant="outline" render={<Link href={`${base}/searches`} />} nativeButton={false}>
              <History className="size-4" /> Searches
            </Button>
            <Button variant="outline" render={<Link href={`${base}/import`} />} nativeButton={false}>
              <Upload className="size-4" /> Import CSV
            </Button>
            <Button variant="outline" render={<a href={`/api/v1/w/${workspaceSlug}/leads/export?${exportQs}`} />} nativeButton={false}>
              <Download className="size-4" /> Export
            </Button>
            <Button render={<Link href={`${base}/searches/new`} />} nativeButton={false}>
              <Search className="size-4" /> Find leads
            </Button>
          </>
        }
      />
      <LeadFilters base={base} initial={{ q: query.q ?? "", status: query.status ?? "", stage: query.stage ?? "", source: query.sourceKind ?? "" }} />
      {page.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasFilters ? "No leads match these filters" : "No leads yet"}
          description={hasFilters ? "Try clearing a filter." : "Run a search against your ICP with a connected data provider, or import a CSV you already have."}
          action={
            !hasFilters && (
              <>
                <Button render={<Link href={`${base}/searches/new`} />} nativeButton={false}>
                  Find leads
                </Button>
                <Button variant="outline" render={<Link href={`${base}/import`} />} nativeButton={false}>
                  Import CSV
                </Button>
              </>
            )
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fit</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((l) => {
                const fit = l.scores.find((s) => s.kind === "icp_fit")?.score;
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link href={`${base}/${l.id}`} className="font-medium hover:underline">
                        {l.contact.fullName}
                      </Link>
                      <div className="text-xs text-muted-foreground">{l.contact.title ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{l.account?.name ?? l.contact.companyNameRaw ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{[l.account?.industry, l.account?.headcount ? `${l.account.headcount} employees` : null].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {l.contact.email && <Badge variant="outline">email{l.contact.emailStatus === "valid" ? " ✓" : ""}</Badge>}
                        {l.contact.linkedinUrl && <Badge variant="outline">linkedin</Badge>}
                        {l.contact.xHandle && <Badge variant="outline">x</Badge>}
                        {!l.contact.email && !l.contact.linkedinUrl && !l.contact.xHandle && <span className="text-muted-foreground">none</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{l.status.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{fit !== undefined ? `${fit}/100` : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(l.createdAt, { addSuffix: true })}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {page.nextCursor && (
            <div className="border-t p-3 text-center">
              <Button variant="ghost" size="sm" render={<Link href={`${base}?${new URLSearchParams({ ...(sp as Record<string, string>), cursor: page.nextCursor }).toString()}`} />} nativeButton={false}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
