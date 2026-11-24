import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · AREVEI GTM" };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const user = await getCurrentUser();
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  if (user) redirect(next);
  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use your password or get a one-time code by email.</p>
      <SignInForm next={next} />
      <p className="mt-6 text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
