"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createApiKeyAction, revokeApiKeyAction, type ActionResult } from "../actions";
import { formatDistanceToNow } from "date-fns";

interface KeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function ApiKeysPanel({ slug, keys }: { slug: string; keys: KeyRow[] }) {
  const [state, action, pending] = useActionState(createApiKeyAction.bind(null, slug), {} as ActionResult);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [revoking, startRevoke] = useTransition();
  const revealed = state.ok && state.value && state.value !== dismissed ? state.value : null;

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <div className="space-y-6">
      {revealed && (
        <Alert>
          <AlertTitle>Copy your new key now</AlertTitle>
          <AlertDescription>
            <code className="mt-2 block break-all rounded bg-muted p-2 text-xs">{revealed}</code>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(revealed).then(() => toast.success("Copied"))}>
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(revealed)}>
                Done
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <form action={action} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="key-name" className="mb-1 block text-sm font-medium">
            Key name
          </label>
          <Input id="key-name" name="name" required placeholder="CRM sync" />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox name="scopes" value="read" defaultChecked /> read
          </label>
          <label className="flex items-center gap-2">
            <Checkbox name="scopes" value="write" defaultChecked /> write
          </label>
          <label className="flex items-center gap-2">
            <Checkbox name="scopes" value="admin" /> admin
          </label>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </Button>
      </form>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No API keys yet.
                </TableCell>
              </TableRow>
            )}
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell>
                  <code className="text-xs">{k.keyPrefix}…</code>
                </TableCell>
                <TableCell className="space-x-1">
                  {k.scopes.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{k.lastUsedAt ? formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true }) : "never"}</TableCell>
                <TableCell className="text-right">
                  {k.revokedAt ? (
                    <Badge variant="outline">revoked</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoking}
                      onClick={() =>
                        startRevoke(async () => {
                          const res = await revokeApiKeyAction(slug, k.id);
                          if (res.error) toast.error(res.error);
                          else toast.success("Key revoked");
                        })
                      }
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
