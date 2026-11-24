"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { Search } from "lucide-react";
import type { PersonRecord } from "@/server/providers/types";

interface Row {
  id: string;
  decision: "undecided" | "good_fit" | "not_a_fit";
  matchReason: string | null;
  duplicate: boolean;
  imported: boolean;
  person: PersonRecord;
}

export function ReviewBatch({ slug, searchId, status, results }: { slug: string; searchId: string; status: string; results: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(results);
  const [filter, setFilter] = useState<"all" | "undecided" | "good_fit" | "not_a_fit">("all");
  const [pending, start] = useTransition();

  // Poll while the search is still running.
  useEffect(() => {
    if (status !== "running") return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [status, router]);

  const visible = useMemo(() => rows.filter((r) => filter === "all" || r.decision === filter), [rows, filter]);
  const counts = useMemo(() => ({ good: rows.filter((r) => r.decision === "good_fit").length, bad: rows.filter((r) => r.decision === "not_a_fit").length, undecided: rows.filter((r) => r.decision === "undecided").length }), [rows]);

  async function send(body: unknown) {
    const res = await fetch(`/api/v1/w/${slug}/searches/${searchId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
    return data;
  }

  function decide(ids: string[], decision: Row["decision"]) {
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, decision } : r)));
    start(async () => {
      try {
        await send({ action: "decide", decisions: ids.map((resultId) => ({ resultId, decision })), finish: false });
      } catch (err) {
        toast.error((err as Error).message);
        router.refresh();
      }
    });
  }

  function importGood() {
    start(async () => {
      try {
        const data = await send({ action: "import" });
        toast.success(`${data.result.imported} new lead(s) added${data.result.duplicates ? `, ${data.result.duplicates} merged into existing contacts` : ""}`);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  if (status === "running") return <EmptyState icon={Search} title="Searching…" description="Pulling people from the provider. This page refreshes automatically." />;
  if (rows.length === 0) return <EmptyState icon={Search} title="No people returned" description="The provider found nobody for these filters. Loosen the criteria or try another provider; nothing was invented to fill the gap." />;

  const toImport = rows.filter((r) => r.decision === "good_fit" && !r.imported && !r.duplicate).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "undecided", "good_fit", "not_a_fit"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} onClick={() => setFilter(f)}>
            {f.replace(/_/g, " ")} {f === "undecided" ? `(${counts.undecided})` : f === "good_fit" ? `(${counts.good})` : f === "not_a_fit" ? `(${counts.bad})` : `(${rows.length})`}
          </Button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="outline" disabled={pending || counts.undecided === 0} onClick={() => decide(rows.filter((r) => r.decision === "undecided").map((r) => r.id), "good_fit")}>
          Approve all undecided
        </Button>
        <Button size="sm" disabled={pending || (toImport === 0 && !rows.some((r) => r.decision === "good_fit" && r.duplicate && !r.imported))} onClick={importGood}>
          Import {counts.good} good fit{counts.good === 1 ? "" : "s"} to Leads
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Why matched</TableHead>
              <TableHead>Contact data</TableHead>
              <TableHead className="text-right">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.id} className={r.decision === "not_a_fit" ? "opacity-60" : ""}>
                <TableCell>
                  <div className="flex items-center gap-1 font-medium">
                    {r.person.fullName}
                    {r.person.linkedinUrl && (
                      <a href={r.person.linkedinUrl} target="_blank" rel="noreferrer" aria-label="Open LinkedIn profile" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{[r.person.title, r.person.location].filter(Boolean).join(" · ")}</div>
                  {r.duplicate && (
                    <Badge variant="outline" className="mt-1">
                      already in workspace
                    </Badge>
                  )}
                  {r.imported && (
                    <Badge variant="secondary" className="mt-1">
                      imported
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.person.company?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{[r.person.company?.industry, r.person.company?.headcount ? `${r.person.company.headcount} employees` : null, r.person.company?.domain].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell className="max-w-xs text-xs text-muted-foreground">{r.matchReason}</TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-wrap gap-1">
                    {r.person.email && <Badge variant="outline">email</Badge>}
                    {r.person.linkedinUrl && <Badge variant="outline">linkedin</Badge>}
                    {r.person.xHandle && <Badge variant="outline">x</Badge>}
                    {r.person.phone && <Badge variant="outline">phone</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button size="icon-sm" variant={r.decision === "good_fit" ? "default" : "outline"} aria-label="Good fit" disabled={pending || r.imported} onClick={() => decide([r.id], "good_fit")}>
                      <Check className="size-4" />
                    </Button>
                    <Button size="icon-sm" variant={r.decision === "not_a_fit" ? "destructive" : "outline"} aria-label="Not a fit" disabled={pending || r.imported} onClick={() => decide([r.id], "not_a_fit")}>
                      <X className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Decisions are saved as you click. Imported people appear under <Link href={`/w/${slug}/leads`} className="underline">Leads</Link>; people already in the workspace are merged, never duplicated.
      </p>
    </div>
  );
}
