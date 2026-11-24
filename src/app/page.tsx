import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/modules/workspace/service";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const workspaces = await listWorkspacesForUser(user.id);
  if (workspaces.length === 0) redirect("/workspaces/new");
  redirect(`/w/${workspaces[0].slug}`);
}
