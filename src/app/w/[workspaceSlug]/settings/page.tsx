import { requireWorkspaceContext } from "@/server/auth/context";
import { getSettings, getWorkspace } from "@/server/modules/workspace/service";
import { PageHeader } from "@/components/app/page-header";
import { GeneralSettingsForm } from "./general-form";
import { DangerZone } from "./danger-zone";
import { can } from "@/server/auth/rbac";

export default async function GeneralSettingsPage(props: PageProps<"/w/[workspaceSlug]/settings">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const [ws, settings] = await Promise.all([getWorkspace(ctx), getSettings(ctx)]);
  const window = settings.sendingWindow as { days: number[]; start: string; end: string };
  const limits = settings.defaultDailyLimits as { email: number; linkedinInvites: number; linkedinMessages: number; xDms: number };
  return (
    <>
      <PageHeader title="General" description="Workspace name, time zone, sending window and default safety limits." />
      <GeneralSettingsForm
        slug={workspaceSlug}
        canEdit={can(ctx.role, "settings.update")}
        initial={{
          name: ws.name,
          timezone: settings.timezone,
          days: window.days,
          start: window.start,
          end: window.end,
          limits,
          bookingLink: settings.bookingLink ?? "",
          aiAutoSendReplies: settings.aiAutoSendReplies,
          unsubscribeFooterEnabled: settings.unsubscribeFooterEnabled,
          plainTextEmail: settings.plainTextEmail,
          allowConcurrentCampaigns: settings.allowConcurrentCampaigns,
        }}
      />
      {ctx.role === "owner" && <DangerZone slug={workspaceSlug} workspaceName={ws.name} />}
    </>
  );
}
