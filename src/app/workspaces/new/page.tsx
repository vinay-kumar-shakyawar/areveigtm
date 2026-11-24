import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/modules/workspace/service";
import { Logo } from "@/components/brand/logo";
import { NewWorkspaceForm } from "./new-workspace-form";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = { title: "New workspace · AREVEI GTM" };

export default async function NewWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/workspaces/new");
  const existing = await listWorkspacesForUser(user.id);
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo />
        <form action={signOutAction}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out ({user.email})
          </Button>
        </form>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Create a workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">A workspace holds one company&apos;s ICPs, leads, campaigns and integrations.</p>
          <NewWorkspaceForm />
          {existing.length > 0 && (
            <p className="mt-6 text-sm text-muted-foreground">
              Or go back to{" "}
              <Link href={`/w/${existing[0].slug}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                {existing[0].name}
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
