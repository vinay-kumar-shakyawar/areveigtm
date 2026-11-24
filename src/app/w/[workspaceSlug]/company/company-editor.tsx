"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { CompanyDraft } from "@/server/modules/company/schemas";

interface Entity {
  name: string;
  website?: string | null;
}
interface ProfileForm {
  companyName: string;
  website: string;
  description: string;
  productOrService: string;
  industry: string;
  businessModel: string;
  targetGeography: string[];
  targetCustomerType: string;
  valueProposition: string;
  competitors: Entity[];
  existingCustomers: Entity[];
  preferredChannels: ("email" | "linkedin" | "x")[];
  salesObjective: string;
  revision: number;
  approvedAt: string | null;
}

type Draft = CompanyDraft & { generatedAt?: string; provider?: string; model?: string };

export function CompanyEditor({ slug, canEdit, profile, draft, draftSources }: { slug: string; canEdit: boolean; profile: ProfileForm; draft: Draft | null; draftSources: { url: string; title: string | null }[] }) {
  const router = useRouter();
  const [form, setForm] = useState(profile);
  const [website, setWebsite] = useState(profile.website);
  const [analysing, setAnalysing] = useState(false);
  const [saving, startSave] = useTransition();
  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function api(path: string, init: RequestInit) {
    const res = await fetch(`/api/v1/w/${slug}/company${path}`, { ...init, headers: { "content-type": "application/json" } });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
    return data;
  }

  async function analyse() {
    if (!website.trim()) {
      toast.error("Enter your website first");
      return;
    }
    setAnalysing(true);
    try {
      await api("/draft", { method: "POST", body: JSON.stringify({ website }) });
      toast.success("Draft ready. Review it on the right.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAnalysing(false);
    }
  }

  function save(thenApprove = false) {
    startSave(async () => {
      try {
        const payload = { ...form, revision: undefined, approvedAt: undefined };
        const data = await api("", { method: "PATCH", body: JSON.stringify({ ...payload, website: website || null, expectedRevision: form.revision }) });
        setForm((f) => ({ ...f, revision: data.profile.revision, approvedAt: null }));
        if (thenApprove) {
          const approved = await api("/approve", { method: "POST" });
          setForm((f) => ({ ...f, approvedAt: approved.profile.approvedAt ?? new Date().toISOString() }));
          toast.success("Profile approved");
        } else toast.success("Saved");
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  function applyDraft(fields?: string[]) {
    startSave(async () => {
      try {
        await api("/draft", { method: "PUT", body: JSON.stringify({ fields }) });
        toast.success("Draft applied to the profile");
        router.refresh();
        // Pull the latest values into the form.
        const data = await api("", { method: "GET" });
        const p = data.profile;
        setForm({
          ...form,
          companyName: p.companyName ?? "",
          description: p.description ?? "",
          productOrService: p.productOrService ?? "",
          industry: p.industry ?? "",
          businessModel: p.businessModel ?? "",
          targetGeography: p.targetGeography ?? [],
          targetCustomerType: p.targetCustomerType ?? "",
          valueProposition: p.valueProposition ?? "",
          competitors: p.competitors ?? [],
          existingCustomers: p.existingCustomers ?? [],
          revision: p.revision,
          approvedAt: null,
        });
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Status</CardTitle>
              <CardDescription>AI features use the profile only after a human approves it.</CardDescription>
            </div>
            {form.approvedAt ? (
              <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                <CheckCircle2 className="size-3" /> Approved
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <AlertTriangle className="size-3" /> Not approved
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourcompany.com" disabled={!canEdit} />
            </div>
            <Button onClick={analyse} disabled={!canEdit || analysing} variant="secondary">
              <Sparkles className="size-4" /> {analysing ? "Analysing…" : "Analyse website with AI"}
            </Button>
          </CardContent>
        </Card>

        <fieldset disabled={!canEdit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" id="companyName" value={form.companyName} onChange={(v) => set("companyName", v)} />
              <Field label="Industry" id="industry" value={form.industry} onChange={(v) => set("industry", v)} />
              <Field label="Business model" id="businessModel" value={form.businessModel} onChange={(v) => set("businessModel", v)} placeholder="B2B SaaS, agency, marketplace…" />
              <Field label="Target customer type" id="targetCustomerType" value={form.targetCustomerType} onChange={(v) => set("targetCustomerType", v)} placeholder="Heads of marketing at D2C brands" />
              <ListField key={`geo-${form.revision}`} label="Target geography" value={form.targetGeography} onChange={(v) => set("targetGeography", v)} placeholder="UAE, Saudi Arabia, UK" />
              <div className="space-y-2">
                <Label>Preferred channels</Label>
                <div className="flex gap-4 pt-2">
                  {(["email", "linkedin", "x"] as const).map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm capitalize">
                      <Checkbox checked={form.preferredChannels.includes(c)} onCheckedChange={(v) => set("preferredChannels", v ? [...form.preferredChannels, c] : form.preferredChannels.filter((x) => x !== c))} />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Positioning</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Area label="Company description" id="description" value={form.description} onChange={(v) => set("description", v)} rows={4} />
              <Area label="Product or service" id="productOrService" value={form.productOrService} onChange={(v) => set("productOrService", v)} rows={3} />
              <Area label="Main value proposition" id="valueProposition" value={form.valueProposition} onChange={(v) => set("valueProposition", v)} rows={3} />
              <Area label="Sales objective" id="salesObjective" value={form.salesObjective} onChange={(v) => set("salesObjective", v)} rows={2} placeholder="e.g. Book 20 qualified demos a month with mid-market retailers in the GCC" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Market</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <ListField key={`comp-${form.revision}`} label="Main competitors" value={form.competitors.map((c) => c.name)} onChange={(v) => set("competitors", v.map((name) => form.competitors.find((c) => c.name === name) ?? { name }))} placeholder="Competitor names, comma separated" />
              <ListField key={`cust-${form.revision}`} label="Existing customers" value={form.existingCustomers.map((c) => c.name)} onChange={(v) => set("existingCustomers", v.map((name) => form.existingCustomers.find((c) => c.name === name) ?? { name }))} placeholder="Customers you can name" />
            </CardContent>
          </Card>
        </fieldset>
        {canEdit && (
          <div className="flex gap-2">
            <Button onClick={() => save(false)} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button onClick={() => save(true)} disabled={saving} variant="secondary">
              Save and approve
            </Button>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI draft</CardTitle>
            <CardDescription>{draft ? `Generated ${draft.generatedAt ? new Date(draft.generatedAt).toLocaleString() : ""}${draft.provider ? ` with ${draft.provider}` : ""}. Nothing is saved until you apply it.` : "Analyse your website to get a grounded draft here."}</CardDescription>
          </CardHeader>
          {draft && (
            <CardContent className="space-y-3 text-sm">
              <DraftRow label="Name" value={draft.companyName} />
              <DraftRow label="Description" value={draft.description} />
              <DraftRow label="Product" value={draft.productOrService} />
              <DraftRow label="Industry" value={draft.industry} />
              <DraftRow label="Model" value={draft.businessModel} />
              <DraftRow label="Geography" value={draft.targetGeography?.join(", ")} />
              <DraftRow label="Buyer" value={draft.targetCustomerType} />
              <DraftRow label="Value prop" value={draft.valueProposition} />
              <DraftRow label="Competitors" value={draft.competitors?.map((c) => c.name).join(", ")} />
              <DraftRow label="Customers" value={draft.existingCustomers?.map((c) => c.name).join(", ")} />
              {draft.notes && <p className="rounded bg-muted p-2 text-xs text-muted-foreground">{draft.notes}</p>}
              {draft.evidence?.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Evidence ({draft.evidence.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {draft.evidence.map((e, i) => (
                      <li key={i}>
                        <span className="font-medium">{e.field}:</span> “{e.quote}”{" "}
                        <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                          source
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {draftSources.length > 0 && <p className="text-xs text-muted-foreground">Pages read: {draftSources.map((s) => s.url).join(", ")}</p>}
              {canEdit && (
                <Button className="w-full" onClick={() => applyDraft()} disabled={saving}>
                  Use this draft
                </Button>
              )}
            </CardContent>
          )}
        </Card>
      </aside>
    </div>
  );
}

function Field({ label, id, value, onChange, placeholder }: { label: string; id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Area({ label, id, value, onChange, rows, placeholder }: { label: string; id: string; value: string; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} />
    </div>
  );
}

export function ListField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }}
      />
      <p className="text-xs text-muted-foreground">Comma separated.</p>
    </div>
  );
}

function DraftRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={value ? "" : "italic text-muted-foreground"}>{value || "not found"}</div>
    </div>
  );
}
