"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspaceContext } from "@/server/auth/context";
import {
  changeMemberRole,
  inviteInput,
  inviteMember,
  removeMember,
  revokeInvitation,
  softDeleteWorkspace,
  updateSettings,
  updateSettingsInput,
  updateWorkspace,
} from "@/server/modules/workspace/service";
import { createApiKey, createApiKeyInput, revokeApiKey } from "@/server/modules/api-keys/service";
import { changePassword } from "@/server/auth/service";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { redirect } from "next/navigation";

export interface ActionResult {
  ok?: boolean;
  error?: string;
  value?: string;
}

function handle(err: unknown): ActionResult {
  if (err instanceof ApiError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Invalid input" };
  throw err;
}

export async function updateGeneralAction(slug: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { ctx } = await requireWorkspaceContext(slug);
    const raw = Object.fromEntries(formData);
    const name = z.string().trim().min(2).max(80).parse(raw.name);
    const days = formData.getAll("days").map((d) => Number(d));
    const settings = updateSettingsInput.parse({
      timezone: raw.timezone,
      sendingWindow: { days: days.length ? days : [1, 2, 3, 4, 5], start: raw.start, end: raw.end },
      defaultDailyLimits: {
        email: Number(raw.limitEmail),
        linkedinInvites: Number(raw.limitInvites),
        linkedinMessages: Number(raw.limitMessages),
        xDms: Number(raw.limitX),
      },
      bookingLink: raw.bookingLink || null,
      aiAutoSendReplies: raw.aiAutoSendReplies === "on",
      unsubscribeFooterEnabled: raw.unsubscribeFooterEnabled === "on",
      plainTextEmail: raw.plainTextEmail === "on",
      allowConcurrentCampaigns: raw.allowConcurrentCampaigns === "on",
    });
    await updateWorkspace(ctx, { name });
    await updateSettings(ctx, settings);
    revalidatePath(`/w/${slug}/settings`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function inviteMemberAction(slug: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { ctx } = await requireWorkspaceContext(slug);
    await inviteMember(ctx, inviteInput.parse(Object.fromEntries(formData)));
    revalidatePath(`/w/${slug}/settings/members`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function changeRoleAction(slug: string, userId: string, role: "owner" | "admin" | "member"): Promise<ActionResult> {
  try {
    const { ctx } = await requireWorkspaceContext(slug);
    await changeMemberRole(ctx, userId, role);
    revalidatePath(`/w/${slug}/settings/members`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function removeMemberAction(slug: string, userId: string): Promise<ActionResult> {
  try {
    const { ctx } = await requireWorkspaceContext(slug);
    await removeMember(ctx, userId);
    revalidatePath(`/w/${slug}/settings/members`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function revokeInvitationAction(slug: string, invitationId: string): Promise<ActionResult> {
  try {
    const { ctx } = await requireWorkspaceContext(slug);
    await revokeInvitation(ctx, invitationId);
    revalidatePath(`/w/${slug}/settings/members`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createApiKeyAction(slug: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { ctx } = await requireWorkspaceContext(slug);
    const scopes = formData.getAll("scopes").map(String) as ("read" | "write" | "admin")[];
    const { raw } = await createApiKey(ctx, createApiKeyInput.parse({ name: formData.get("name"), scopes: scopes.length ? scopes : undefined }));
    revalidatePath(`/w/${slug}/settings/api-keys`);
    return { ok: true, value: raw };
  } catch (err) {
    return handle(err);
  }
}

export async function revokeApiKeyAction(slug: string, id: string): Promise<ActionResult> {
  try {
    const { ctx } = await requireWorkspaceContext(slug);
    await revokeApiKey(ctx, id);
    revalidatePath(`/w/${slug}/settings/api-keys`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function updateProfileAction(slug: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { user } = await requireWorkspaceContext(slug);
    const name = z.string().trim().min(1).max(80).parse(formData.get("name"));
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function changePasswordAction(slug: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { user } = await requireWorkspaceContext(slug);
    await changePassword(user.id, String(formData.get("currentPassword") ?? ""), String(formData.get("newPassword") ?? ""));
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteWorkspaceAction(slug: string, confirmName: string): Promise<ActionResult> {
  const { ctx, workspaceName } = await requireWorkspaceContext(slug);
  if (confirmName.trim() !== workspaceName) return { error: "Type the workspace name exactly to confirm." };
  try {
    await softDeleteWorkspace(ctx);
  } catch (err) {
    return handle(err);
  }
  redirect("/");
}
