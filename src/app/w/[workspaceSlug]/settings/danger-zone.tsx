"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteWorkspaceAction } from "./actions";

export function DangerZone({ slug, workspaceName }: { slug: string; workspaceName: string }) {
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card className="mt-6 border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
        <CardDescription>Deleting a workspace removes credentials immediately and schedules all data for permanent deletion after the retention period.</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger render={<Button variant="destructive" />}>Delete workspace</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {workspaceName}?</DialogTitle>
              <DialogDescription>Type the workspace name to confirm. This cannot be undone.</DialogDescription>
            </DialogHeader>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={workspaceName} />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={pending || confirm !== workspaceName}
                onClick={() =>
                  start(async () => {
                    const res = await deleteWorkspaceAction(slug, confirm);
                    if (res?.error) toast.error(res.error);
                  })
                }
              >
                {pending ? "Deleting…" : "Permanently delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
