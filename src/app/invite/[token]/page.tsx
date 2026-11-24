import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { acceptInvitation, previewInvitation } from "@/server/modules/workspace/service";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const invitation = await previewInvitation(token);
  const user = await getCurrentUser();

  async function accept() {
    "use server";
    const u = await getCurrentUser();
    if (!u) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
    const ws = await acceptInvitation(token, u.id, u.email);
    redirect(`/w/${ws.slug}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
          {!invitation ? (
            <>
              <h1 className="text-xl font-semibold">This invitation is no longer valid</h1>
              <p className="mt-2 text-sm text-muted-foreground">Ask a workspace admin to send a new one.</p>
              <Button render={<Link href="/" />} nativeButton={false} className="mt-6">
                Go to AREVEI GTM
              </Button>
            </>
          ) : !user ? (
            <>
              <h1 className="text-xl font-semibold">Join {invitation.workspace.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in with <span className="font-medium text-foreground">{invitation.email}</span> to accept this invitation.
              </p>
              <Button render={<Link href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`} />} nativeButton={false} className="mt-6 w-full">
                Sign in to continue
              </Button>
            </>
          ) : user.email !== invitation.email ? (
            <>
              <h1 className="text-xl font-semibold">Wrong account</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This invitation was sent to {invitation.email}, but you are signed in as {user.email}.
              </p>
            </>
          ) : (
            <form action={accept}>
              <h1 className="text-xl font-semibold">Join {invitation.workspace.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">You will join as {invitation.role}.</p>
              <Button type="submit" className="mt-6 w-full">
                Accept invitation
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
