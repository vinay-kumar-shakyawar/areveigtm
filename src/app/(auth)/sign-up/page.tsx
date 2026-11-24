import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create account · AREVEI GTM" };

export default async function SignUpPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">You will create a workspace next.</p>
      <SignUpForm />
      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
