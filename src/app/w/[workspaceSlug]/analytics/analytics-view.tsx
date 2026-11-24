"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { AnalyticsOverview, Ratio } from "@/server/modules/analytics/service";

/**
 * Chart colours follow the dataviz method: one hue for single-series bars
 * (brand teal, contrast-checked per mode), and three validated categorical
 * slots for the multi-series line (blue / orange / aqua, light and dark steps
 * from the reference palette). Text never wears a series colour.
 */
const VIZ_CSS = `
.viz-root { --viz-mono: #007d7e; --viz-s1: #2a78d6; --viz-s2: #eb6834; --viz-s3: #1baf7a; --viz-grid: #e8e8e6; --viz-ink: #52514e; --viz-surface: #ffffff; }
.dark .viz-root { --viz-mono: #3dbcbd; --viz-s1: #3987e5; --viz-s2: #d95926; --viz-s3: #199e70; --viz-grid: #343432; --viz-ink: #c3c2b7; --viz-surface: #262626; }
`;

const PRESETS = [7, 30, 90, 180];

function pct(r: Ratio) {
  return r.value === null ? "—" : `${(r.value * 100).toFixed(r.value < 0.1 ? 1 : 0)}%`;
}
function compact(n: number) {
  return n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : n.toLocaleString();
}

