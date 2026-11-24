"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { Archive, Bot, CalendarCheck, Clock, Inbox, Link2, Mail, MessageCircle, Play, RefreshCw, Send, ThumbsDown, ThumbsUp, UserMinus, Briefcase, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread" | "awaiting" | "interested" | "qualified" | "not_interested" | "meeting_requested" | "snoozed" | "archived";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "awaiting", label: "Awaiting response" },
  { key: "interested", label: "Interested" },
  { key: "qualified", label: "Qualified" },
  { key: "meeting_requested", label: "Meeting requested" },
  { key: "not_interested", label: "Not interested" },
  { key: "snoozed", label: "Snoozed" },
  { key: "archived", label: "Archived" },
];

interface ListItem {
  id: string;
  leadId: string;
  channel: string;
  status: string;
  replyStatus: string;
  classification: string | null;
  classificationConfidence: number | null;
  unreadCount: number;
  assignedUserId: string | null;
  subject: string | null;
  lastMessageAt: string | null;
  snoozedUntil: string | null;
  contact: { fullName: string; title: string | null; email: string | null; linkedinUrl: string | null; xHandle: string | null };
  account: { name: string } | null;
  campaign: { id: string; name: string } | null;
  lastMessage: { preview: string; direction: string; at: string } | null;
  pendingDrafts: number;
}
interface Message {
  id: string;
  direction: "inbound" | "outbound";
  kind: string;
  subject: string | null;
  body: string;
  status: string;
  generatedBy: string;
  aiMeta: Record<string, unknown> | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}
interface Detail {
  id: string;
  channel: string;
  status: string;
  replyStatus: string;
  classification: string | null;
  classificationConfidence: number | null;
  assignedUserId: string | null;
  subject: string | null;
  snoozedUntil: string | null;
  lead: { id: string; status: string; stage: string; contact: { fullName: string; title: string | null; email: string | null; linkedinUrl: string | null; xHandle: string | null }; account: { name: string; domain: string | null } | null; research: { summary: { whyTheyMightNeedUs?: string; bestAngle?: string } | null }[]; scores: { kind: string; score: number }[] };
  campaign: { id: string; name: string; status: string } | null;
  senderAccount: { id: string; displayName: string; status: string } | null;
  messages: Message[];
  decisions: { id: string; decision: string; decidedVia: string; decidedAt: string }[];
  meetings: { id: string; scheduledAt: string; outcome: string }[];
  members: { id: string; name: string | null; email: string }[];
  campaigns: { id: string; name: string; status: string }[];
}

const CLASS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { interested: "default", question: "secondary", not_now: "secondary", not_interested: "destructive", out_of_office: "outline", wrong_person: "outline", unsubscribe: "destructive", bounce: "destructive", other: "outline" };
const CHANNEL_ICON = { email: Mail, linkedin: Briefcase, x: MessageCircle, manual: Inbox } as const;

