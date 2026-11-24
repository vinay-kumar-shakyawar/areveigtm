import { apiHandler } from "@/server/api/handler";
import { getSettings, getWorkspace, updateSettings, updateSettingsInput, updateWorkspace, updateWorkspaceInput } from "@/server/modules/workspace/service";

export const GET = apiHandler({}, async ({ ctx }) => {
  const [ws, settings] = await Promise.all([getWorkspace(ctx), getSettings(ctx)]);
  return { workspace: { id: ws.id, name: ws.name, slug: ws.slug, members: ws._count.members }, settings };
});

export const PATCH = apiHandler({ body: updateSettingsInput.merge(updateWorkspaceInput) }, async ({ ctx, body }) => {
  const { name, ...settingsInput } = body;
  if (name) await updateWorkspace(ctx, { name });
  const settings = await updateSettings(ctx, settingsInput);
  return { settings };
});
