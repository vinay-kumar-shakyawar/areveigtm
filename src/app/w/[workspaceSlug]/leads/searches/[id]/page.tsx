import { requireWorkspaceContext } from "@/server/auth/context";
import { getSearch, getSearchResults } from "@/server/modules/discovery/service";
import type { PersonRecord } from "@/server/providers/types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { ReviewBatch } from "./review-batch";

export default async function SearchReviewPage(props: PageProps<"/w/[workspaceSlug]/leads/searches/[id]">) {
  const { workspaceSlug, id } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const [search, results] = await Promise.all([getSearch(ctx, id), getSearchResults(ctx, id)]);
  const preview = (search.preview as { totalEstimate?: number | null } | null) ?? null;
  return (
    <>
      <PageHeader
        title={search.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={search.status === "completed" ? "default" : search.status === "failed" ? "destructive" : "outline"}>{search.status}</Badge>
            <span>{search.provider}</span>
            {search.icpProfile && <span>· ICP {search.icpProfile.name}</span>}
            <span>· requested {search.requestedCount}</span>
            {preview?.totalEstimate != null && <span>· provider estimate {preview.totalEstimate}</span>}
            <span>· {search.resultCount} returned</span>
            {search.duplicateCount > 0 && <span>· {search.duplicateCount} already known</span>}
            {search.importedCount > 0 && <span>· {search.importedCount} imported</span>}
          </span>
        }
      />
      {search.status === "failed" && <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{(search.error as { message?: string } | null)?.message ?? "The search failed."}</p>}
      <ReviewBatch
        slug={workspaceSlug}
        searchId={id}
        status={search.status}
        results={results.map((r) => ({
          id: r.id,
          decision: r.decision,
          matchReason: r.matchReason,
          duplicate: Boolean(r.duplicateOfContactId),
          imported: Boolean(r.contactId) && !r.duplicateOfContactId,
          person: r.person as unknown as PersonRecord,
        }))}
      />
    </>
  );
}
