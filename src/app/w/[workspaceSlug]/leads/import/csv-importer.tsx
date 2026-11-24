"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TARGETS = [
  ["fullName", "Full name"],
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["email", "Email"],
  ["title", "Job title"],
  ["company", "Company"],
  ["companyDomain", "Company domain / website"],
  ["linkedinUrl", "LinkedIn URL"],
  ["xHandle", "X handle"],
  ["phone", "Phone"],
  ["location", "Location"],
  ["country", "Country code"],
] as const;

const GUESS: Record<string, RegExp> = {
  fullName: /^(full ?name|name|person)$/i,
  firstName: /^first/i,
  lastName: /^(last|surname)/i,
  email: /mail/i,
  title: /(title|role|position)/i,
  company: /^(company|organi[sz]ation|employer)$/i,
  companyDomain: /(domain|website|url)/i,
  linkedinUrl: /linkedin/i,
  xHandle: /(twitter|x handle|^x$)/i,
  phone: /phone|mobile/i,
  location: /(location|city)/i,
  country: /country/i,
};

export function CsvImporter({ slug }: { slug: string }) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string | null>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ addedCount: number; duplicateCount: number; invalidCount: number; errors: { row: number; reason: string }[] } | null>(null);

  function onFile(file: File) {
    setFileName(file.name);
    setResult(null);
    Papa.parse<Record<string, string | null>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hs = res.meta.fields ?? [];
        setHeaders(hs);
        setRows(res.data.slice(0, 5000));
        const guessed: Record<string, string> = {};
        for (const [target] of TARGETS) {
          const h = hs.find((x) => GUESS[target]?.test(x) && !Object.values(guessed).includes(x));
          if (h) guessed[target] = h;
        }
        setMapping(guessed);
        if (res.data.length > 5000) toast.warning("Only the first 5,000 rows will be imported.");
      },
      error: (err) => toast.error(err.message),
    });
  }

  async function run() {
    if (!mapping.fullName && !mapping.email && !mapping.linkedinUrl && !mapping.firstName) {
      toast.error("Map at least a name, email or LinkedIn column");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/w/${slug}/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName, rows, mapping, requestId: `csv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Import failed");
      setResult(data.batch);
      toast.success(`Imported ${data.batch.addedCount} new, merged ${data.batch.duplicateCount}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose a file</CardTitle>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="block text-sm"
          />
          {fileName && (
            <p className="mt-2 text-sm text-muted-foreground">
              {fileName}: {rows.length} row(s), {headers.length} column(s)
            </p>
          )}
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Map columns</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TARGETS.map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`map-${key}`}>{label}</Label>
                <select id={`map-${key}`} value={mapping[key] ?? ""} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">— skip —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Preview and import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.slice(0, 8).map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((r, i) => (
                    <TableRow key={i}>
                      {headers.slice(0, 8).map((h) => (
                        <TableCell key={h} className="max-w-[180px] truncate text-xs">
                          {r[h]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={run} disabled={busy}>
              {busy ? "Importing…" : `Import ${rows.length} row(s)`}
            </Button>
            {result && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <div>
                  Added <strong>{result.addedCount}</strong> new lead(s), merged <strong>{result.duplicateCount}</strong> into existing contacts, skipped <strong>{result.invalidCount}</strong> invalid row(s).
                </div>
                {result.errors?.length > 0 && (
                  <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-4 text-xs text-muted-foreground">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
