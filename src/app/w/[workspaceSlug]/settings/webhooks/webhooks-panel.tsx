"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Copy, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";

interface Subscription {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  disabledAt: string | null;
  failureCount: number;
  createdAt: string;
  deliveries: Record<string, number>;
}
interface Delivery {
  id: string;
  eventId: string;
  event: string;
  attempt: number;
  status: string;
  responseStatus: number | null;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export function WebhooksPanel({ slug, events, subscriptions }: { slug: string; events: readonly string[]; subscriptions: Subscription[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);
  const [deliveries, setDeliveries] = useState<{ sub: Subscription; rows: Delivery[] } | null>(null);

  async function call(path: string, init: RequestInit = {}) {
    const res = await fetch(`/api/v1/w/${slug}/webhooks${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
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

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Add endpoint
        </Button>
      </div>
      {subscriptions.length === 0 ? (
        <EmptyState icon={Webhook} title="No webhook endpoints" description="Receive signed POSTs for replies, sends, bounces and unsubscribes." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Deliveries</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="max-w-[320px] truncate font-mono text-xs" title={s.url}>{s.url}</div>
                      {s.disabledAt && <div className="text-xs text-destructive">Disabled after repeated failures {formatDistanceToNow(new Date(s.disabledAt), { addSuffix: true })}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex max-w-[280px] flex-wrap gap-1">
                        {s.events.map((e) => (
                          <Badge key={e} variant="outline">{e}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch checked={s.enabled} disabled={pending} onCheckedChange={(v) => act(async () => { await call(`/${s.id}`, { method: "PATCH", body: JSON.stringify({ enabled: v }) }); })} aria-label="Toggle endpoint" />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Object.entries(s.deliveries).map(([k, v]) => `${k}: ${v}`).join(" · ") || "none yet"}
                      {s.failureCount > 0 && <div className="text-amber-600">{s.failureCount} consecutive failures</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Send test event" disabled={pending} onClick={() => act(async () => { const r = await call(`/${s.id}/test`, { method: "POST" }); if (r.delivery?.status === "delivered") toast.success(`Delivered (HTTP ${r.delivery.responseStatus})`); else toast.error(`Not delivered: ${r.delivery?.lastError ?? "unknown"}. Retries are scheduled.`); })}>
                          <Send className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title="View deliveries" disabled={pending} onClick={() => act(async () => { const r = await call(`/${s.id}/deliveries`); setDeliveries({ sub: s, rows: r.deliveries }); })}>
                          Log
                        </Button>
                        <Button size="sm" variant="ghost" title="Rotate secret" disabled={pending} onClick={() => confirm("Rotate the signing secret? Your receiver must be updated.") && act(async () => { const r = await call(`/${s.id}/rotate`, { method: "POST" }); setSecret({ url: s.url, secret: r.secret }); })}>
                          <RefreshCw className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Delete" disabled={pending} onClick={() => confirm("Delete this endpoint?") && act(async () => { await call(`/${s.id}`, { method: "DELETE" }); })}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Verifying signatures</CardTitle>
          <CardDescription>Every delivery carries <code className="rounded bg-muted px-1">X-Arevei-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code> where v1 = HMAC-SHA256(secret, t + &quot;.&quot; + rawBody). Reject timestamps older than 5 minutes. Failed deliveries retry after 1s, 4s, 60s and then with growing delays up to 10 attempts.</CardDescription>
        </CardHeader>
      </Card>

      <CreateDialog open={creating} events={events} pending={pending} onOpenChange={setCreating} onSubmit={(body) => act(async () => { const r = await call("", { method: "POST", body: JSON.stringify(body) }); setCreating(false); setSecret({ url: r.subscription.url, secret: r.subscription.secret }); })} />

      <Dialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signing secret</DialogTitle>
            <DialogDescription>Copy it now. It is stored encrypted and will not be shown again.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted p-2 text-xs" data-testid="webhook-secret">{secret?.secret}</code>
            <Button size="icon" variant="outline" aria-label="Copy secret" onClick={() => { navigator.clipboard.writeText(secret?.secret ?? ""); toast.success("Copied"); }}>
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deliveries)} onOpenChange={(o) => !o && setDeliveries(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Recent deliveries</DialogTitle>
            <DialogDescription className="truncate">{deliveries?.sub.url}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {deliveries?.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing delivered yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempt</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries?.rows.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs">{d.event}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === "delivered" ? "default" : d.status === "pending" ? "secondary" : "destructive"}>{d.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{d.attempt}</TableCell>
                      <TableCell className="text-xs">{d.responseStatus ?? "—"}{d.lastError ? ` · ${d.lastError}` : ""}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateDialog({ open, events, pending, onOpenChange, onSubmit }: { open: boolean; events: readonly string[]; pending: boolean; onOpenChange: (o: boolean) => void; onSubmit: (body: { url: string; events: string[] }) => void }) {
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>(["reply.received", "message.sent", "lead.unsubscribed", "email.bounced"]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add webhook endpoint</DialogTitle>
          <DialogDescription>An HTTPS URL that accepts JSON POSTs.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wh-url">URL</Label>
            <Input id="wh-url" placeholder="https://example.com/hooks/arevei" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Events</Label>
            <div className="grid grid-cols-2 gap-2">
              {events.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selected.includes(e)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, e] : s.filter((x) => x !== e)))} />
                  {e}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || !url || selected.length === 0} onClick={() => onSubmit({ url, events: selected })}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
