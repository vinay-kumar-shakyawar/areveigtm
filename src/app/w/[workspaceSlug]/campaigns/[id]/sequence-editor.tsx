"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StepInput } from "@/server/modules/sequences/schemas";
import type { SequenceView } from "./campaign-detail";

const KIND_LABEL: Record<string, string> = {
  linkedin_connect: "LinkedIn connection request",
  linkedin_message: "LinkedIn message",
  linkedin_inmail: "LinkedIn InMail",
  linkedin_engage: "LinkedIn engagement (view / like)",
  email: "Email",
  x_dm: "X direct message",
  x_engage: "X engagement (follow)",
  wait: "Wait",
  manual_task: "Manual task",
};
const KINDS_BY_CHANNEL: Record<string, string[]> = {
  email: ["email"],
  linkedin: ["linkedin_connect", "linkedin_message", "linkedin_inmail", "linkedin_engage"],
  x: ["x_dm", "x_engage"],
};

function blankStep(kind: string): StepInput {
  return { kind: kind as StepInput["kind"], delayDays: 2, subject: null, bodyTemplate: null, condition: null, aiGeneration: { enabled: kind !== "linkedin_connect", tone: "plain", length: "short" } };
}

export function SequenceEditor({ slug, campaignId, channels, sequence, canApprove }: { slug: string; campaignId: string; channels: string[]; sequence: SequenceView | null; canApprove: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(sequence?.name ?? "Sequence");
  const [steps, setSteps] = useState<StepInput[]>(sequence?.steps ?? []);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const kinds = [...channels.flatMap((c) => KINDS_BY_CHANNEL[c] ?? []), "wait", "manual_task"];
  const approved = Boolean(sequence && sequence.approvedRevision === sequence.revision && !dirty);
  const update = (i: number, patch: Partial<StepInput>) => {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
    setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) => {
    setSteps((s) => {
      const copy = [...s];
      const j = i + dir;
      if (j < 0 || j >= copy.length) return s;
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setDirty(true);
  };

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
        toast.success(label);
        setDirty(false);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });

  function save(asNew = false) {
    const payload = { name, executionModel: "linear", steps };
    if (!sequence) return run("Sequence created", () => api("/sequences", { ...payload, campaignId }));
    if (asNew) return run("Saved as a new sequence", () => api(`/sequences/${sequence.id}`, { action: "fork", ...payload, name: `${name} v${sequence.revision + 1}` }));
    return run("Sequence saved (needs approval)", () => api(`/sequences/${sequence.id}`, { ...payload, expectedRevision: sequence.revision }, "PUT"));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="max-w-sm" aria-label="Sequence name" />
          {sequence && (
            <Badge variant={approved ? "default" : "secondary"}>
              {approved ? `approved · rev ${sequence.revision}` : `rev ${sequence.revision} · not approved`}
            </Badge>
          )}
          {sequence && <Badge variant="outline">{sequence.status}</Badge>}
        </div>

        {steps.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No steps yet. Add the first touch below.</p>}

        {steps.map((s, i) => {
          const ai = s.aiGeneration?.enabled ?? true;
          const isMessage = ["email", "linkedin_message", "linkedin_inmail", "x_dm"].includes(s.kind);
          return (
            <Card key={i}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Step {i + 1}</Badge>
                  <select value={s.kind} onChange={(e) => update(i, { ...blankStep(e.target.value), delayDays: s.delayDays })} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Step type">
                    {kinds.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k] ?? k}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-muted-foreground">{i === 0 ? "on enrolment" : "after"}</span>
                  {i > 0 && (
                    <>
                      <Input type="number" min={0} max={30} value={s.delayDays} onChange={(e) => update(i, { delayDays: Number(e.target.value) })} className="w-20" aria-label="Delay in days" />
                      <span className="text-sm text-muted-foreground">day(s)</span>
                    </>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Remove step" onClick={() => { setSteps((st) => st.filter((_, idx) => idx !== i)); setDirty(true); }}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {isMessage && (
                  <div className="flex items-center justify-between rounded-md bg-muted/50 p-3">
                    <div>
                      <div className="text-sm font-medium">Write with AI per person</div>
                      <div className="text-xs text-muted-foreground">Uses the company profile, research and observed signals. Nothing invented; every draft is reviewable.</div>
                    </div>
                    <Switch checked={ai} onCheckedChange={(v) => update(i, { aiGeneration: { ...(s.aiGeneration ?? { tone: "plain", length: "short" }), enabled: v } })} aria-label="AI generation" />
                  </div>
                )}
                {isMessage && ai && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Tone</Label>
                      <select value={s.aiGeneration?.tone ?? "plain"} onChange={(e) => update(i, { aiGeneration: { ...(s.aiGeneration ?? { enabled: true, length: "short" }), tone: e.target.value as "plain" } })} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                        {["plain", "friendly", "direct", "formal"].map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Length</Label>
                      <select value={s.aiGeneration?.length ?? "short"} onChange={(e) => update(i, { aiGeneration: { ...(s.aiGeneration ?? { enabled: true, tone: "plain" }), length: e.target.value as "short" } })} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                        <option value="short">short</option>
                        <option value="medium">medium</option>
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label>Guidance for this step</Label>
                      <Input value={s.aiGeneration?.instructions ?? ""} onChange={(e) => update(i, { aiGeneration: { ...(s.aiGeneration ?? { enabled: true, tone: "plain", length: "short" }), instructions: e.target.value } })} placeholder="e.g. mention the hiring signal if there is one; ask one yes/no question" />
                    </div>
                  </div>
                )}
                {isMessage && !ai && (
                  <div className="grid gap-3">
                    {s.kind === "email" && (
                      <div className="space-y-1">
                        <Label>Subject</Label>
                        <Input value={s.subject ?? ""} onChange={(e) => update(i, { subject: e.target.value })} placeholder="Leave blank on follow-ups to stay in the thread" />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label>Message</Label>
                      <Textarea rows={5} value={s.bodyTemplate ?? ""} onChange={(e) => update(i, { bodyTemplate: e.target.value })} placeholder="Hi {{firstName}}, …" />
                      <p className="text-xs text-muted-foreground">Variables: {"{{firstName}} {{lastName}} {{fullName}} {{company}} {{title}} {{senderFirstName}}"}</p>
                    </div>
                  </div>
                )}
                {s.kind === "linkedin_connect" && (
                  <div className="space-y-1">
                    <Label>Connection note (optional, max 300 chars; blank sends without a note)</Label>
                    <Textarea rows={2} maxLength={300} value={s.bodyTemplate ?? ""} onChange={(e) => update(i, { bodyTemplate: e.target.value || null })} />
                  </div>
                )}
                {s.kind === "manual_task" && (
                  <div className="space-y-1">
                    <Label>Instructions for the team member</Label>
                    <Textarea rows={2} value={s.manualInstructions ?? ""} onChange={(e) => update(i, { manualInstructions: e.target.value })} />
                  </div>
                )}
                {(s.kind === "linkedin_engage" || s.kind === "x_engage") && (
                  <div className="space-y-1">
                    <Label>Actions</Label>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {(s.kind === "linkedin_engage" ? ["view_profile", "like_last_post"] : ["follow"]).map((a) => {
                        const on = s.actions?.some((x) => x.type === a) ?? false;
                        return (
                          <label key={a} className="flex items-center gap-2">
                            <input type="checkbox" checked={on} onChange={(e) => update(i, { actions: e.target.checked ? [...(s.actions ?? []), { type: a as "follow", count: 1 }] : (s.actions ?? []).filter((x) => x.type !== a) })} />
                            {a.replace(/_/g, " ")}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {i > 0 && (
                  <div className="space-y-1">
                    <Label>Only run if</Label>
                    <select value={s.condition ?? ""} onChange={(e) => update(i, { condition: (e.target.value || null) as StepInput["condition"] })} className="h-8 rounded-md border bg-background px-2 text-sm">
                      <option value="">always</option>
                      <option value="linkedin_accepted">connection accepted</option>
                      <option value="has_email">has email</option>
                      <option value="has_linkedin">has LinkedIn</option>
                      <option value="has_x">has X handle</option>
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <div className="flex flex-wrap gap-2">
          {kinds
            .filter((k) => k !== "wait")
            .map((k) => (
              <Button key={k} size="sm" variant="outline" onClick={() => { setSteps((s) => [...s, blankStep(k)]); setDirty(true); }}>
                <Plus className="size-3.5" /> {KIND_LABEL[k]}
              </Button>
            ))}
        </div>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Save and approve</CardTitle>
            <CardDescription>Editing creates a new revision that must be approved again. Steps already sent to people cannot change; save as a new sequence instead.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" disabled={pending || steps.length === 0} onClick={() => save(false)}>
              {sequence ? "Save changes" : "Create sequence"}
            </Button>
            {sequence && (sequence.enrolled > 0 || dirty) && (
              <Button className="w-full" variant="outline" disabled={pending || steps.length === 0} onClick={() => save(true)}>
                Save as new sequence
              </Button>
            )}
            {sequence && !dirty && !approved && canApprove && (
              <Button className="w-full" variant="secondary" disabled={pending} onClick={() => run("Sequence approved", () => api(`/sequences/${sequence.id}`, { action: "approve", expectedRevision: sequence.revision }))}>
                <CheckCircle2 className="size-4" /> Approve revision {sequence.revision}
              </Button>
            )}
            {sequence && approved && sequence.status === "paused" && (
              <Button className="w-full" variant="secondary" disabled={pending} onClick={() => run("Sequence resumed", () => api(`/sequences/${sequence.id}`, { action: "status", status: "active" }))}>
                Resume sequence
              </Button>
            )}
            {sequence && sequence.status === "active" && (
              <Button className="w-full" variant="ghost" disabled={pending} onClick={() => run("Sequence paused", () => api(`/sequences/${sequence.id}`, { action: "status", status: "paused" }))}>
                Pause sequence
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stops automatically when</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-disc space-y-1 pl-4">
              <li>the person replies on any channel</li>
              <li>they unsubscribe or are marked not interested / disqualified</li>
              <li>their email bounces or the identity is invalid</li>
              <li>the campaign is paused or a daily limit is reached (resumes next window)</li>
            </ul>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
