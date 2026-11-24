"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SENIORITIES, FUNCTIONS, type IcpCriteriaV1 } from "@/server/modules/icp/schemas";

const EMPTY: IcpCriteriaV1 = {
  version: 1,
  titles: [],
  excludeTitles: [],
  seniorities: [],
  functions: [],
  industries: [],
  excludeIndustries: [],
  geographies: [],
  countries: [],
  companySize: { min: null, max: null },
  revenue: { min: null, max: null },
  technologies: [],
  companyCharacteristics: [],
  exclusions: [],
  buyingSignals: [],
  preferredChannels: [],
  keywords: [],
};

interface Existing {
  id: string;
  name: string;
  description: string;
  criteria: IcpCriteriaV1;
  status: string;
  isDefault: boolean;
  revision: number;
  rationale: string | null;
}

export function IcpEditor({ slug, existing }: { slug: string; existing?: Existing }) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [criteria, setCriteria] = useState<IcpCriteriaV1>(existing?.criteria ?? EMPTY);
  const [rationale, setRationale] = useState<string | null>(existing?.rationale ?? null);
  const [ambiguities, setAmbiguities] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [saving, start] = useTransition();
  const set = <K extends keyof IcpCriteriaV1>(k: K, v: IcpCriteriaV1[K]) => setCriteria((c) => ({ ...c, [k]: v }));

  async function extract() {
    if (description.trim().length < 10) {
      toast.error("Describe the customer in at least one sentence");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch(`/api/v1/w/${slug}/icps`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ description, existing: existing ? criteria : undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Extraction failed");
      setCriteria(data.extraction.criteria);
      if (!name) setName(data.extraction.name);
      setRationale(data.extraction.rationale);
      setAmbiguities(data.extraction.ambiguities ?? []);
      toast.success("Criteria drafted. Review and adjust before saving.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  function save(status?: "draft" | "active") {
    if (!name.trim()) {
      toast.error("Give the ICP a name");
      return;
    }
    start(async () => {
      const body = { name, description, criteria, status, ...(rationale ? { aiRationale: { rationale } } : {}) };
      const res = await fetch(existing ? `/api/v1/w/${slug}/icps/${existing.id}` : `/api/v1/w/${slug}/icps`, {
        method: existing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(existing ? { ...body, expectedRevision: existing.revision } : body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error?.message ?? "Save failed");
        return;
      }
      toast.success(existing ? "ICP saved" : "ICP created");
      router.push(`/w/${slug}/icps/${data.icp.id}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Describe the customer</CardTitle>
            <CardDescription>Plain language. Mention roles, industry, geography, size, tech, and anything to avoid.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Find founders and heads of marketing at D2C ecommerce companies in the UAE with 10–100 employees, ideally on Shopify, excluding agencies." />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={extract} disabled={extracting}>
                <Sparkles className="size-4" /> {extracting ? "Drafting…" : existing ? "Refine criteria with AI" : "Draft criteria with AI"}
              </Button>
              <div className="flex-1" />
              <Label htmlFor="icp-name" className="sr-only">
                Name
              </Label>
              <Input id="icp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ICP name" className="max-w-xs" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">People</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Chips label="Job titles" value={criteria.titles} onChange={(v) => set("titles", v)} placeholder="Head of Marketing, VP Growth" />
            <Chips label="Exclude titles" value={criteria.excludeTitles} onChange={(v) => set("excludeTitles", v)} placeholder="Intern, Assistant" />
            <Multi label="Seniority" options={SENIORITIES} value={criteria.seniorities} onChange={(v) => set("seniorities", v as IcpCriteriaV1["seniorities"])} />
            <Multi label="Function" options={FUNCTIONS} value={criteria.functions} onChange={(v) => set("functions", v as IcpCriteriaV1["functions"])} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Companies</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Chips label="Industries" value={criteria.industries} onChange={(v) => set("industries", v)} placeholder="Ecommerce, Retail" />
            <Chips label="Exclude industries" value={criteria.excludeIndustries} onChange={(v) => set("excludeIndustries", v)} />
            <Chips label="Geographies" value={criteria.geographies} onChange={(v) => set("geographies", v)} placeholder="UAE, Saudi Arabia" />
            <Chips label="Country codes" value={criteria.countries} onChange={(v) => set("countries", v.map((c) => c.toUpperCase().slice(0, 2)))} placeholder="AE, SA" />
            <RangeField label="Company size (employees)" value={criteria.companySize} onChange={(v) => set("companySize", v)} />
            <RangeField label="Revenue (USD)" value={criteria.revenue} onChange={(v) => set("revenue", v)} />
            <Chips label="Technologies" value={criteria.technologies} onChange={(v) => set("technologies", v)} placeholder="Shopify, HubSpot" />
            <Chips label="Keywords" value={criteria.keywords} onChange={(v) => set("keywords", v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Qualitative</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Lines label="Company characteristics" value={criteria.companyCharacteristics} onChange={(v) => set("companyCharacteristics", v)} placeholder="One per line" />
            <Lines label="Exclusions" value={criteria.exclusions} onChange={(v) => set("exclusions", v)} placeholder="One per line" />
            <Lines label="Buying signals" value={criteria.buyingSignals} onChange={(v) => set("buyingSignals", v)} placeholder="Hiring a growth lead, raised a seed round…" />
            <div className="space-y-2">
              <Label>Preferred channels</Label>
              <div className="flex gap-4">
                {(["email", "linkedin", "x"] as const).map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm capitalize">
                    <Checkbox checked={criteria.preferredChannels.includes(c)} onCheckedChange={(v) => set("preferredChannels", v ? [...criteria.preferredChannels, c] : criteria.preferredChannels.filter((x) => x !== c))} />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={() => save()} disabled={saving}>
            {saving ? "Saving…" : existing ? "Save changes" : "Save as draft"}
          </Button>
          <Button variant="secondary" onClick={() => save("active")} disabled={saving}>
            {existing ? "Save and activate" : "Create and activate"}
          </Button>
        </div>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Why these criteria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {rationale ? <p>{rationale}</p> : <p className="text-muted-foreground">The AI explains its reasoning here after drafting.</p>}
            {ambiguities.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ambiguities to resolve</div>
                <ul className="list-disc space-y-1 pl-4">
                  {ambiguities.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {[...criteria.titles, ...criteria.seniorities, ...criteria.industries, ...criteria.geographies, ...criteria.technologies].map((t, i) => (
              <Badge key={`${t}-${i}`} variant="secondary">
                {t}
              </Badge>
            ))}
            {criteria.companySize.min || criteria.companySize.max ? (
              <Badge variant="outline">
                {criteria.companySize.min ?? "any"}–{criteria.companySize.max ?? "any"} employees
              </Badge>
            ) : null}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Chips({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={value.join(", ")}
        placeholder={placeholder}
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

function Lines({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        rows={3}
        value={value.join("\n")}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </div>
  );
}

function Multi({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              aria-pressed={on}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RangeField({ label, value, onChange }: { label: string; value: { min: number | null; max: number | null }; onChange: (v: { min: number | null; max: number | null }) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" min={0} placeholder="min" value={value.min ?? ""} onChange={(e) => onChange({ ...value, min: e.target.value ? Number(e.target.value) : null })} />
        <span className="text-muted-foreground">–</span>
        <Input type="number" min={0} placeholder="max" value={value.max ?? ""} onChange={(e) => onChange({ ...value, max: e.target.value ? Number(e.target.value) : null })} />
      </div>
    </div>
  );
}
