"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestCodeAction, signInAction, verifyCodeAction, type FormState } from "../actions";

const initial: FormState = {};

export function SignInForm({ next }: { next: string }) {
  return (
    <Tabs defaultValue="password" className="mt-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="code">Email code</TabsTrigger>
      </TabsList>
      <TabsContent value="password">
        <PasswordForm next={next} />
      </TabsContent>
      <TabsContent value="code">
        <CodeForm next={next} />
      </TabsContent>
    </Tabs>
  );
}

function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function CodeForm({ next }: { next: string }) {
  const [reqState, reqAction, reqPending] = useActionState(requestCodeAction, initial);
  const [verState, verAction, verPending] = useActionState(verifyCodeAction, initial);
  const [email, setEmail] = useState("");

  if (reqState.ok && reqState.email) {
    return (
      <form action={verAction} className="mt-4 space-y-4">
        <input type="hidden" name="email" value={reqState.email} />
        <input type="hidden" name="purpose" value="sign_in" />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm text-muted-foreground">
          We emailed a 6-digit code to <span className="font-medium text-foreground">{reqState.email}</span>. It expires in 10 minutes.
        </p>
        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoFocus required placeholder="123456" />
        </div>
        {verState.error && (
          <Alert variant="destructive">
            <AlertDescription>{verState.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={verPending}>
          {verPending ? "Checking…" : "Continue"}
        </Button>
      </form>
    );
  }

  return (
    <form action={reqAction} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code-email">Work email</Label>
        <Input
          id="code-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {reqState.error && (
        <Alert variant="destructive">
          <AlertDescription>{reqState.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="secondary" className="w-full" disabled={reqPending}>
        {reqPending ? "Sending…" : "Email me a sign-in code"}
      </Button>
      <p className="text-xs text-muted-foreground">No account yet? A code creates one for you.</p>
    </form>
  );
}
