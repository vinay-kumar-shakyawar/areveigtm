import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { requireWorkspaceContext } from "@/server/auth/context";
import { listCampaigns } from "@/server/modules/campaigns/service";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage(props: PageProps<"/w/[workspaceSlug]/campaigns">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const campaigns = await listCampaigns(ctx);
  const base = `/w/${workspaceSlug}/campaigns`;
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="A campaign is an audience plus a sequence. Messages are drafted per person and nothing sends until the sequence is approved and the campaign is active."
        actions={
          <Button render={<Link href={`${base}/new`} />} nativeButton={false}>
            <Plus className="size-4" /> New campaign
          </Button>
        }
      />
      {campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns yet" description="Create one from a template, add approved leads, review the AI drafts, then activate." action={<Button render={<Link href={`${base}/new`} />} nativeButton={false}>Create a campaign</Button>} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Awaiting review</TableHead>
                <TableHead className="text-right">Replied</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`${base}/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.icpProfile?.name ?? c.objective ?? ""}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "default" : c.status === "paused" ? "secondary" : "outline"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{c.channels.join(", ")}</TableCell>
                  <TableCell className="text-right tabular-nums">{c._count.campaignLeads}</TableCell>
                  <TableCell className="text-right tabular-nums">{(c.stats.active ?? 0) + (c.stats.queued ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.stats.waiting_approval ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.stats.replied ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(c.updatedAt, { addSuffix: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
