"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SearchCriteriaV1 } from "@/server/modules/discovery/service";

interface Icp {
  id: string;
  name: string;
  criteria: SearchCriteriaV1;
}
interface Provider {
  id: string;
  name: string;
  source: string;
  canEstimate: boolean;
}

const EMPTY: SearchCriteriaV1 = {
  version: 1,
  titles: [],
  excludeTitles: [],
  seniorities: [],
  functions: [],
  industries: [],
  locations: [],
  countries: [],
  companyNames: [],
  companyDomains: [],
  excludeCompanyDomains: [],
  companySizeMin: null,
  companySizeMax: null,
  technologies: [],
  keywords: [],
  semanticQuery: null,
};

function requestId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SearchWizard({ slug, providers, icps, preselectIcpId }: { slug: string; providers: Provider[]; icps: Icp[]; preselectIcpId: string | null }) {
  const router = useRouter();
  const initialIcp = icps.find((i) => i.id === preselectIcpId) ?? null;
  const [icpId, setIcpId] = useState<string>(initialIcp?.id ?? "");
  const [name, setName] = useState(initialIcp ? `${initialIcp.name} search` : "New search");
  const [criteria, setCriteria] = useState<SearchCriteriaV1>(initialIcp?.criteria ?? EMPTY);
  const [provider, setProvider] = useState(providers[0]?.id ?? "");
  const [count, setCount] = useState(25);
  const [preview, setPreview] = useState<{ totalEstimate?: number; estimatedCostCents?: number; creditsPerRecord?: number; note?: string } | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "creating" | "previewing" | "running">("idle");
  const set = <K extends keyof SearchCriteriaV1>(k: K, v: SearchCriteriaV1[K]) => {
    setCriteria((c) => ({ ...c, [k]: v }));
    setSearchId(null);
    setPreview(null);
  };

  async function api(path: string, body: unknown) {
    const res = await fetch(`/api/v1/w/${slug}/searches${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
    return data;
  }

  async function ensureSearch(): Promise<string> {
    if (searchId) return searchId;
    const data = await api("", { name, icpProfileId: icpId || null, criteria, requestedCount: count, provider, requestId: requestId("search") });
    setSearchId(data.search.id);
    return data.search.id;
  }

  async function doPreview() {
    setBusy("previewing");
    try {
      const id = await ensureSearch();
      const data = await api(`/${id}`, { action: "preview" });
      setPreview(data.search.preview);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy("idle");
    }
  }

  async function doRun() {
    setBusy("running");
    try {
      const id = await ensureSearch();
      await api(`/${id}`, { action: "run", requestId: requestId("run") });
      toast.success("Search started");
      router.push(`/w/${slug}/leads/searches/${id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy("idle");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start from an ICP</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="icp">ICP</Label>
              <select
                id="icp"
                value={icpId}
                onChange={(e) => {
                  const next = icps.find((i) => i.id === e.target.value) ?? null;
                  setIcpId(e.target.value);
                  if (next) {
                    setCriteria(next.criteria);
                    setName(`${next.name} search`);
                  }
                  setSearchId(null);
                  setPreview(null);
                }}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">No ICP (manual filters)</option>
                {icps.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Search name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>Adjust what the provider is asked for. Provider support varies; unsupported filters are ignored by that provider.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Chips label="Job titles" value={criteria.titles} onChange={(v) => set("titles", v)} />
            <Chips label="Exclude titles" value={criteria.excludeTitles} onChange={(v) => set("excludeTitles", v)} />
            <Chips label="Seniorities" value={criteria.seniorities} onChange={(v) => set("seniorities", v)} />
            <Chips label="Industries" value={criteria.industries} onChange={(v) => set("industries", v)} />
            <Chips label="Locations" value={criteria.locations} onChange={(v) => set("locations", v)} />
            <Chips label="Country codes" value={criteria.countries} onChange={(v) => set("countries", v.map((c) => c.toUpperCase()))} />
            <Chips label="Company names" value={criteria.companyNames} onChange={(v) => set("companyNames", v)} />
            <Chips label="Company domains" value={criteria.companyDomains} onChange={(v) => set("companyDomains", v)} />
            <Chips label="Exclude domains" value={criteria.excludeCompanyDomains} onChange={(v) => set("excludeCompanyDomains", v)} />
            <Chips label="Technologies" value={criteria.technologies} onChange={(v) => set("technologies", v)} />
            <div className="space-y-2">
              <Label>Company size</Label>
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="min" value={criteria.companySizeMin ?? ""} onChange={(e) => set("companySizeMin", e.target.value ? Number(e.target.value) : null)} />
                <span>–</span>
                <Input type="number" placeholder="max" value={criteria.companySizeMax ?? ""} onChange={(e) => set("companySizeMax", e.target.value ? Number(e.target.value) : null)} />
              </div>
            </div>
            <Chips label="Keywords" value={criteria.keywords} onChange={(v) => set("keywords", v)} />
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="semantic">Description for semantic providers</Label>
              <Textarea id="semantic" rows={2} value={criteria.semanticQuery ?? ""} onChange={(e) => set("semanticQuery", e.target.value || null)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setSearchId(null);
                  setPreview(null);
                }}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.source === "system" ? " (server key)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="count">People to fetch</Label>
              <Input
                id="count"
                type="number"
                min={5}
                max={500}
                value={count}
                onChange={(e) => {
                  setCount(Number(e.target.value));
                  setSearchId(null);
                }}
              />
              <p className="text-xs text-muted-foreground">Each record may spend provider credits. Start small, review, then run again.</p>
            </div>
            <Button variant="secondary" className="w-full" onClick={doPreview} disabled={busy !== "idle"}>
              {busy === "previewing" ? "Estimating…" : "Preview estimate"}
            </Button>
            {preview && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <div>
                  Estimated matches: <span className="font-medium">{preview.totalEstimate ?? "unknown"}</span>
                </div>
                {preview.creditsPerRecord !== undefined && <div>Credits per record: {preview.creditsPerRecord}</div>}
                {preview.estimatedCostCents !== undefined && <div>Estimated cost: ${(preview.estimatedCostCents / 100).toFixed(2)}</div>}
                {preview.note && <div className="mt-1 text-xs text-muted-foreground">{preview.note}</div>}
              </div>
            )}
            <Button className="w-full" onClick={doRun} disabled={busy !== "idle"}>
              {busy === "running" ? "Running…" : `Run search for ${count} people`}
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Chips({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={value.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </div>
  );
}
