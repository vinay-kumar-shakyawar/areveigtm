import { verifyUnsubscribeToken } from "@/server/modules/channels/email";
import { Logo } from "@/components/brand/logo";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata = { title: "Unsubscribe" };

/** Public unsubscribe landing page linked from every outbound email footer. */
export default async function UnsubscribePage(props: PageProps<"/u/[token]">) {
  const { token } = await props.params;
  const [payload, sig] = decodeURIComponent(token).split(".");
  const data = payload && sig ? verifyUnsubscribeToken(payload, sig) : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">
        <Logo className="mb-6" />
        {data ? (
          <UnsubscribeForm token={token} email={data.email} />
        ) : (
          <>
            <h1 className="text-lg font-semibold">This link is not valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">The unsubscribe link is malformed or was altered. Reply to the email you received and we will remove you manually.</p>
          </>
        )}
      </div>
    </main>
  );
}
