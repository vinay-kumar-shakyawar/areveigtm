"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const STATUSES = ["new", "reviewing", "approved", "rejected", "enrolled", "replied", "qualified", "meeting_booked", "not_interested", "disqualified", "unsubscribed"];
const STAGES = ["discovered", "reviewed", "enrolled", "contacted", "connected", "messaged", "replied", "qualified", "meeting_booked"];
const SOURCES = ["provider_search", "csv_import", "manual", "webhook", "signal", "api"];

export function LeadFilters({ base, initial }: { base: string; initial: { q: string; status: string; stage: string; source: string } }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const apply = (next = f) => {
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    router.push(`${base}${qs.toString() ? `?${qs}` : ""}`);
  };
  return (
    <form
      className="mb-4 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search name, email, title, company" className="max-w-xs" aria-label="Search leads" />
      <Select value={f.status} onChange={(v) => apply({ ...f, status: v })} options={STATUSES} placeholder="Any status" />
      <Select value={f.stage} onChange={(v) => apply({ ...f, stage: v })} options={STAGES} placeholder="Any stage" />
      <Select value={f.source} onChange={(v) => apply({ ...f, source: v })} options={SOURCES} placeholder="Any source" />
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
      {(f.q || f.status || f.stage || f.source) && (
        <Button type="button" variant="ghost" size="sm" onClick={() => apply({ q: "", status: "", stage: "", source: "" })}>
          Clear
        </Button>
      )}
    </form>
  );
}

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
