"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createWorkspaceAction } from "./actions";
import type { FormState } from "@/app/(auth)/actions";

export function NewWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspaceAction, {} as FormState);
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="timezone" value={tz} />
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" required minLength={2} placeholder="Acme Inc" autoFocus />
        <p className="text-xs text-muted-foreground">Usually your company name. Time zone detected: {tz}.</p>
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
