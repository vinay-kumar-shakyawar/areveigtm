"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Radar, RefreshCw, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/app/empty-state";
import { formatDistanceToNow } from "date-fns";

const EVENT_TYPES = ["hiring", "funding", "leadership_change", "expansion", "technology_adopted", "competitor_engagement", "linkedin_post_engagement", "x_post_engagement", "website_visit", "custom"];

interface SignalRow {
  id: string;
  eventType: string;
  title: string;
  occurredAt: string;
  url: string | null;
  source: string;
  provider: string | null;
  isInferred: boolean;
  confidence: number;
  relevanceScore: number;
  evidence: Record<string, unknown> | null;
  account: { id: string; name: string; domain: string | null } | null;
  contact: { id: string; fullName: string; leadId: string | null } | null;
}
interface RuleRow {
  id: string;
  name: string;
  enabled: boolean;
  match: { eventTypes?: string[]; minRelevance?: number; includeInferred?: boolean };
  action: string;
  campaign: { id: string; name: string } | null;
  icpProfile: { id: string; name: string } | null;
}

export function SignalsPanel({ slug, signals, rules, icps, campaigns, filter }: { slug: string; signals: SignalRow[]; rules: RuleRow[]; icps: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; filter: { eventType: string; inferred: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function api(path: string, init: RequestInit) {
    const res = await fetch(`/api/v1/w/${slug}/signals${path}`, { ...init, headers: { "content-type": "application/json" } });
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

  const setFilter = (next: Partial<typeof filter>) => {
    const qs = new URLSearchParams(Object.entries({ ...filter, ...next }).filter(([, v]) => v) as [string, string][]);
    router.push(`/w/${slug}/signals${qs.toString() ? `?${qs}` : ""}`);
  };

  return (
    <Tabs defaultValue="feed">
      <TabsList>
        <TabsTrigger value="feed">Feed ({signals.length})</TabsTrigger>
        <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="feed" className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={filter.eventType} onChange={(e) => setFilter({ eventType: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Event type">
            <option value="">All types</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select value={filter.inferred} onChange={(e) => setFilter({ inferred: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Observed or inferred">
            <option value="">Observed and inferred</option>
            <option value="false">Observed only</option>
            <option value="true">Inferred only</option>
          </select>
          <div className="flex-1" />
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run("Signal sync queued", () => api("", { method: "POST", body: JSON.stringify({ action: "sync" }) }))}>
            <RefreshCw className="size-4" /> Sync from providers
          </Button>
          <ManualSignalDialog onSubmit={(body) => run("Signal recorded", () => api("", { method: "POST", body: JSON.stringify({ action: "record", ...body }) }))} />
        </div>
        {signals.length === 0 ? (
          <EmptyState icon={Radar} title="No signals yet" description="Sync from a connected provider, record one manually, or run AI research on a lead to surface inferred signals." />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {signals.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={s.isInferred ? "outline" : "default"}>{s.isInferred ? "inferred" : "observed"}</Badge>
                    <Badge variant="secondary">{s.eventType.replace(/_/g, " ")}</Badge>
                    <span className="font-medium">{s.title}</span>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open source">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {s.account && <span>{s.account.name}{s.account.domain ? ` (${s.account.domain})` : ""} · </span>}
                    {s.contact && (
                      <span>
                        {s.contact.leadId ? (
                          <Link href={`/w/${slug}/leads/${s.contact.leadId}`} className="underline">
                            {s.contact.fullName}
                          </Link>
                        ) : (
                          s.contact.fullName
                        )}{" "}
                        ·{" "}
                      </span>
                    )}
                    source {s.provider ?? s.source} · confidence {Math.round(s.confidence * 100)}% · relevance {s.relevanceScore}
                    {s.evidence && typeof s.evidence.excerpt === "string" && <div className="mt-1 line-clamp-2 italic">“{s.evidence.excerpt}”</div>}
                    {s.evidence && typeof s.evidence.note === "string" && <div className="mt-1 line-clamp-2">{s.evidence.note}</div>}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(s.occurredAt), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="rules" className="mt-4 space-y-3">
        <RuleForm icps={icps} campaigns={campaigns} onSubmit={(body) => run("Rule created", () => api("/rules", { method: "POST", body: JSON.stringify(body) }))} />
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet. Rules run automatically whenever a matching signal is stored.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <span className="font-medium">{r.name}</span>
                  <div className="text-xs text-muted-foreground">
                    {r.match.eventTypes?.length ? r.match.eventTypes.join(", ") : "any type"} · relevance ≥ {r.match.minRelevance ?? 0} · {r.match.includeInferred ? "incl. inferred" : "observed only"} → {r.action.replace(/_/g, " ")}
                    {r.campaign ? ` (${r.campaign.name})` : ""}
                    {r.icpProfile ? ` (ICP ${r.icpProfile.name})` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={r.enabled} disabled={pending} onCheckedChange={(v) => run("Rule updated", () => api(`/rules/${r.id}`, { method: "PATCH", body: JSON.stringify({ enabled: v }) }))} aria-label="Enabled" />
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => run("Rule deleted", () => api(`/rules/${r.id}`, { method: "DELETE" }))}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}

function ManualSignalDialog({ onSubmit }: { onSubmit: (body: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" /> Record signal
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSubmit({
              eventType: fd.get("eventType"),
              title: fd.get("title"),
              companyName: fd.get("companyName") || undefined,
              companyDomain: fd.get("companyDomain") || undefined,
              url: fd.get("url") || undefined,
              evidence: fd.get("evidence") || undefined,
              relevanceScore: Number(fd.get("relevanceScore") ?? 60),
            });
            setOpen(false);
          }}
          className="space-y-3"
        >
          <DialogHeader>
            <DialogTitle>Record a signal you observed</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="eventType">Type</Label>
            <select id="eventType" name="eventType" className="h-9 w-full rounded-md border bg-background px-3 text-sm" defaultValue="hiring">
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="title">What happened</Label>
            <Input id="title" name="title" required placeholder="Hiring a Head of Growth" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="companyName">Company</Label>
              <Input id="companyName" name="companyName" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="companyDomain">Domain</Label>
              <Input id="companyDomain" name="companyDomain" placeholder="acme.com" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="url">Source URL</Label>
            <Input id="url" name="url" type="url" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="evidence">Evidence / notes</Label>
            <Textarea id="evidence" name="evidence" rows={2} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="relevanceScore">Relevance (0–100)</Label>
            <Input id="relevanceScore" name="relevanceScore" type="number" min={0} max={100} defaultValue={60} />
          </div>
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RuleForm({ icps, campaigns, onSubmit }: { icps: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; onSubmit: (body: Record<string, unknown>) => void }) {
  const [types, setTypes] = useState<string[]>([]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New rule</CardTitle>
        <CardDescription>When a signal matches, flag the lead, notify the team, or (once campaigns exist) suggest a campaign.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSubmit({
              name: fd.get("name"),
              enabled: true,
              match: { eventTypes: types, minRelevance: Number(fd.get("minRelevance") ?? 50), includeInferred: fd.get("includeInferred") === "on", minConfidence: 0.5 },
              action: fd.get("action"),
              campaignId: fd.get("campaignId") || null,
              icpProfileId: fd.get("icpProfileId") || null,
            });
            (e.target as HTMLFormElement).reset();
            setTypes([]);
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="space-y-1">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" name="name" required placeholder="Hiring growth roles" />
          </div>
          <div className="space-y-1">
            <Label>Event types</Label>
            <div className="flex flex-wrap gap-1">
              {EVENT_TYPES.slice(0, 6).map((t) => {
                const on = types.includes(t);
                return (
                  <button key={t} type="button" aria-pressed={on} onClick={() => setTypes(on ? types.filter((x) => x !== t) : [...types, t])} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                    {t.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="minRelevance">Min relevance</Label>
            <Input id="minRelevance" name="minRelevance" type="number" min={0} max={100} defaultValue={50} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="includeInferred" /> include inferred
            </label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="action">Action</Label>
            <select id="action" name="action" className="h-9 w-full rounded-md border bg-background px-3 text-sm" defaultValue="notify">
              <option value="notify">Notify team</option>
              <option value="create_lead">Flag lead for review</option>
              <option value="add_to_campaign">Suggest campaign</option>
            </select>
            <select name="campaignId" className="h-9 w-full rounded-md border bg-background px-3 text-sm" defaultValue="">
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select name="icpProfileId" className="h-9 w-full rounded-md border bg-background px-3 text-sm" defaultValue="">
              <option value="">No ICP</option>
              {icps.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm">
              Add rule
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