export function AnalyticsView({ slug, days, campaignId, campaigns, data }: { slug: string; days: number; campaignId: string | null; campaigns: { id: string; name: string }[]; data: AnalyticsOverview }) {
  const router = useRouter();
  const [table, setTable] = useState<null | "timeseries" | "funnel" | "classifications">(null);
  const h = data.headline;
  const navigate = (next: { days?: number; campaignId?: string | null }) => {
    const params = new URLSearchParams();
    params.set("days", String(next.days ?? days));
    const c = next.campaignId === undefined ? campaignId : next.campaignId;
    if (c) params.set("campaignId", c);
    router.push(`/w/${slug}/analytics?${params.toString()}`);
  };
  const maxFunnel = Math.max(1, ...data.funnel.map((f) => f.leads));
  const maxClass = Math.max(1, ...data.classifications.map((c) => c.count));

  return (
    <div className="viz-root space-y-6">
      <style>{VIZ_CSS}</style>

      {/* Filters: one row above everything they scope. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <Button key={p} size="sm" variant={days === p ? "default" : "outline"} onClick={() => navigate({ days: p })}>
              Last {p} days
            </Button>
          ))}
        </div>
        <Select value={campaignId ?? "all"} onValueChange={(v) => navigate({ campaignId: v === "all" ? null : v })}>
          <SelectTrigger className="w-[220px]" aria-label="Campaign filter"><SelectValue>{campaignId ? (campaigns.find((c) => c.id === campaignId)?.name ?? "Campaign") : "All campaigns"}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground" title="Definitions: docs/analytics/metrics.md in the repository">{new Date(data.range.from).toLocaleDateString()} – {new Date(data.range.to).toLocaleDateString()} · metrics defined in docs/analytics/metrics.md</span>
      </div>

      {/* KPI row of stat tiles. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads contacted" value={compact(h.contacted)} hint="distinct leads with a send" />
        <Stat label="Reply rate" value={pct(h.replyRate)} hint={`${h.replied} of ${h.contacted} · ${h.replyRate.definition}`} />
        <Stat label="Positive reply rate" value={pct(h.positiveReplyRate)} hint={`${h.positiveReplyRate.numerator} of ${h.positiveReplyRate.denominator} · ${h.positiveReplyRate.definition}`} />
        <Stat label="Meetings booked" value={compact(h.meetings)} hint={`${pct(h.meetingRate)} of leads that replied`} />
        <Stat label="Bounce rate" value={pct(h.bounceRate)} hint={`${h.bounceRate.numerator} of ${h.bounceRate.denominator} emails`} />
        <Stat label="Unsubscribe rate" value={pct(h.unsubscribeRate)} hint={`${h.unsubscribeRate.numerator} of ${h.unsubscribeRate.denominator} emails`} />
        <Stat label="Median time to reply" value={h.medianHoursToReply === null ? "—" : h.medianHoursToReply < 48 ? `${h.medianHoursToReply.toFixed(1)} h` : `${(h.medianHoursToReply / 24).toFixed(1)} d`} hint="first reply after first send" />
        <Stat label="AI drafts sent unedited" value={pct(h.aiDraftsSentUnedited)} hint={`${h.aiDraftsSentUnedited.numerator} of ${h.aiDraftsSentUnedited.denominator} AI messages · ${h.autoSentReplies} auto-sent`} />
      </div>

      {/* Activity over time: three series, validated categorical slots, legend + crosshair tooltip. */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">Activity per day</CardTitle>
            <CardDescription>Messages and invitations sent, replies received, meetings booked.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setTable(table === "timeseries" ? null : "timeseries")}>{table === "timeseries" ? "Chart" : "Table"}</Button>
        </CardHeader>
        <CardContent>
          <Legend items={[{ label: "Sent", color: "var(--viz-s1)" }, { label: "Replies", color: "var(--viz-s2)" }, { label: "Meetings", color: "var(--viz-s3)" }]} />
          {table === "timeseries" ? (
            <DataTable head={["Day", "Sent", "Replies", "Meetings"]} rows={data.timeseries.map((t) => [t.date, t.sent, t.replies, t.meetings])} />
          ) : (
            <div className="h-64 w-full" role="img" aria-label="Line chart of sent messages, replies and meetings per day">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.timeseries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--viz-grid)" strokeWidth={1} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fill: "var(--viz-ink)", fontSize: 11 }} axisLine={{ stroke: "var(--viz-grid)" }} tickLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} width={32} tick={{ fill: "var(--viz-ink)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ stroke: "var(--viz-ink)", strokeWidth: 1 }} content={(p) => <VizTooltip active={p.active} payload={p.payload as ReadonlyArray<TooltipRow>} label={p.label} />} />
                  <Line type="monotone" dataKey="sent" name="Sent" stroke="var(--viz-s1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="replies" name="Replies" stroke="var(--viz-s2)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="meetings" name="Meetings" stroke="var(--viz-s3)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Funnel: ordered stages, one hue, value at the bar tip. */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Funnel</CardTitle>
              <CardDescription>Distinct leads per stage. Later stages use events in range and can exceed earlier cohort counts.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTable(table === "funnel" ? null : "funnel")}>{table === "funnel" ? "Chart" : "Table"}</Button>
          </CardHeader>
          <CardContent>
            {table === "funnel" ? (
              <DataTable head={["Stage", "Leads", "Definition"]} rows={data.funnel.map((f) => [f.stage, f.leads, f.definition])} />
            ) : (
              <ul className="space-y-2" aria-label="Funnel stages">
                {data.funnel.map((f) => (
                  <li key={f.stage} className="grid grid-cols-[120px_1fr_48px] items-center gap-2 text-sm" title={f.definition}>
                    <span className="truncate text-muted-foreground">{f.stage}</span>
                    <div className="h-4 w-full rounded-r-[4px] bg-transparent">
                      <div className="h-4 rounded-r-[4px]" style={{ width: `${Math.max(f.leads > 0 ? 2 : 0, (f.leads / maxFunnel) * 100)}%`, background: "var(--viz-mono)" }} />
                    </div>
                    <span className="text-right tabular-nums">{f.leads}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Reply classifications: ranked horizontal bars, one hue. */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Reply classifications</CardTitle>
              <CardDescription>How the AI triaged conversations opened in range.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTable(table === "classifications" ? null : "classifications")}>{table === "classifications" ? "Chart" : "Table"}</Button>
          </CardHeader>
          <CardContent>
            {data.classifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No replies in this range.</p>
            ) : table === "classifications" ? (
              <DataTable head={["Classification", "Conversations"]} rows={data.classifications.map((c) => [c.classification, c.count])} />
            ) : (
              <ul className="space-y-2" aria-label="Reply classifications">
                {data.classifications.map((c) => (
                  <li key={c.classification} className="grid grid-cols-[120px_1fr_48px] items-center gap-2 text-sm">
                    <span className="truncate text-muted-foreground">{c.classification.replace(/_/g, " ")}</span>
                    <div className="h-4 w-full"><div className="h-4 rounded-r-[4px]" style={{ width: `${(c.count / maxClass) * 100}%`, background: "var(--viz-mono)" }} /></div>
                    <span className="text-right tabular-nums">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Channels: grouped columns would need 4 series; a table with one single-hue column chart for sent keeps it honest. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channels</CardTitle>
          <CardDescription>Events per channel. Reply rate uses distinct leads contacted on that channel as the denominator.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="h-44" role="img" aria-label="Column chart of sends per channel">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.channels} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap="35%">
                <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                <XAxis dataKey="channel" tick={{ fill: "var(--viz-ink)", fontSize: 11 }} axisLine={{ stroke: "var(--viz-grid)" }} tickLine={false} />
                <YAxis allowDecimals={false} width={28} tick={{ fill: "var(--viz-ink)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "transparent" }} content={(p) => <VizTooltip active={p.active} payload={p.payload as ReadonlyArray<TooltipRow>} label={p.label} />} />
                <Bar dataKey="sent" name="Sent" fill="var(--viz-mono)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable head={["Channel", "Sent", "Delivered", "Replies", "Bounces", "Manual tasks", "Reply rate"]} rows={data.channels.map((c) => [c.channel, c.sent, c.delivered, c.replies, c.bounces, c.manualTasks, `${pct(c.replyRate)} (${c.replyRate.numerator}/${c.replyRate.denominator})`])} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaigns</CardTitle>
            <CardDescription>Reply rate = distinct leads replied / distinct leads contacted in the campaign.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.campaigns.length === 0 ? <p className="text-sm text-muted-foreground">No campaign activity in this range.</p> : <DataTable head={["Campaign", "Enrolled", "Sent", "Replied", "Meetings", "Bounces", "Reply rate"]} rows={data.campaigns.map((c) => [<Link key={c.id} href={`/w/${slug}/campaigns/${c.id}`} className="hover:underline">{c.name}</Link>, c.enrolled, c.sent, c.replied, c.meetings, c.bounces, pct(c.replyRate)])} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sending accounts</CardTitle>
            <CardDescription>Bounce rate = bounced / sent on that account. Keep it under 2%.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.senders.length === 0 ? <p className="text-sm text-muted-foreground">No sending accounts yet.</p> : <DataTable head={["Account", "Channel", "Sent", "Replies", "Bounces", "Failed", "Bounce rate"]} rows={data.senders.map((s) => [s.name, s.channel, s.sent, s.replies, s.bounces, s.failed, pct(s.bounceRate)])} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider usage</CardTitle>
          <CardDescription>Calls, units and estimated cost recorded by each adapter. Estimates are zero where a provider publishes no per-call price.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.providerUsage.length === 0 ? <p className="text-sm text-muted-foreground">No provider calls in this range.</p> : <DataTable head={["Provider", "Operation", "Calls", "Units", "Est. cost"]} rows={data.providerUsage.map((u) => [u.provider, u.operation, u.calls, u.units, `$${(u.estimatedCostCents / 100).toFixed(2)}`])} />}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="py-4">
      <CardContent className="px-5">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground" title={hint}>{hint}</div>
      </CardContent>
    </Card>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: i.color }} aria-hidden />{i.label}</li>
      ))}
    </ul>
  );
}

interface TooltipRow {
  dataKey?: unknown;
  value?: unknown;
  name?: unknown;
  color?: string;
  stroke?: string;
}
function VizTooltip({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<TooltipRow>; label?: unknown }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 text-muted-foreground">{String(label)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3" style={{ background: String(p.color ?? p.stroke ?? "currentColor") }} aria-hidden />
          <span className="font-semibold tabular-nums">{String(p.value ?? "")}</span>
          <span className="text-muted-foreground">{String(p.name ?? "")}</span>
        </div>
      ))}
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((h) => (
              <TableHead key={h} className="text-xs">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((cell, j) => (
                <TableCell key={j} className={j === 0 ? "text-sm" : "text-sm tabular-nums"}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
