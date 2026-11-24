"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { createWorkspace, createWorkspaceInput } from "@/server/modules/workspace/service";
import type { FormState } from "@/app/(auth)/actions";

export async function createWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/workspaces/new");
  const parsed = createWorkspaceInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const ws = await createWorkspace(user.id, parsed.data);
  redirect(`/w/${ws.slug}`);
}
