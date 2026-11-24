"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Play, Pause, Zap, CheckCircle2, Users, ListChecks, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { SequenceEditor } from "./sequence-editor";
import { MessageQueue, type PendingMessage } from "./message-queue";
import { AddLeadsDialog } from "./add-leads-dialog";
import type { StepInput } from "@/server/modules/sequences/schemas";
import { formatDistanceToNow } from "date-fns";

export interface SequenceView {
  id: string;
  name: string;
  status: string;
  revision: number;
  approvedRevision: number | null;
  executionModel: "linear" | "tracks";
  enrolled: number;
  steps: StepInput[];
}

export function CampaignDetail({
  slug,
  canActivate,
  campaign,
  stats,
  sequence,
  enrollments,
  pending,
  tasks,
  senders,
}: {
  slug: string;
  canActivate: boolean;
  campaign: { id: string; name: string; status: string; channels: string[]; approvalMode: string; icpProfileId: string | null };
  stats: { byStatus: Record<string, number>; sent: number; replies: number; meetings: number; awaitingApproval: number };
  sequence: SequenceView | null;
  enrollments: { id: string; leadId: string; name: string; title: string | null; company: string | null; status: string; stopReason: string | null; currentStepIndex: number; nextActionAt: string | null; runs: { stepIndex: number; status: string; scheduledFor: string }[] }[];
  pending: PendingMessage[];
  tasks: { id: string; title: string; instructions: string | null; leadId: string | null; leadName: string; linkedinUrl: string | null; xHandle: string | null; dueAt: string | null }[];
  senders: { id: string; channel: string; displayName: string; provider: string }[];
}) {
  const router = useRouter();
  const [pendingTx, start] = useTransition();
  const [tab, setTab] = useState(sequence && sequence.approvedRevision === sequence.revision ? "audience" : "sequence");

  async function api(path: string, body: unknown, method = "POST") {
    const res = await fetch(`/api/v1/w/${slug}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
    return data;
  }
  const run = (label: string, fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
        if (label) toast.success(label);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });

  const approved = Boolean(sequence && sequence.approvedRevision === sequence.revision);
  const total = Object.values(stats.byStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {campaign.status !== "active" ? (
          <Button disabled={!canActivate || pendingTx || !approved} onClick={() => run("Campaign activated", () => api(`/campaigns/${campaign.id}`, { action: "status", status: "active" }))}>
            <Play className="size-4" /> Activate
          </Button>
        ) : (
          <Button variant="secondary" disabled={!canActivate || pendingTx} onClick={() => run("Campaign paused", () => api(`/campaigns/${campaign.id}`, { action: "status", status: "paused" }))}>
            <Pause className="size-4" /> Pause
          </Button>
        )}
        <Button variant="outline" disabled={pendingTx || campaign.status !== "active"} onClick={() => run("Scheduler ran", () => api(`/campaigns/${campaign.id}`, { action: "run_now" }))} title="Process due steps now instead of waiting for the next scheduler tick">
          <Zap className="size-4" /> Run due steps now
        </Button>
        {!approved && <span className="text-sm text-muted-foreground">Approve the sequence to enable activation.</span>}
        {campaign.status === "active" && stats.awaitingApproval > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {stats.awaitingApproval} message{stats.awaitingApproval === 1 ? "" : "s"} awaiting review
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="People" value={total} />
        <StatCard label="Active" value={(stats.byStatus.active ?? 0) + (stats.byStatus.queued ?? 0)} />
        <StatCard label="Awaiting review" value={stats.awaitingApproval} />
        <StatCard label="Sent" value={stats.sent} />
        <StatCard label="Replied" value={stats.replies} hint={stats.sent ? `${Math.round((stats.replies / stats.sent) * 100)}% of sent` : undefined} />
        <StatCard label="Meetings" value={stats.meetings} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="sequence">
            <ListChecks className="size-4" /> Sequence {sequence ? (approved ? "✓" : "(unapproved)") : ""}
          </TabsTrigger>
          <TabsTrigger value="audience">
            <Users className="size-4" /> Audience ({enrollments.length})
          </TabsTrigger>
          <TabsTrigger value="messages">
            <CheckCircle2 className="size-4" /> Review ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ClipboardList className="size-4" /> Manual tasks ({tasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sequence" className="mt-4">
          <SequenceEditor slug={slug} campaignId={campaign.id} channels={campaign.channels} sequence={sequence} canApprove={canActivate} />
        </TabsContent>

        <TabsContent value="audience" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {campaign.approvalMode === "approve_sequence_once" ? "AI drafts send without per-message review once the sequence is approved." : "Every AI draft waits for your approval under Review."}
            </p>
            <AddLeadsDialog slug={slug} campaignId={campaign.id} icpProfileId={campaign.icpProfileId} senders={senders.filter((s) => campaign.channels.includes(s.channel))} disabled={!sequence} onDone={() => router.refresh()} />
          </div>
          {enrollments.length === 0 ? (
            <EmptyState icon={Users} title="Nobody enrolled yet" description="Add approved leads. People already active in another campaign are skipped unless you allow concurrency in Settings." />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Next action</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link href={`/w/${slug}/leads/${e.leadId}`} className="font-medium hover:underline">
                          {e.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{[e.title, e.company].filter(Boolean).join(" · ")}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.status === "active" ? "default" : e.status === "stopped" ? "destructive" : "secondary"}>{e.status.replace(/_/g, " ")}</Badge>
                        {e.stopReason && <div className="text-xs text-muted-foreground">{e.stopReason.replace(/_/g, " ")}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {e.currentStepIndex + 1}/{sequence?.steps.length ?? "?"}
                        <div className="text-xs text-muted-foreground">{e.runs.filter((r) => r.status === "sent").length} sent</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.nextActionAt && !["completed", "stopped"].includes(e.status) ? formatDistanceToNow(new Date(e.nextActionAt), { addSuffix: true }) : "—"}</TableCell>
                      <TableCell className="text-right">
                        {!["completed", "stopped"].includes(e.status) && (
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={pendingTx} onClick={() => run("Stopped", () => api(`/campaigns/${campaign.id}`, { action: "stop", campaignLeadId: e.id }))}>
                            Stop
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <MessageQueue slug={slug} messages={pending} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          {tasks.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No manual tasks" description="Steps that no authorized integration can perform (for example LinkedIn actions without a connected provider) appear here for you to do by hand." />
          ) : (
            <div className="space-y-3">
              {tasks.map((t) => (
                <Card key={t.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">{t.title}</CardTitle>
                      <CardDescription>
                        {t.leadId && (
                          <Link href={`/w/${slug}/leads/${t.leadId}`} className="underline">
                            {t.leadName}
                          </Link>
                        )}
                        {t.linkedinUrl && (
                          <>
                            {" "}
                            ·{" "}
                            <a href={t.linkedinUrl} target="_blank" rel="noreferrer" className="underline">
                              LinkedIn profile
                            </a>
                          </>
                        )}
                        {t.xHandle && <> · @{t.xHandle}</>}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={pendingTx} onClick={() => run("Task done; sequence continues", () => api(`/tasks`, { taskId: t.id, action: "done" }))}>
                        Mark done
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pendingTx} onClick={() => run("Task cancelled", () => api(`/tasks`, { taskId: t.id, action: "cancel" }))}>
                        Cancel
                      </Button>
                    </div>
                  </CardHeader>
                  {t.instructions && (
                    <CardContent>
                      <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{t.instructions}</pre>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
