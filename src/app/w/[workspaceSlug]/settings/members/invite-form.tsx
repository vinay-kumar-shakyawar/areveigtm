"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteMemberAction, type ActionResult } from "../actions";

export function InviteForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(inviteMemberAction.bind(null, slug), {} as ActionResult);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      toast.success("Invitation sent");
      ref.current?.reset();
    }
    if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form ref={ref} action={action} className="mb-6 flex flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="invite-email" className="mb-1 block text-sm font-medium">
          Invite by email
        </label>
        <Input id="invite-email" name="email" type="email" required placeholder="teammate@company.com" />
      </div>
      <div>
        <label htmlFor="invite-role" className="mb-1 block text-sm font-medium">
          Role
        </label>
        <select id="invite-role" name="role" defaultValue="member" className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </Button>
    </form>
  );
}
