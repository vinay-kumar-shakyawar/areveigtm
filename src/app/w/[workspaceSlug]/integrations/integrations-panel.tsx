"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Plug, Plus, XCircle, HelpCircle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/empty-state";
import { formatDistanceToNow } from "date-fns";

interface Field {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
}
interface CatalogEntry {
  id: string;
  category: string;
  displayName: string;
  description: string;
  docsUrl?: string;
  capabilities: string[];
  credentialFields: Field[];
  configFields: Field[];
  systemEnvKeys: string[];
}
interface IntegrationRow {
  id: string;
  category: string;
  provider: string;
  label: string | null;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
  config: unknown;
  healthStatus: string;
  lastHealthCheckAt: string | null;
  lastError: unknown;
  credential: { kind: string; fingerprint: string; rotatedAt: string | null } | null;
}
interface UsageRow {
  provider: string;
  operation: string;
  status: string;
  calls: number;
  units: number;
  estimatedCostCents: number;
}

const CATEGORY_ORDER = ["llm", "people_data", "company_data", "signals", "email", "mailbox", "linkedin", "x"];

export function IntegrationsPanel({
  slug,
  canManage,
  catalog,
  categoryLabels,
  integrations,
  usage,
}: {
  slug: string;
  canManage: boolean;
  catalog: CatalogEntry[];
  categoryLabels: Record<string, string>;
  integrations: IntegrationRow[];
  usage: UsageRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<CatalogEntry | null>(null);
  const [editing, setEditing] = useState<{ row: IntegrationRow; entry: CatalogEntry } | null>(null);
  const byCategory = useMemo(() => {
    const map = new Map<string, IntegrationRow[]>();
    for (const i of integrations) map.set(i.category, [...(map.get(i.category) ?? []), i]);
    return map;
  }, [integrations]);
  const catalogByCategory = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const c of catalog) map.set(c.category, [...(map.get(c.category) ?? []), c]);
    return map;
  }, [catalog]);

  async function call(path: string, init: RequestInit) {
    const res = await fetch(`/api/v1/w/${slug}/integrations${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    const data = await res.json();
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

  const visibleCategories = CATEGORY_ORDER.filter((c) => catalogByCategory.has(c));

  return (
    <>
      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="usage">Usage (30 days)</TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="mt-4 space-y-8">
          {visibleCategories.map((category) => {
            const rows = byCategory.get(category) ?? [];
            const entries = catalogByCategory.get(category) ?? [];
            return (
              <section key={category}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold">{categoryLabels[category] ?? category}</h2>
                    <p className="text-xs text-muted-foreground">{rows.length === 0 ? "Nothing configured yet." : `${rows.length} configured · the default is tried first, others are fallbacks.`}</p>
                  </div>
                </div>
                {rows.length > 0 && (
                  <div className="mb-3 rounded-lg border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Provider</TableHead>
                          <TableHead>Credential</TableHead>
                          <TableHead>Health</TableHead>
                          <TableHead>Enabled</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => {
                          const entry = entries.find((e) => e.id === row.provider);
                          return (
                            <TableRow key={row.id}>
                              <TableCell>
                                <div className="flex items-center gap-2 font-medium">
                                  {entry?.displayName ?? row.provider}
                                  {row.isDefault && (
                                    <Badge variant="secondary" className="gap-1">
                                      <Star className="size-3" /> default
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">{row.label ?? describeConfig(row.config)}</div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {row.credential ? <code className="text-xs">{row.credential.fingerprint}</code> : <span className="text-muted-foreground">none needed</span>}
                              </TableCell>
                              <TableCell>
                                <HealthBadge status={row.healthStatus} at={row.lastHealthCheckAt} error={row.lastError} />
                              </TableCell>
                              <TableCell>
                                <Switch
                                  checked={row.enabled}
                                  disabled={!canManage || pending}
                                  onCheckedChange={(v) => act(() => call(`/${row.id}`, { method: "PATCH", body: JSON.stringify({ enabled: v }) }))}
                                  aria-label="Enabled"
                                />
                              </TableCell>
                              <TableCell className="space-x-1 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!canManage || pending}
                                  onClick={() =>
                                    act(async () => {
                                      const data = await call(`/${row.id}/test`, { method: "POST" });
                                      if (data.result.ok) toast.success(data.result.message);
                                      else toast.error(data.result.message);
                                    })
                                  }
                                >
                                  Test
                                </Button>
                                {!row.isDefault && (
                                  <Button size="sm" variant="ghost" disabled={!canManage || pending} onClick={() => act(() => call(`/${row.id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) }))}>
                                    Make default
                                  </Button>
                                )}
                                {entry && (
                                  <Button size="sm" variant="ghost" disabled={!canManage || pending} onClick={() => setEditing({ row, entry })}>
                                    Edit
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  disabled={!canManage || pending}
                                  onClick={() => {
                                    if (confirm("Remove this provider and its stored credential?")) act(() => call(`/${row.id}`, { method: "DELETE" }));
                                  }}
                                >
                                  Remove
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    {entries.map((entry) => (
                      <Button key={entry.id} size="sm" variant="outline" onClick={() => setAdding(entry)}>
                        <Plus className="size-3.5" /> {entry.displayName}
                      </Button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          {usage.length === 0 ? (
            <EmptyState icon={Plug} title="No provider usage yet" description="Every AI call, search, enrichment and send is metered here with its estimated cost." />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.map((u, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{u.provider}</TableCell>
                      <TableCell className="text-sm">{u.operation}</TableCell>
                      <TableCell>
                        <Badge variant={u.status === "ok" ? "secondary" : "destructive"}>{u.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{u.calls}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.units.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">${(u.estimatedCostCents / 100).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {adding && (
        <ProviderDialog
          entry={adding}
          onClose={() => setAdding(null)}
          submit={async (payload) => {
            await call("", { method: "POST", body: JSON.stringify({ category: adding.category, provider: adding.id, ...payload }) });
            toast.success(`${adding.displayName} added. Run Test to verify the key.`);
            setAdding(null);
            router.refresh();
          }}
        />
      )}
      {editing && (
        <ProviderDialog
          entry={editing.entry}
          existing={editing.row}
          onClose={() => setEditing(null)}
          submit={async (payload) => {
            await call(`/${editing.row.id}`, { method: "PATCH", body: JSON.stringify(payload) });
            toast.success("Saved");
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function describeConfig(config: unknown): string {
  if (!config || typeof config !== "object") return "";
  const c = config as Record<string, unknown>;
  return [c.model, c.region].filter(Boolean).join(" · ");
}

function HealthBadge({ status, at, error }: { status: string; at: string | null; error: unknown }) {
  const when = at ? formatDistanceToNow(new Date(at), { addSuffix: true }) : "never tested";
  const message = (error as { message?: string } | null)?.message;
  if (status === "healthy")
    return (
      <span className="inline-flex items-center gap-1 text-sm text-emerald-700" title={when}>
        <CheckCircle2 className="size-4" /> healthy
      </span>
    );
  if (status === "failed" || status === "degraded")
    return (
      <span className="inline-flex items-center gap-1 text-sm text-destructive" title={message ?? when}>
        <XCircle className="size-4" /> {status}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" title={when}>
      <HelpCircle className="size-4" /> untested
    </span>
  );
}

function ProviderDialog({
  entry,
  existing,
  onClose,
  submit,
}: {
  entry: CatalogEntry;
  existing?: IntegrationRow;
  onClose: () => void;
  submit: (payload: { label?: string | null; credentials?: Record<string, string>; config: Record<string, unknown>; isDefault?: boolean }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existingConfig = (existing?.config as Record<string, unknown> | undefined) ?? {};
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const fd = new FormData(e.currentTarget);
            const credentials: Record<string, string> = {};
            for (const f of entry.credentialFields) credentials[f.key] = String(fd.get(`cred.${f.key}`) ?? "");
            const config: Record<string, unknown> = {};
            for (const f of entry.configFields) {
              const v = fd.get(`cfg.${f.key}`);
              if (f.type === "boolean") config[f.key] = v === "on";
              else if (v !== null && v !== "") config[f.key] = v;
            }
            const anyCred = Object.values(credentials).some((v) => v.trim());
            try {
              await submit({
                label: String(fd.get("label") ?? "") || null,
                credentials: entry.credentialFields.length && (!existing || anyCred) ? credentials : undefined,
                config,
                isDefault: fd.get("isDefault") === "on" ? true : undefined,
              });
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{existing ? "Edit" : "Add"} {entry.displayName}</DialogTitle>
            <DialogDescription>
              {entry.description}{" "}
              {entry.docsUrl && (
                <a href={entry.docsUrl} target="_blank" rel="noreferrer" className="underline">
                  Docs
                </a>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="label">Label (optional)</Label>
            <Input id="label" name="label" defaultValue={existing?.label ?? ""} placeholder="e.g. Production key" />
          </div>
          {entry.credentialFields.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={`cred.${f.key}`}>{f.label}</Label>
              <Input
                id={`cred.${f.key}`}
                name={`cred.${f.key}`}
                type={f.type === "secret" ? "password" : "text"}
                autoComplete="off"
                required={!existing && f.required !== false}
                placeholder={existing ? `Leave blank to keep ${existing.credential?.fingerprint ?? "current"}` : f.placeholder}
              />
              {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            </div>
          ))}
          {entry.configFields.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={`cfg.${f.key}`}>{f.label}</Label>
              {f.type === "select" ? (
                <select id={`cfg.${f.key}`} name={`cfg.${f.key}`} defaultValue={String(existingConfig[f.key] ?? f.default ?? "")} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "boolean" ? (
                <Switch id={`cfg.${f.key}`} name={`cfg.${f.key}`} defaultChecked={Boolean(existingConfig[f.key] ?? f.default)} />
              ) : (
                <Input id={`cfg.${f.key}`} name={`cfg.${f.key}`} type={f.type === "number" ? "number" : "text"} defaultValue={String(existingConfig[f.key] ?? f.default ?? "")} />
              )}
              {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            </div>
          ))}
          {!existing && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isDefault" className="size-4" /> Make this the default for its category
            </label>
          )}
          {entry.systemEnvKeys.length > 0 && <p className="text-xs text-muted-foreground">Server-level fallback env: {entry.systemEnvKeys.join(", ")}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : existing ? "Save" : "Add provider"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IntegrationsEmpty() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nothing configured</CardTitle>
        <CardDescription>Add an AI provider first; it powers company profiles, ICPs, research and outreach.</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
