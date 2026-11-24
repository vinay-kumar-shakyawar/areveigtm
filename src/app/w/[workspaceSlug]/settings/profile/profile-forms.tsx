"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changePasswordAction, updateProfileAction, type ActionResult } from "../actions";

export function ProfileForms({ slug, name, email }: { slug: string; name: string; email: string }) {
  const [p, pAction, pPending] = useActionState(updateProfileAction.bind(null, slug), {} as ActionResult);
  const [pw, pwAction, pwPending] = useActionState(changePasswordAction.bind(null, slug), {} as ActionResult);
  useEffect(() => {
    if (p.ok) toast.success("Profile saved");
    if (p.error) toast.error(p.error);
  }, [p]);
  useEffect(() => {
    if (pw.ok) toast.success("Password changed");
    if (pw.error) toast.error(pw.error);
  }, [pw]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={pAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={name} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} disabled />
            </div>
            <Button type="submit" disabled={pPending}>
              {pPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={pwAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" />
              <p className="text-xs text-muted-foreground">Leave empty if you only sign in with email codes.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
            </div>
            <Button type="submit" variant="secondary" disabled={pwPending}>
              {pwPending ? "Saving…" : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
