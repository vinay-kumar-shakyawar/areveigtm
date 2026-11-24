"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmUnsubscribe } from "./actions";

export function UnsubscribeForm({ token, email }: { token: string; email: string }) {
  const [done, setDone] = useState<null | boolean>(null);
  const [pending, start] = useTransition();
  if (done) {
    return (
      <>
        <h1 className="text-lg font-semibold">You are unsubscribed</h1>
        <p className="mt-2 text-sm text-muted-foreground">{email} will not receive further outreach from this sender. Active sequences were stopped.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-lg font-semibold">Unsubscribe {email}?</h1>
      <p className="mt-2 text-sm text-muted-foreground">You will stop receiving outreach emails from this sender. This cannot be undone from here.</p>
      {done === false && <p className="mt-3 text-sm text-destructive">Something went wrong. Please try again.</p>}
      <Button className="mt-6 w-full" disabled={pending} onClick={() => start(async () => setDone((await confirmUnsubscribe(token)).ok))}>
        {pending ? "Unsubscribing…" : "Unsubscribe"}
      </Button>
    </>
  );
}
