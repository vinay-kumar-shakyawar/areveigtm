"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, RefreshCw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/app/empty-state";
import { CheckCircle2 } from "lucide-react";

export interface PendingMessage {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  leadId: string | null;
  leadName: string;
  leadTitle: string | null;
  company: string | null;
  stepIndex: number;
  aiMeta: { reasoning?: string; personalizationUsed?: string[]; risks?: string[]; provider?: string } | null;
  createdAt: string;
}

export function MessageQueue({ slug, messages }: { slug: string; messages: PendingMessage[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Record<string, { subject: string; body: string }>>({});
  const [instructions, setInstructions] = useState<Record<string, string>>({});

  async function review(id: string, body: unknown) {
    const res = await fetch(`/api/v1/w/${slug}/messages/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
    return data;
  }
  const run = (label: string, fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
        toast.success(label);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });

  if (messages.length === 0) return <EmptyState icon={CheckCircle2} title="Nothing to review" description="AI drafts appear here as the scheduler reaches each person's next step. Approved messages send in the next sending window." />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{messages.length} draft{messages.length === 1 ? "" : "s"} waiting. Approve, edit, regenerate with guidance, or reject.</p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(`Approved ${messages.length}`, async () => {
              for (const m of messages) await review(m.id, { decision: "approve" });
            })
          }
        >
          Approve all
        </Button>
      </div>
      {messages.map((m) => {
        const edit = editing[m.id];
        return (
          <Card key={m.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  {m.leadId ? (
                    <Link href={`/w/${slug}/leads/${m.leadId}`} className="hover:underline">
                      {m.leadName}
                    </Link>
                  ) : (
                    m.leadName
                  )}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{[m.leadTitle, m.company].filter(Boolean).join(" · ")}</span>
                </CardTitle>
                <CardDescription className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{m.channel}</Badge>
                  <span>step {m.stepIndex + 1}</span>
                  {m.aiMeta?.provider && <span>· drafted by {m.aiMeta.provider}</span>}
                </CardDescription>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" disabled={pending} onClick={() => run("Approved", () => review(m.id, edit ? { decision: "edit", subject: edit.subject || null, body: edit.body } : { decision: "approve" }))}>
                  <Check className="size-4" /> {edit ? "Approve edits" : "Approve"}
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing((e) => (e[m.id] ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== m.id)) : { ...e, [m.id]: { subject: m.subject ?? "", body: m.body } }))}>
                  <Pencil className="size-4" /> {edit ? "Cancel edit" : "Edit"}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => run("Rejected", () => review(m.id, { decision: "reject" }))}>
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {edit ? (
                <div className="space-y-2">
                  {m.channel === "email" && <Input value={edit.subject} onChange={(e) => setEditing((s) => ({ ...s, [m.id]: { ...edit, subject: e.target.value } }))} placeholder="Subject" />}
                  <Textarea rows={8} value={edit.body} onChange={(e) => setEditing((s) => ({ ...s, [m.id]: { ...edit, body: e.target.value } }))} />
                </div>
              ) : (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  {m.subject && <div className="mb-2 font-medium">Subject: {m.subject}</div>}
                  <pre className="whitespace-pre-wrap font-sans">{m.body}</pre>
                </div>
              )}
              {m.aiMeta && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Why this draft</summary>
                  <div className="mt-1 space-y-1">
                    {m.aiMeta.reasoning && <p>{m.aiMeta.reasoning}</p>}
                    {m.aiMeta.personalizationUsed?.length ? <p>Facts used: {m.aiMeta.personalizationUsed.join("; ")}</p> : <p>No personal facts were available; the draft stays generic on purpose.</p>}
                    {m.aiMeta.risks?.length ? <p className="text-amber-700">Risks: {m.aiMeta.risks.join("; ")}</p> : null}
                  </div>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Input value={instructions[m.id] ?? ""} onChange={(e) => setInstructions((s) => ({ ...s, [m.id]: e.target.value }))} placeholder="Guidance for a regeneration, e.g. shorter, mention the funding round" className="max-w-md" />
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("Regenerated", () => review(m.id, { decision: "regenerate", instructions: instructions[m.id] || undefined }))}>
                  <RefreshCw className="size-4" /> Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
