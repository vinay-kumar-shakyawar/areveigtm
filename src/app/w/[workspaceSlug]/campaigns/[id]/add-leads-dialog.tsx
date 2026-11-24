"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface LeadRow {
  id: string;
  status: string;
  contact: { fullName: string; title: string | null; email: string | null; linkedinUrl: string | null; xHandle: string | null; companyNameRaw: string | null };
  account: { name: string } | null;
  _count: { campaignLeads: number };
}

export function AddLeadsDialog({ slug, campaignId, icpProfileId, senders, disabled, onDone }: { slug: string; campaignId: string; icpProfileId: string | null; senders: { id: string; channel: string; displayName: string; provider: string }[]; disabled?: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [onlyIcp, setOnlyIcp] = useState(Boolean(icpProfileId));
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sender, setSender] = useState<string>(senders[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ limit: "100", ...(q ? { q } : {}), ...(onlyIcp && icpProfileId ? { icpProfileId } : {}) });
      const res = await fetch(`/api/v1/w/${slug}/leads?${qs}`, { signal: controller.signal });
      if (res.ok) setRows(((await res.json()) as { items: LeadRow[] }).items);
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [open, q, onlyIcp, icpProfileId, slug]);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/w/${slug}/campaigns/${campaignId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "enroll", leadIds: [...selected], senderAccountId: sender || null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Could not add leads");
      const r = data.result as { added: string[]; skipped: { reason: string }[] };
      toast.success(`Added ${r.added.length}${r.skipped.length ? `, skipped ${r.skipped.length} (${[...new Set(r.skipped.map((s) => s.reason))].join("; ")})` : ""}`);
      setOpen(false);
      setSelected(new Set());
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={disabled} />}>
        <Plus className="size-4" /> Add leads
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add leads to this campaign</DialogTitle>
          <DialogDescription>People already in this campaign, opted out, suppressed or active elsewhere are skipped automatically.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads" className="max-w-xs" />
          {icpProfileId && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={onlyIcp} onCheckedChange={(v) => setOnlyIcp(Boolean(v))} /> Only this campaign&apos;s ICP
            </label>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(rows.map((r) => r.id)))}>
            Select all ({rows.length})
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No leads match. Import or search for leads first.</p>
          ) : (
            <ul className="divide-y text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; })} aria-label={`Select ${r.contact.fullName}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.contact.fullName}</div>
                    <div className="truncate text-xs text-muted-foreground">{[r.contact.title, r.account?.name ?? r.contact.companyNameRaw].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex gap-1">
                    {r.contact.email && <Badge variant="outline">email</Badge>}
                    {r.contact.linkedinUrl && <Badge variant="outline">li</Badge>}
                    {r.contact.xHandle && <Badge variant="outline">x</Badge>}
                    {r._count.campaignLeads > 0 && <Badge variant="secondary">in {r._count.campaignLeads}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="sender">Send from</Label>
          <select id="sender" value={sender} onChange={(e) => setSender(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Any connected account per channel (manual task if none)</option>
            {senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName} · {s.channel} ({s.provider})
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || selected.size === 0}>
            {busy ? "Adding…" : `Add ${selected.size} lead${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