export function InboxView({ slug, userId, canDecide, initialSelected, initialCounts, initialConversations }: { slug: string; userId: string; canDecide: boolean; initialSelected: string | null; initialCounts: Record<Filter, number>; initialConversations: ListItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ListItem[]>(initialConversations);
  const [counts, setCounts] = useState(initialCounts);
  const [selected, setSelected] = useState<string | null>(initialSelected ?? initialConversations[0]?.id ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pending, start] = useTransition();

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`/api/v1/w/${slug}/inbox${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
      return data;
    },
    [slug],
  );

  const reloadList = useCallback(async () => {
    const params = new URLSearchParams({ filter, limit: "50" });
    if (q.trim()) params.set("q", q.trim());
    const data = await api(`?${params.toString()}`);
    setItems(data.conversations);
    setCounts(data.counts);
  }, [api, filter, q]);

  const reloadDetail = useCallback(async () => {
    if (!selected) return;
    const data = await api(`/${selected}`);
    setDetail(data.conversation);
    api(`/${selected}/read`, { method: "POST" }).then(() => setItems((xs) => xs.map((x) => (x.id === selected ? { ...x, unreadCount: 0 } : x)))).catch(() => {});
  }, [api, selected]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reloadList();
      } catch (err) {
        if (!cancelled) toast.error((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadList]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reloadDetail();
      } catch (err) {
        if (!cancelled) toast.error((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadDetail]);
  // While a different conversation loads, show nothing rather than the previous one.
  const shown = selected && detail?.id === selected ? detail : null;

  const act = (fn: () => Promise<string | void>) =>
    start(async () => {
      try {
        const msg = await fn();
        if (msg) toast.success(msg);
        await Promise.all([reloadList(), reloadDetail()]);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs", filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>
              {f.label} <span className="opacity-70">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search people, companies, text…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inbox" />
        </div>
        <Card>
          <CardContent className="max-h-[70vh] overflow-auto p-0">
            {items.length === 0 ? (
              <div className="p-6"><EmptyState icon={Inbox} title="Nothing here" description={filter === "all" ? "Replies appear as soon as a connected mailbox or account receives one." : "No conversations match this filter."} /></div>
            ) : (
              <ul className="divide-y">
                {items.map((c) => {
                  const Icon = CHANNEL_ICON[c.channel as keyof typeof CHANNEL_ICON] ?? Inbox;
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => setSelected(c.id)} className={cn("w-full px-3 py-3 text-left hover:bg-muted/60", selected === c.id && "bg-muted")} data-testid="inbox-item">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            {c.unreadCount > 0 && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                            <span className={cn("truncate text-sm", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>{c.contact.fullName}</span>
                            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          </div>
                          {/* Relative times differ between server and client render; the client re-renders them after mount. */}
                          <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>{c.lastMessageAt ? formatDistanceToNow(new Date(c.lastMessageAt), { addSuffix: false }) : ""}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{[c.contact.title, c.account?.name].filter(Boolean).join(" · ")}</div>
                        <div className="mt-1 flex items-center gap-1">
                          {c.classification && <Badge variant={CLASS_VARIANT[c.classification] ?? "outline"} className="text-[10px]">{c.classification.replace(/_/g, " ")}</Badge>}
                          {c.pendingDrafts > 0 && <Badge variant="outline" className="gap-1 text-[10px]"><Bot className="size-3" /> draft</Badge>}
                          <span className="truncate text-xs text-muted-foreground">{c.lastMessage?.direction === "outbound" ? "You: " : ""}{c.lastMessage?.preview}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        {!shown ? (
          <Card><CardContent className="p-10"><EmptyState icon={Inbox} title={selected ? "Loading…" : "Select a conversation"} description="Pick a reply on the left to read the thread and decide what happens next." /></CardContent></Card>
        ) : (
          <ConversationPane key={shown.id} slug={slug} userId={userId} canDecide={canDecide} detail={shown} pending={pending} act={act} api={api} />
        )}
      </div>
    </div>
  );
}

function ConversationPane({ slug, userId, canDecide, detail, pending, act, api }: { slug: string; userId: string; canDecide: boolean; detail: Detail; pending: boolean; act: (fn: () => Promise<string | void>) => void; api: (path: string, init?: RequestInit) => Promise<Record<string, unknown> & { result?: { manual?: boolean } }> }) {
  const inbound = [...detail.messages].reverse().find((m) => m.direction === "inbound");
  const triage = (inbound?.aiMeta ?? null) as null | { classification?: string; confidence?: number; summary?: string; sentiment?: string; recommendedAction?: string; nextAction?: string; proposedTimes?: string[]; questions?: string[] };
  const draft = [...detail.messages].reverse().find((m) => m.direction === "outbound" && m.kind === "reply" && m.status === "awaiting_approval") ?? null;
  const [body, setBody] = useState(draft?.body ?? "");
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [draftKey, setDraftKey] = useState(draft?.id ?? null);
  // When the draft changes (sent, regenerated, dismissed) reset the editor to the new draft.
  if ((draft?.id ?? null) !== draftKey) {
    setDraftKey(draft?.id ?? null);
    setBody(draft?.body ?? "");
    setSubject(draft?.subject ?? "");
  }
  const [instructions, setInstructions] = useState("");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingAt, setMeetingAt] = useState("");
  const [sequenceId, setSequenceId] = useState("");
  const edited = draft ? body.trim() !== draft.body.trim() || (detail.channel === "email" && subject !== (draft.subject ?? "")) : body.trim().length > 0;
  const c = detail.lead.contact;
  const decide = (payload: Record<string, unknown>, success: string) =>
    act(async () => {
      const r = await api(`/${detail.id}/decide`, { method: "POST", body: JSON.stringify(payload) });
      return r.result?.manual ? "No connected sender for this channel: a manual task was created with the text." : success;
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/w/${slug}/leads/${detail.lead.id}`} className="text-base font-semibold hover:underline">{c.fullName}</Link>
              <Badge variant="outline">{detail.channel}</Badge>
              <Badge variant="secondary">{detail.lead.status.replace(/_/g, " ")}</Badge>
              {detail.status === "snoozed" && detail.snoozedUntil && <Badge variant="outline"><Clock className="mr-1 size-3" /> until {format(new Date(detail.snoozedUntil), "d MMM")}</Badge>}
            </div>
            <div className="text-sm text-muted-foreground">{[c.title, detail.lead.account?.name].filter(Boolean).join(" · ")}{detail.campaign ? ` · campaign: ${detail.campaign.name}` : ""}</div>
            {detail.lead.research[0]?.summary?.bestAngle && <div className="mt-1 text-xs text-muted-foreground">Angle: {detail.lead.research[0].summary.bestAngle}</div>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Select value={detail.assignedUserId ?? "unassigned"} onValueChange={(v) => act(async () => { await api(`/${detail.id}`, { method: "PATCH", body: JSON.stringify({ assignedUserId: v === "unassigned" ? null : v }) }); return "Assignee updated"; })}>
              <SelectTrigger className="w-[180px]" aria-label="Assignee"><SelectValue>{detail.assignedUserId ? (detail.members.find((m) => m.id === detail.assignedUserId)?.name ?? "Member") : "Unassigned"}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {detail.members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name ?? m.email}{m.id === userId ? " (you)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canDecide && (
              <>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => decide({ decision: "snooze", until: new Date(Date.now() + 3 * 86400_000).toISOString() }, "Snoozed for 3 days")}><Clock className="size-4" /> Snooze</Button>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => decide({ decision: "dismiss" }, "Archived")}><Archive className="size-4" /> Archive</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          {detail.messages.filter((m) => m.status !== "awaiting_approval").map((m) => (
            <div key={m.id} className={cn("max-w-[85%] rounded-lg border p-3 text-sm", m.direction === "inbound" ? "mr-auto bg-muted/50" : "ml-auto bg-primary/5")}>
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{m.direction === "inbound" ? c.fullName : "You"}</span>
                <span>{formatDistanceToNow(new Date(m.sentAt ?? m.receivedAt ?? m.createdAt), { addSuffix: true })}</span>
                {m.direction === "outbound" && <Badge variant="outline" className="text-[10px]">{m.status}{m.generatedBy === "ai" ? " · AI" : ""}</Badge>}
              </div>
              {m.subject && <div className="mb-1 font-medium">{m.subject}</div>}
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {triage?.classification && (
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Bot className="size-4 text-primary" />
              <span className="font-medium">AI triage</span>
              <Badge variant={CLASS_VARIANT[triage.classification] ?? "outline"}>{triage.classification.replace(/_/g, " ")}</Badge>
              <span className="text-xs text-muted-foreground">{Math.round((triage.confidence ?? 0) * 100)}% confidence · {triage.sentiment}</span>
            </div>
            <p>{triage.summary}</p>
            <p className="text-muted-foreground"><span className="font-medium text-foreground">Suggested next step:</span> {triage.nextAction} <Badge variant="outline" className="ml-1 text-[10px]">{triage.recommendedAction?.replace(/_/g, " ")}</Badge></p>
            {triage.proposedTimes && triage.proposedTimes.length > 0 && <p className="text-muted-foreground">Proposed times: {triage.proposedTimes.join("; ")}</p>}
            {triage.questions && triage.questions.length > 0 && <p className="text-muted-foreground">Questions asked: {triage.questions.join(" / ")}</p>}
          </CardContent>
        </Card>
      )}

      {canDecide && detail.status !== "archived" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{draft ? "AI draft (edit freely)" : "Your reply"}</span>
              {draft && <span className="text-xs text-muted-foreground">Nothing is sent until you press Send.</span>}
            </div>
            {detail.channel === "email" && <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" />}
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="Write a reply…" aria-label="Reply body" data-testid="reply-body" />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={pending || !body.trim()} onClick={() => decide(edited || !draft ? { decision: "edit_and_send", body, subject: detail.channel === "email" ? subject : undefined, draftMessageId: draft?.id } : { decision: "send", draftMessageId: draft.id }, "Reply sent")}>
                <Send className="size-4" /> Send
              </Button>
              <div className="flex items-center gap-1">
                <Input className="h-8 w-56" placeholder="Guidance for regeneration (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} aria-label="Regeneration guidance" />
                <Button variant="outline" size="sm" disabled={pending} onClick={() => act(async () => { await api(`/${detail.id}/draft`, { method: "POST", body: JSON.stringify({ instructions: instructions || undefined }) }); setInstructions(""); return "Draft regenerated"; })}>
                  <RefreshCw className="size-4" /> Regenerate
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button variant="outline" size="sm" disabled={pending} onClick={() => decide({ decision: "mark_interested" }, "Marked interested")}><ThumbsUp className="size-4" /> Interested</Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => decide({ decision: "mark_not_interested", stopSequences: true }, "Marked not interested; sequences stopped")}><ThumbsDown className="size-4" /> Not interested</Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setMeetingOpen(true)}><CalendarCheck className="size-4" /> Meeting booked</Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => decide({ decision: "booking_link" }, "Booking link sent")}><Link2 className="size-4" /> Send booking link</Button>
              <div className="flex items-center gap-1">
                <Select value={sequenceId} onValueChange={(v) => setSequenceId(v ?? "")}>
                  <SelectTrigger className="h-8 w-[200px]" aria-label="Campaign to enrol into"><SelectValue>{detail.campaigns.find((x) => x.id === sequenceId)?.name ?? "Start sequence…"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {detail.campaigns.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.name} ({x.status})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" disabled={pending || !sequenceId} onClick={() => decide({ decision: "start_sequence", campaignId: sequenceId }, "Enrolled")}><Play className="size-4" /></Button>
              </div>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={pending} onClick={() => confirm(`Suppress ${c.fullName} on every channel and stop all sequences?`) && decide({ decision: "opt_out" }, "Opted out and suppressed")}><UserMinus className="size-4" /> Opt out</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(detail.decisions.length > 0 || detail.meetings.length > 0) && (
        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground">
            {detail.meetings.map((m) => (
              <div key={m.id}>Meeting {m.outcome} · {format(new Date(m.scheduledAt), "d MMM yyyy HH:mm")}</div>
            ))}
            {detail.decisions.slice(0, 5).map((d) => (
              <div key={d.id}>{d.decision.replace(/_/g, " ")} · {d.decidedVia} · {formatDistanceToNow(new Date(d.decidedAt), { addSuffix: true })}</div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={meetingOpen} onOpenChange={setMeetingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log a booked meeting</DialogTitle>
            <DialogDescription>Marks the lead as meeting booked and records it for analytics.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="meeting-at">When</Label>
            <Input id="meeting-at" type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeetingOpen(false)}>Cancel</Button>
            <Button disabled={!meetingAt || pending} onClick={() => { setMeetingOpen(false); decide({ decision: "meeting_booked", scheduledAt: new Date(meetingAt).toISOString(), durationMin: 30 }, "Meeting logged"); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
