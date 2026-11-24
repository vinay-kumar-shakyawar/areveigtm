"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, Database, ShieldCheck, ShieldX, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";
import type { LeadResearchOutput } from "@/server/modules/intelligence/service";

interface Factor {
  factor: string;
  weight: number;
  evidence: string;
  contribution: number;
}
export interface LeadView {
  id: string;
  status: string;
  stage: string;
  notes: string;
  ownerUserId: string | null;
  icpProfileId: string | null;
  createdAt: string;
  contact: { firstName: string; lastName: string; title: string; email: string; emailStatus: string; phone: string; linkedinUrl: string; xHandle: string; location: string; country: string; companyNameRaw: string; headline: string; doNotContact: boolean };
  account: { id: string; name: string; domain: string | null; industry: string | null; headcount: number | null; location: string | null; description: string | null; technologies: string[]; fundingStage: string | null } | null;
  sources: { id: string; kind: string; provider: string | null; occurredAt: string; evidence: Record<string, unknown> | null }[];
  enrichments: { id: string; provider: string; field: string; value: unknown; confidence: number; verificationState: string; sourceUrl: string | null; fetchedAt: string; applied: boolean }[];
  scores: { kind: string; score: number; explanation: { factors?: Factor[]; confidence?: number }; computedAt: string; model: string | null }[];
  research: { summary: LeadResearchOutput; sources: { url: string; title: string | null }[] | null; computedAt: string; provider: string | null; model: string | null } | null;
  signals: { id: string; eventType: string; title: string; occurredAt: string; url: string | null; isInferred: boolean; relevanceScore: number; source: string }[];
  campaigns: { id: string; campaign: { id: string; name: string; status: string }; sequence: { id: string; name: string }; status: string; currentStepIndex: number }[];
  conversations: { id: string; channel: string; status: string; lastMessageAt: string | null }[];
  activity: { id: string; action: string; outcome: string; occurredAt: string; metadata: Record<string, unknown> | null }[];
}

const STATUSES = ["new", "reviewing", "approved", "rejected", "enrolled", "replied", "qualified", "meeting_booked", "not_interested", "disqualified", "unsubscribed"];

