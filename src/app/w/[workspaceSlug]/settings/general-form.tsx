"use client";

import { useActionState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { updateGeneralAction, type ActionResult } from "./actions";
import { useEffect } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function GeneralSettingsForm({
  slug,
  canEdit,
  initial,
}: {
  slug: string;
  canEdit: boolean;
  initial: {
    name: string;
    timezone: string;
    days: number[];
    start: string;
    end: string;
    limits: { email: number; linkedinInvites: number; linkedinMessages: number; xDms: number };
    bookingLink: string;
    aiAutoSendReplies: boolean;
    unsubscribeFooterEnabled: boolean;
    plainTextEmail: boolean;
    allowConcurrentCampaigns: boolean;
  };
}) {
  const [state, action, pending] = useActionState(updateGeneralAction.bind(null, slug), {} as ActionResult);
  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["UTC"];
    }
  }, []);

  useEffect(() => {
    if (state.ok) toast.success("Settings saved");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-6">
      <fieldset disabled={!canEdit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workspace</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={initial.name} required minLength={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Time zone</Label>
              <select id="timezone" name="timezone" defaultValue={initial.timezone} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bookingLink">Booking link</Label>
              <Input id="bookingLink" name="bookingLink" type="url" placeholder="https://cal.com/you/intro" defaultValue={initial.bookingLink} />
              <p className="text-xs text-muted-foreground">Inserted into AI reply drafts when a prospect asks to talk.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sending window</CardTitle>
            <CardDescription>Outreach only goes out on these days and hours, in the workspace time zone. Sender accounts can narrow this further.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <Checkbox name="days" value={String(i)} defaultChecked={initial.days.includes(i)} />
                  {d}
                </label>
              ))}
            </div>
            <div className="grid max-w-sm grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start">Start</Label>
                <Input id="start" name="start" type="time" defaultValue={initial.start} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">End</Label>
                <Input id="end" name="end" type="time" defaultValue={initial.end} required />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default daily limits</CardTitle>
            <CardDescription>Per sender account. Keep LinkedIn invites at or below 25 a day to stay under the limits providers document.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <LimitField id="limitEmail" label="Emails" value={initial.limits.email} max={5000} />
            <LimitField id="limitInvites" label="LinkedIn invites" value={initial.limits.linkedinInvites} max={30} />
            <LimitField id="limitMessages" label="LinkedIn messages" value={initial.limits.linkedinMessages} max={100} />
            <LimitField id="limitX" label="X DMs" value={initial.limits.xDms} max={100} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Behaviour</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleRow name="aiAutoSendReplies" label="Let AI send replies automatically" description="Off by default. When on, only high-confidence drafts in allowed categories are sent without review; every auto-send is audited." checked={initial.aiAutoSendReplies} />
            <ToggleRow name="unsubscribeFooterEnabled" label="Add an unsubscribe line to emails" description="Also sets List-Unsubscribe headers." checked={initial.unsubscribeFooterEnabled} />
            <ToggleRow name="plainTextEmail" label="Send plain-text emails" description="No HTML, no tracking pixels." checked={initial.plainTextEmail} />
            <ToggleRow name="allowConcurrentCampaigns" label="Allow a lead in several campaigns at once" description="Off keeps one sequence per person, which avoids double outreach." checked={initial.allowConcurrentCampaigns} />
          </CardContent>
        </Card>
      </fieldset>
      {canEdit && (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      )}
    </form>
  );
}

function LimitField({ id, label, value, max }: { id: string; label: string; value: number; max: number }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type="number" min={1} max={max} defaultValue={value} required />
    </div>
  );
}

function ToggleRow({ name, label, description, checked }: { name: string; label: string; description: string; checked: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={name}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={name} name={name} defaultChecked={checked} />
    </div>
  );
}
