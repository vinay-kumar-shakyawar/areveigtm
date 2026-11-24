import Link from "next/link";
import { Search, Plus } from "lucide-react";
import { requireWorkspaceContext } from "@/server/auth/context";
import { listSearches } from "@/server/modules/discovery/service";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

export const metadata = { title: "Lead searches" };

export default async function SearchesPage(props: PageProps<"/w/[workspaceSlug]/leads/searches">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const searches = await listSearches(ctx);
  const base = `/w/${workspaceSlug}/leads/searches`;
  return (
    <>
      <PageHeader
        title="Lead searches"
        description="Every search you ran, with its provider, results and what you imported. Saved searches can be run again."
        actions={
          <Button render={<Link href={`${base}/new`} />} nativeButton={false}>
            <Plus className="size-4" /> New search
          </Button>
        }
      />
      {searches.length === 0 ? (
        <EmptyState icon={Search} title="No searches yet" description="Searches pull people from your connected data provider based on an ICP." action={<Button render={<Link href={`${base}/new`} />} nativeButton={false}>Start a search</Button>} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Search</TableHead>
                <TableHead>ICP</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Found</TableHead>
                <TableHead className="text-right">Imported</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {searches.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`${base}/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    {s.savedAsName && (
                      <Badge variant="secondary" className="ml-2">
                        saved: {s.savedAsName}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{s.icpProfile?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{s.provider}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "completed" ? "default" : s.status === "failed" ? "destructive" : "outline"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.resultCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.importedCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(s.createdAt, { addSuffix: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