export function LeadProfile({ slug, lead, icps, members }: { slug: string; lead: LeadView; icps: { id: string; name: string }[]; members: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [contact, setContact] = useState(lead.contact);
  const [notes, setNotes] = useState(lead.notes);
  const base = `/api/v1/w/${slug}/leads/${lead.id}`;

  async function call(path: string, init: RequestInit) {
    const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json" } });
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

  const score = (kind: string) => lead.scores.find((s) => s.kind === kind);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <ScoreCard label="ICP fit" s={score("icp_fit")} />
          <ScoreCard label="Buying intent" s={score("intent")} />
          <ScoreCard label="Lead quality" s={score("quality")} />
        </div>

        <Tabs defaultValue="research">
          <TabsList>
            <TabsTrigger value="research">Research</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="data">Data provenance ({lead.enrichments.length})</TabsTrigger>
            <TabsTrigger value="signals">Signals ({lead.signals.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="research" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => run("Research complete", () => call("/actions", { method: "POST", body: JSON.stringify({ action: "research" }) }))} disabled={pending}>
                <Sparkles className="size-4" /> {lead.research ? "Re-run AI research" : "Run AI research"}
              </Button>
              <Button variant="secondary" onClick={() => run("Enrichment complete", () => call("/actions", { method: "POST", body: JSON.stringify({ action: "enrich" }) }))} disabled={pending}>
                <Database className="size-4" /> Enrich contact data
              </Button>
            </div>
            {!lead.research ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">No research yet. Run it to get an evidence-based summary, scores with explanations and a suggested outreach angle.</CardContent>
              </Card>
            ) : (
              <ResearchPanel r={lead.research} />
            )}
          </TabsContent>

          <TabsContent value="details" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact</CardTitle>
                <CardDescription>Manual edits are recorded as verified, user-sourced values.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["firstName", "First name"],
                    ["lastName", "Last name"],
                    ["title", "Title"],
                    ["email", "Email"],
                    ["phone", "Phone"],
                    ["linkedinUrl", "LinkedIn URL"],
                    ["xHandle", "X handle"],
                    ["location", "Location"],
                    ["country", "Country code"],
                    ["companyNameRaw", "Company (as given)"],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`c-${k}`}>{label}</Label>
                    <div className="flex gap-1">
                      <Input id={`c-${k}`} value={contact[k]} onChange={(e) => setContact({ ...contact, [k]: e.target.value })} />
                      {k === "email" && contact.email && (
                        <>
                          <Badge variant="outline" className="self-center">
                            {contact.emailStatus}
                          </Badge>
                          <Button size="icon-sm" variant="ghost" aria-label="Mark email verified" disabled={pending} onClick={() => run("Marked verified", () => call("/actions", { method: "POST", body: JSON.stringify({ action: "verify_field", field: "email", state: "verified" }) }))}>
                            <ShieldCheck className="size-4" />
                          </Button>
                          <Button size="icon-sm" variant="ghost" aria-label="Mark email invalid" disabled={pending} onClick={() => run("Marked invalid", () => call("/actions", { method: "POST", body: JSON.stringify({ action: "verify_field", field: "email", state: "invalid" }) }))}>
                            <ShieldX className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    disabled={pending}
                    onClick={() =>
                      run("Saved", () =>
                        call("", {
                          method: "PATCH",
                          body: JSON.stringify({
                            notes,
                            contact: Object.fromEntries(Object.entries(contact).filter(([k]) => !["emailStatus", "doNotContact", "headline"].includes(k)).map(([k, v]) => [k, v === "" ? null : v])),
                          }),
                        }),
                      )
                    }
                  >
                    Save contact
                  </Button>
                </div>
              </CardContent>
            </Card>
            {lead.account && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Company</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                  <Row k="Name" v={lead.account.name} />
                  <Row k="Domain" v={lead.account.domain} />
                  <Row k="Industry" v={lead.account.industry} />
                  <Row k="Headcount" v={lead.account.headcount?.toString()} />
                  <Row k="Location" v={lead.account.location} />
                  <Row k="Funding stage" v={lead.account.fundingStage} />
                  <Row k="Technologies" v={lead.account.technologies.join(", ")} />
                  <div className="sm:col-span-2">
                    <Row k="Description" v={lead.account.description} />
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="data" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {lead.sources.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-medium">{s.kind.replace(/_/g, " ")}</span>
                      {s.provider && <span className="text-muted-foreground"> via {s.provider}</span>}
                      {s.evidence?.matchReason ? <div className="text-xs text-muted-foreground">{String(s.evidence.matchReason)}</div> : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(s.occurredAt), { addSuffix: true })}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Field-level provenance</CardTitle>
                <CardDescription>Every value a provider or person supplied. Applied values are on the record; others were outranked by better evidence.</CardDescription>
              </CardHeader>
              <CardContent>
                {lead.enrichments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No enrichment yet.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {lead.enrichments.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <span className="font-medium">{e.field}</span>: <span className="break-all">{typeof e.value === "string" ? e.value : JSON.stringify(e.value)}</span>
                          {e.sourceUrl && (
                            <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex align-middle text-muted-foreground">
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{e.provider}</Badge>
                          <span>conf {Math.round(e.confidence * 100)}%</span>
                          <Badge variant={e.verificationState === "verified" ? "default" : e.verificationState === "invalid" ? "destructive" : "secondary"}>{e.verificationState}</Badge>
                          {e.applied && <Badge variant="secondary">applied</Badge>}
                          <span>{formatDistanceToNow(new Date(e.fetchedAt), { addSuffix: true })}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signals" className="mt-4">
            <Card>
              <CardContent className="pt-4">
                {lead.signals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No signals for this person or company yet.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {lead.signals.map((s) => (
                      <li key={s.id} className="flex items-start justify-between gap-2 py-2">
                        <div>
                          <Badge variant={s.isInferred ? "outline" : "default"} className="mr-2">
                            {s.isInferred ? "inferred" : "observed"}
                          </Badge>
                          <span className="font-medium">{s.eventType.replace(/_/g, " ")}</span>: {s.title}
                          {s.url && (
                            <a href={s.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex align-middle text-muted-foreground">
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          relevance {s.relevanceScore} · {formatDistanceToNow(new Date(s.occurredAt), { addSuffix: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Card>
              <CardContent className="pt-4">
                <ul className="divide-y text-sm">
                  {lead.activity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        {a.action.replace(/[._]/g, " ")}
                        {a.outcome !== "ok" && <Badge variant="destructive" className="ml-2">{a.outcome}</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.occurredAt), { addSuffix: true })}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <select id="status" defaultValue={lead.status} disabled={pending} onChange={(e) => run("Status updated", () => call("", { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="owner">Owner</Label>
              <select id="owner" defaultValue={lead.ownerUserId ?? ""} disabled={pending} onChange={(e) => run("Owner updated", () => call("", { method: "PATCH", body: JSON.stringify({ ownerUserId: e.target.value || null }) }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="icp">ICP</Label>
              <select id="icp" defaultValue={lead.icpProfileId ?? ""} disabled={pending} onChange={(e) => run("ICP updated", () => call("", { method: "PATCH", body: JSON.stringify({ icpProfileId: e.target.value || null }) }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">None</option>
                {icps.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-muted-foreground">
              Stage: {lead.stage.replace(/_/g, " ")} · added {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lead.campaigns.length === 0 ? (
              <p className="text-muted-foreground">Not in any campaign.</p>
            ) : (
              lead.campaigns.map((cl) => (
                <div key={cl.id} className="flex items-center justify-between">
                  <Link href={`/w/${slug}/campaigns/${cl.campaign.id}`} className="font-medium hover:underline">
                    {cl.campaign.name}
                  </Link>
                  <Badge variant="secondary">
                    {cl.status} · step {cl.currentStepIndex + 1}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lead.conversations.length === 0 ? (
              <p className="text-muted-foreground">No conversations yet.</p>
            ) : (
              lead.conversations.map((c) => (
                <Link key={c.id} href={`/w/${slug}/inbox/${c.id}`} className="flex items-center justify-between hover:underline">
                  <span className="capitalize">{c.channel}</span>
                  <Badge variant="outline">{c.status.replace(/_/g, " ")}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function ScoreCard({ label, s }: { label: string; s?: LeadView["scores"][number] }) {
  return (
    <Card className="py-4">
      <CardContent className="px-5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tabular-nums">{s ? s.score : "—"}</span>
        </div>
        <Progress value={s?.score ?? 0} className="mt-2" />
        {s?.explanation.factors && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">Why? ({s.explanation.factors.length} factors, confidence {Math.round((s.explanation.confidence ?? 0) * 100)}%)</summary>
            <ul className="mt-1 space-y-1">
              {s.explanation.factors.map((f, i) => (
                <li key={i}>
                  <span className={f.contribution >= 0 ? "text-emerald-700" : "text-destructive"}>{f.contribution >= 0 ? "+" : ""}{f.contribution}</span> {f.factor} <span className="text-muted-foreground">— {f.evidence}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function ResearchPanel({ r }: { r: NonNullable<LeadView["research"]> }) {
  const s = r.summary;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI research</CardTitle>
        <CardDescription>
          {r.provider}/{r.model} · {formatDistanceToNow(new Date(r.computedAt), { addSuffix: true })} · confidence {Math.round(s.confidence * 100)}%. Scores are evidence-weighted estimates, not facts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Section title="Who is this person?">{s.whoIsThisPerson}</Section>
        <Section title="What does the company do?">{s.whatCompanyDoes}</Section>
        <Section title="Why might they need us?">{s.whyTheyMightNeedUs}</Section>
        <Section title="Likely challenges">
          <ul className="list-disc pl-5">{s.likelyChallenges.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </Section>
        <Section title="Signals">
          {s.signalsFound.length === 0 ? (
            <span className="text-muted-foreground">None found.</span>
          ) : (
            <ul className="space-y-1">
              {s.signalsFound.map((x, i) => (
                <li key={i}>
                  <Badge variant={x.observed ? "default" : "outline"} className="mr-1">
                    {x.observed ? "observed" : "inferred"}
                  </Badge>
                  {x.signal} <span className="text-muted-foreground">— {x.evidence}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <div className="grid gap-3 sm:grid-cols-2">
          <Section title="Best angle">{s.bestAngle}</Section>
          <Section title="Best channel">
            <Badge>{s.bestChannel}</Badge>
          </Section>
        </div>
        <Section title="Suggested opener">
          <blockquote className="rounded-md bg-muted p-3 italic">{s.suggestedOpener}</blockquote>
        </Section>
        <Section title="Suggested value proposition">{s.suggestedValueProp}</Section>
        <Section title="Next action">{s.nextAction}</Section>
        {s.gaps.length > 0 && (
          <Section title="What we could not find">
            <ul className="list-disc pl-5 text-muted-foreground">{s.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </Section>
        )}
        <Section title="Evidence">
          <ul className="space-y-1 text-xs">
            {s.evidence.map((e, i) => (
              <li key={i}>
                {e.claim} <span className="text-muted-foreground">({e.source})</span>
              </li>
            ))}
          </ul>
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground">{k}: </span>
      <span>{v || "—"}</span>
    </div>
  );
}
