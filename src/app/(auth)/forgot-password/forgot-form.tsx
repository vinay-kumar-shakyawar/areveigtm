"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { forgotPasswordAction, resetPasswordAction, type FormState } from "../actions";

export function ForgotForm() {
  const [req, reqAction, reqPending] = useActionState(forgotPasswordAction, {} as FormState);
  const [reset, resetAction, resetPending] = useActionState(resetPasswordAction, {} as FormState);

  if (req.ok && req.email) {
    return (
      <form action={resetAction} className="mt-6 space-y-4">
        <input type="hidden" name="email" value={req.email} />
        <p className="text-sm text-muted-foreground">If an account exists for {req.email}, a code is on its way.</p>
        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required placeholder="123456" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        {reset.error && (
          <Alert variant="destructive">
            <AlertDescription>{reset.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={resetPending}>
          {resetPending ? "Saving…" : "Set new password"}
        </Button>
      </form>
    );
  }

  return (
    <form action={reqAction} className="mt-6 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
      </div>
      {req.error && (
        <Alert variant="destructive">
          <AlertDescription>{req.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={reqPending}>
        {reqPending ? "Sending…" : "Email me a reset code"}
      </Button>
    </form>
  );
}
