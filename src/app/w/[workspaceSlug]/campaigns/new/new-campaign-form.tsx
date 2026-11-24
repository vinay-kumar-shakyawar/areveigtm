"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NewCampaignForm({ slug, icps, templates }: { slug: string; icps: { id: string; name: string }[]; templates: { key: string; name: string; description: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [channels, setChannels] = useState<string[]>(["email"]);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const fd = new FormData(e.currentTarget);
        try {
          const res = await fetch(`/api/v1/w/${slug}/campaigns`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: fd.get("name"),
              objective: fd.get("objective") || null,
              icpProfileId: fd.get("icpProfileId") || null,
              channels,
              approvalMode: fd.get("approvalMode"),
              template: fd.get("template") || undefined,
              dailyLimits: { email: Number(fd.get("limitEmail") || 40), linkedinInvites: Number(fd.get("limitInvites") || 20), linkedinMessages: Number(fd.get("limitMessages") || 50), xDms: Number(fd.get("limitX") || 30) },
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error?.message ?? "Could not create campaign");
          toast.success("Campaign created");
          router.push(`/w/${slug}/campaigns/${data.campaign.id}`);
        } catch (err) {
          toast.error((err as Error).message);
          setBusy(false);
        }
      }}
      className="grid gap-6 xl:grid-cols-[1fr_340px]"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Q1 growth leaders — UAE" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="objective">Objective</Label>
              <Textarea id="objective" name="objective" rows={2} placeholder="Book 15 discovery calls with heads of growth at B2B SaaS companies" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icpProfileId">Target ICP</Label>
              <select id="icpProfileId" name="icpProfileId" className="h-9 w-full rounded-md border bg-background px-3 text-sm" defaultValue={icps[0]?.id ?? ""}>
                <option value="">None</option>
                {icps.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Channels</Label>
              <div className="flex gap-4 pt-2">
                {(["email", "linkedin", "x"] as const).map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm capitalize">
                    <Checkbox checked={channels.includes(c)} onCheckedChange={(v) => setChannels(v ? [...channels, c] : channels.filter((x) => x !== c))} />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Starting sequence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.map((t, i) => (
              <label key={t.key} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary">
                <input type="radio" name="template" value={t.key} defaultChecked={i === 0} className="mt-1" />
                <span>
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
              </label>
            ))}
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary">
              <input type="radio" name="template" value="" className="mt-1" />
              <span>
                <span className="font-medium">Start empty</span>
                <span className="block text-xs text-muted-foreground">Build the sequence step by step.</span>
              </span>
            </label>
          </CardContent>
        </Card>
      </div>
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Safety</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="approvalMode">Approval</Label>
              <select id="approvalMode" name="approvalMode" className="h-9 w-full rounded-md border bg-background px-3 text-sm" defaultValue="review_each_message">
                <option value="review_each_message">Review every AI message before it sends</option>
                <option value="approve_sequence_once">Approve the sequence once; AI drafts send automatically</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Limit id="limitEmail" label="Emails / day" def={40} max={5000} />
              <Limit id="limitInvites" label="LinkedIn invites / day" def={20} max={30} />
              <Limit id="limitMessages" label="LinkedIn msgs / day" def={50} max={100} />
              <Limit id="limitX" label="X DMs / day" def={30} max={100} />
            </div>
            <Button type="submit" className="w-full" disabled={busy || channels.length === 0}>
              {busy ? "Creating…" : "Create campaign"}
            </Button>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function Limit({ id, label, def, max }: { id: string; label: string; def: number; max: number }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} name={id} type="number" min={1} max={max} defaultValue={def} />
    </div>
  );
}
