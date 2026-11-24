"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requestCodeAction, verifyCodeAction, type FormState } from "../actions";

export function VerifyForm({ email, purpose, next }: { email: string; purpose: "sign_in" | "verify_email"; next: string }) {
  const [state, action, pending] = useActionState(verifyCodeAction, {} as FormState);
  const [resend, resendAction, resending] = useActionState(requestCodeAction, {} as FormState);
  return (
    <div className="mt-6 space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="purpose" value={purpose} />
        <input type="hidden" name="next" value={next} />
        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoFocus required placeholder="123456" />
        </div>
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Checking…" : "Verify"}
        </Button>
      </form>
      <form action={resendAction}>
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="ghost" size="sm" className="w-full" disabled={resending}>
          {resend.ok ? "Code sent again" : resending ? "Sending…" : "Send a new code"}
        </Button>
      </form>
    </div>
  );
}
