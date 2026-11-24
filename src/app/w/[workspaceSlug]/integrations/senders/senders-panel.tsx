"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Mail, Briefcase, MessageCircle, Plus, RefreshCw, ShieldCheck, Trash2, XCircle, AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/empty-state";

interface DomainAuth {
  domain: string;
  checkedAt: string;
  spf: { status: string; record?: string };
  dmarc: { status: string; policy?: string };
  dkim: { status: string; selectors: string[]; source: string };
  mx: { status: string; hosts?: string[] };
  providerVerified?: boolean | null;
}
interface Sender {
  id: string;
  channel: "email" | "linkedin" | "x";
  provider: string;
  displayName: string;
  handle: string | null;
  externalAccountId: string | null;
  status: string;
  health: unknown;
  limits: unknown;
  timezone: string | null;
  integration: { id: string; provider: string; label: string | null; category: string; healthStatus: string } | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  sentToday: number;
  mailbox: { id: string; emailAddress: string; provider: string; fromName: string | null; replyTo: string | null; domain: string | null; domainAuth: unknown; dailyLimit: number; warmupEnabled: boolean; inboundMode: string; lastInboundSyncAt: string | null; verificationState: string } | null;
}
interface IntegrationOpt {
  id: string;
  provider: string;
  label: string | null;
  category?: string;
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = { connected: "default", pending: "secondary", disconnected: "outline", limited: "secondary", error: "destructive" };
const INBOUND_LABEL: Record<string, string> = { imap_poll: "IMAP polling", webhook: "Provider webhook", graph_subscription: "Microsoft Graph", graph_poll: "Microsoft Graph polling", gmail_api: "Gmail API polling", none: "No reply tracking" };

export function SendersPanel({
  slug,
  canManage,
  userEmail,
  appBaseUrl,
  flash,
  oauth,
  emailIntegrations,
  linkedinIntegrations,
  senders,
}: {
  slug: string;
  canManage: boolean;
  userEmail: string;
  appBaseUrl: string;
  flash: { oauth: string | null; connected: boolean; error: string | null; linkedin: string | null };
  oauth: { google: boolean; microsoft: boolean; x: boolean };
  emailIntegrations: IntegrationOpt[];
  linkedinIntegrations: IntegrationOpt[];
  senders: Sender[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<Sender | null>(null);
  const [editing, setEditing] = useState<Sender | null>(null);
  const [report, setReport] = useState<{ sender: Sender; report: DomainAuth } | null>(null);

  useEffect(() => {
    if (flash.connected) toast.success(`${flash.oauth} account connected`);
    else if (flash.error) toast.error(`Connection failed: ${flash.error.replace(/_/g, " ")}`);
    if (flash.linkedin === "connected") toast.success("LinkedIn linked. It appears below once the provider confirms.");
    if (flash.linkedin === "failed") toast.error("LinkedIn connection failed or was cancelled.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(path: string, init: RequestInit = {}) {
    const res = await fetch(`/api/v1/w/${slug}${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
    return data;
  }
  const act = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });

  const email = senders.filter((s) => s.channel === "email");
  const linkedin = senders.filter((s) => s.channel === "linkedin");
  const x = senders.filter((s) => s.channel === "x");

  return (
    <>
      <Tabs defaultValue="email">
        <TabsList>
          <TabsTrigger value="email">Email ({email.length})</TabsTrigger>
          <TabsTrigger value="linkedin">LinkedIn ({linkedin.length})</TabsTrigger>
          <TabsTrigger value="x">X ({x.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="space-y-4">
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAdding(true)} disabled={emailIntegrations.length === 0}>
                <Plus className="size-4" /> Add email sender
              </Button>
              <Button variant="outline" render={<a href={`/api/oauth/google/start?workspace=${slug}`} />} nativeButton={false} disabled={!oauth.google} title={oauth.google ? undefined : "Set GOOGLE_OAUTH_CLIENT_ID/SECRET on the server"}>
                Connect Gmail
              </Button>
              <Button variant="outline" render={<a href={`/api/oauth/microsoft/start?workspace=${slug}`} />} nativeButton={false} disabled={!oauth.microsoft} title={oauth.microsoft ? undefined : "Set MICROSOFT_OAUTH_CLIENT_ID/SECRET on the server"}>
                Connect Microsoft 365
              </Button>
            </div>
          )}
          {emailIntegrations.length === 0 && canManage && <p className="text-sm text-muted-foreground">Add an email provider (Resend, SendGrid, Amazon SES or an SMTP mailbox) under Integrations first, or connect Gmail / Microsoft 365 directly.</p>}
          {email.length === 0 ? (
            <EmptyState icon={Mail} title="No email senders yet" description="Campaign email steps become manual tasks until a sender is connected." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Today</TableHead>
                      <TableHead>Replies</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {email.map((s) => {
                      const auth = s.mailbox?.domainAuth as DomainAuth | null;
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="font-medium">{s.mailbox?.emailAddress}</div>
                            <div className="text-xs text-muted-foreground">{s.mailbox?.fromName || s.displayName}</div>
                          </TableCell>
                          <TableCell className="text-sm">{s.provider}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_BADGE[s.status] ?? "secondary"}>{s.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.mailbox?.verificationState === "verified" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600"><ShieldCheck className="size-4" /> Verified</span>
                            ) : auth ? (
                              <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="size-4" /> SPF {auth.spf.status} · DKIM {auth.dkim.status}</span>
                            ) : (
                              <span className="text-muted-foreground">Not checked</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.sentToday} / {s.mailbox?.dailyLimit}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {INBOUND_LABEL[s.mailbox?.inboundMode ?? "none"]}
                            {s.mailbox?.lastInboundSyncAt ? <div>synced {formatDistanceToNow(new Date(s.mailbox.lastInboundSyncAt), { addSuffix: true })}</div> : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage && (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" title="Check SPF / DKIM / DMARC" disabled={pending} onClick={() => act(async () => { const r = await call(`/senders/${s.id}/domain-check`, { method: "POST" }); setReport({ sender: s, report: r.report }); })}>
                                  <ShieldCheck className="size-4" />
                                </Button>
                                <Button size="sm" variant="ghost" title="Send test email" disabled={pending} onClick={() => setTesting(s)}>
                                  <Send className="size-4" />
                                </Button>
                                {s.mailbox && s.mailbox.inboundMode !== "none" && s.mailbox.inboundMode !== "webhook" && (
                                  <Button size="sm" variant="ghost" title="Sync inbox now" disabled={pending} onClick={() => act(async () => { const r = await call(`/senders/${s.id}/sync`, { method: "POST" }); toast.success(`Fetched ${r.result.fetched}, new replies ${r.result.created}`); })}>
                                    <RefreshCw className="size-4" />
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" title="Edit" disabled={pending} onClick={() => setEditing(s)}>
                                  Edit
                                </Button>
                                <Button size="sm" variant="ghost" title="Remove" disabled={pending} onClick={() => { if (confirm(`Remove ${s.mailbox?.emailAddress}?`)) act(async () => { await call(`/senders/${s.id}`, { method: "DELETE" }); toast.success("Sender removed"); }); }}>
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivery webhooks</CardTitle>
              <CardDescription>Point your provider&apos;s event webhook at these URLs so bounces, complaints and deliveries flow back. Each URL is bound to one integration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {emailIntegrations.filter((i) => ["resend", "sendgrid", "ses"].includes(i.provider)).length === 0 && <p className="text-muted-foreground">No Resend, SendGrid or SES integration yet.</p>}
              {emailIntegrations
                .filter((i) => ["resend", "sendgrid", "ses"].includes(i.provider))
                .map((i) => (
                  <div key={i.id} className="flex flex-col gap-1 rounded-md border p-2 md:flex-row md:items-center md:justify-between">
                    <span className="font-medium">{i.provider}{i.label ? ` · ${i.label}` : ""}</span>
                    <code className="break-all rounded bg-muted px-1 text-xs">{appBaseUrl}/api/webhooks/{i.provider}/{i.id}</code>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="linkedin" className="space-y-4">
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={linkedinIntegrations.length === 0 || pending} onClick={() => act(async () => { const r = await call(`/senders/linkedin/connect`, { method: "POST", body: JSON.stringify({}) }); if (r.url) window.location.href = r.url; else toast.success("Mock LinkedIn sender connected"); })}>
                <Briefcase className="size-4" /> Connect LinkedIn account
              </Button>
              <Button variant="outline" disabled={linkedinIntegrations.length === 0 || pending} onClick={() => act(async () => { const r = await call(`/senders/linkedin/sync`, { method: "POST" }); toast.success(`Synced ${r.synced} account(s)`); })}>
                <RefreshCw className="size-4" /> Sync accounts
              </Button>
              <Button variant="outline" disabled={linkedinIntegrations.length === 0 || pending} onClick={() => act(async () => { const r = await call(`/senders/linkedin/webhooks`, { method: "POST", body: JSON.stringify({}) }); if (r.registered) toast.success("Provider webhooks registered"); else toast.info(r.reason); })}>
                Register reply webhooks
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            LinkedIn runs only through an authorized messaging provider (Unipile). Each team member links their own account on the provider&apos;s hosted page; AREVEI never asks for LinkedIn passwords or cookies. Limits default to the workspace daily caps with a 5 / 7 / 10 / 15 / 16 / 20 invitation warm-up.
            {linkedinIntegrations.length === 0 && " Add a LinkedIn provider under Integrations first."}
          </p>
          {linkedin.length === 0 ? (
            <EmptyState icon={Briefcase} title="No LinkedIn accounts" description="LinkedIn steps become manual tasks until an account is connected." />
          ) : (
            <SimpleSenderTable senders={linkedin} canManage={canManage} pending={pending} onSync={(s) => act(async () => { const r = await call(`/senders/${s.id}/sync`, { method: "POST" }); toast.success(`Fetched ${r.result.fetched}, new replies ${r.result.created}`); })} onRemove={(s) => act(async () => { await call(`/senders/${s.id}`, { method: "DELETE" }); })} onEdit={setEditing} />
          )}
        </TabsContent>

        <TabsContent value="x" className="space-y-4">
          {canManage && (
            <Button render={<a href={`/api/oauth/x/start?workspace=${slug}`} />} nativeButton={false} disabled={!oauth.x} title={oauth.x ? undefined : "Set X_CLIENT_ID (and X_CLIENT_SECRET) on the server"}>
              <MessageCircle className="size-4" /> Connect X account
            </Button>
          )}
          <p className="text-sm text-muted-foreground">X DMs go through the official X API v2 with OAuth 2.0 (scopes: users.read, dm.write, dm.read, follows.read). Your X developer project must have DM access.</p>
          {x.length === 0 ? <EmptyState icon={MessageCircle} title="No X accounts" description="X steps become manual tasks until an account is connected." /> : <SimpleSenderTable senders={x} canManage={canManage} pending={pending} onRemove={(s) => act(async () => { await call(`/senders/${s.id}`, { method: "DELETE" }); })} onEdit={setEditing} />}
        </TabsContent>
      </Tabs>

      <AddEmailSenderDialog open={adding} onOpenChange={setAdding} integrations={emailIntegrations} pending={pending} onSubmit={(body) => act(async () => { await call(`/senders`, { method: "POST", body: JSON.stringify(body) }); setAdding(false); toast.success("Sender added"); })} />
      <TestEmailDialog sender={testing} defaultTo={userEmail} pending={pending} onOpenChange={(o) => !o && setTesting(null)} onSubmit={(to) => act(async () => { const r = await call(`/senders/${testing!.id}/test`, { method: "POST", body: JSON.stringify({ to }) }); if (r.result.ok) toast.success(`Test email accepted by ${testing!.provider} (${r.result.latencyMs} ms)`); else toast.error(`Send failed: ${r.result.error}`); setTesting(null); })} />
      <EditSenderDialog sender={editing} pending={pending} onOpenChange={(o) => !o && setEditing(null)} onSubmit={(body) => act(async () => { await call(`/senders/${editing!.id}`, { method: "PATCH", body: JSON.stringify(body) }); setEditing(null); toast.success("Saved"); })} />
      <Dialog open={Boolean(report)} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Domain authentication · {report?.report.domain}</DialogTitle>
            <DialogDescription>Checked {report ? formatDistanceToNow(new Date(report.report.checkedAt), { addSuffix: true }) : ""}. DNS can take time to propagate.</DialogDescription>
          </DialogHeader>
          {report && (
            <div className="space-y-2 text-sm">
              <AuthRow label="SPF" ok={report.report.spf.status === "pass"} detail={report.report.spf.record ?? report.report.spf.status} />
              <AuthRow label="DKIM" ok={report.report.dkim.status === "pass"} detail={report.report.dkim.status === "pass" ? (report.report.dkim.source === "provider" ? "Verified by provider" : `Selectors: ${report.report.dkim.selectors.join(", ")}`) : "No DKIM record found for common selectors. Your provider may use a custom selector."} />
              <AuthRow label="DMARC" ok={report.report.dmarc.status === "pass"} detail={report.report.dmarc.status === "pass" ? `Policy: ${report.report.dmarc.policy ?? "none"}` : "Missing. Publish a _dmarc TXT record (p=none to start)."} />
              <AuthRow label="MX" ok={report.report.mx.status === "pass"} detail={report.report.mx.hosts?.join(", ") ?? report.report.mx.status} />
              {report.report.providerVerified !== null && report.report.providerVerified !== undefined && <AuthRow label="Provider" ok={report.report.providerVerified} detail={report.report.providerVerified ? "Domain verified with the sending provider" : "Domain not verified with the sending provider"} />}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AuthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border p-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 text-amber-600" />}
      <div>
        <div className="font-medium">{label}</div>
        <div className="break-all text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function SimpleSenderTable({ senders, canManage, pending, onSync, onRemove, onEdit }: { senders: Sender[]; canManage: boolean; pending: boolean; onSync?: (s: Sender) => void; onRemove: (s: Sender) => void; onEdit: (s: Sender) => void }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Today</TableHead>
              <TableHead>Limits</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {senders.map((s) => {
              const limits = (s.limits as Record<string, unknown> | null) ?? {};
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.displayName}</div>
                    <div className="text-xs text-muted-foreground">{s.handle ?? s.externalAccountId}</div>
                  </TableCell>
                  <TableCell className="text-sm">{s.provider}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[s.status] ?? "secondary"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{s.sentToday}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {Object.entries(limits)
                      .filter(([k]) => k !== "warmup")
                      .map(([k, v]) => `${k.replace(/PerDay$/, "/day")}: ${String(v)}`)
                      .join(" · ") || "workspace defaults"}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        {onSync && (
                          <Button size="sm" variant="ghost" title="Sync inbox now" disabled={pending} onClick={() => onSync(s)}>
                            <RefreshCw className="size-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onEdit(s)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" title="Remove" disabled={pending} onClick={() => confirm(`Remove ${s.displayName}?`) && onRemove(s)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AddEmailSenderDialog({ open, onOpenChange, integrations, pending, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; integrations: IntegrationOpt[]; pending: boolean; onSubmit: (body: Record<string, unknown>) => void }) {
  const [integrationId, setIntegrationId] = useState(integrations[0]?.id ?? "");
  const [emailAddress, setEmailAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [dailyLimit, setDailyLimit] = useState("40");
  const selected = integrations.find((i) => i.id === integrationId);
  const label = (i: IntegrationOpt | undefined) => (i ? `${i.provider}${i.label ? ` · ${i.label}` : ""}` : "");
  // Only OAuth / SMTP mailboxes carry their own address; API providers and the mock need one typed in.
  const needsAddress = !(selected?.category === "mailbox" && ["smtp_imap", "google", "microsoft"].includes(selected.provider));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add email sender</DialogTitle>
          <DialogDescription>Choose the integration that will deliver the mail and the address it sends from.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Integration</Label>
            <Select value={integrationId} onValueChange={(v) => setIntegrationId(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Choose…">{label(selected) || "Choose…"}</SelectValue></SelectTrigger>
              <SelectContent>
                {integrations.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{label(i)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsAddress ? (
            <div className="space-y-1">
              <Label htmlFor="sender-email">From address</Label>
              <Input id="sender-email" type="email" placeholder="you@yourdomain.com" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} />
              <p className="text-xs text-muted-foreground">The domain must be verified with the provider.</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">The mailbox address stored in the integration will be used.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sender-from-name">From name</Label>
              <Input id="sender-from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Sam at AREVEI" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sender-reply-to">Reply-to (optional)</Label>
              <Input id="sender-reply-to" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sender-limit">Daily limit</Label>
            <Input id="sender-limit" type="number" min={1} max={2000} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || !integrationId || (needsAddress && !emailAddress)} onClick={() => onSubmit({ integrationId, emailAddress: needsAddress ? emailAddress : undefined, fromName: fromName || undefined, replyTo: replyTo || undefined, dailyLimit: Number(dailyLimit) || 40 })}>
            Add sender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestEmailDialog({ sender, defaultTo, pending, onOpenChange, onSubmit }: { sender: Sender | null; defaultTo: string; pending: boolean; onOpenChange: (o: boolean) => void; onSubmit: (to: string) => void }) {
  const [to, setTo] = useState(defaultTo);
  return (
    <Dialog open={Boolean(sender)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>Sends one real email from {sender?.mailbox?.emailAddress} through {sender?.provider}. This uses your provider quota.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="test-to">Send to</Label>
          <Input id="test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || !to} onClick={() => onSubmit(to)}>Send test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSenderDialog({ sender, pending, onOpenChange, onSubmit }: { sender: Sender | null; pending: boolean; onOpenChange: (o: boolean) => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [dailyLimit, setDailyLimit] = useState("40");
  const [status, setStatus] = useState("connected");
  const [key, setKey] = useState<string | null>(null);
  if (sender && key !== sender.id) {
    setKey(sender.id);
    setDisplayName(sender.displayName);
    setFromName(sender.mailbox?.fromName ?? "");
    setReplyTo(sender.mailbox?.replyTo ?? "");
    setDailyLimit(String(sender.mailbox?.dailyLimit ?? 40));
    setStatus(sender.status === "connected" ? "connected" : "disconnected");
  }
  return (
    <Dialog open={Boolean(sender)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit sender</DialogTitle>
          <DialogDescription>Pausing a sender stops the engine from using it; enrolled leads become manual tasks or wait.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="edit-display">Display name</Label>
            <Input id="edit-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          {sender?.mailbox && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-from">From name</Label>
                  <Input id="edit-from" value={fromName} onChange={(e) => setFromName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-reply">Reply-to</Label>
                  <Input id="edit-reply" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-limit">Daily limit</Label>
                <Input id="edit-limit" type="number" min={1} max={2000} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "connected")}>
              <SelectTrigger><SelectValue>{status === "connected" ? "Active" : "Paused"}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="connected">Active</SelectItem>
                <SelectItem value="disconnected">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending} onClick={() => onSubmit({ displayName, status, ...(sender?.mailbox ? { fromName: fromName || null, replyTo: replyTo || null, dailyLimit: Number(dailyLimit) || 40 } : {}) })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
