import { VerifyForm } from "./verify-form";

export const metadata = { title: "Verify email · AREVEI GTM" };

export default async function VerifyPage(props: PageProps<"/verify">) {
  const sp = await props.searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const purpose = sp.purpose === "verify_email" ? "verify_email" : "sign_in";
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the 6-digit code we sent to <span className="font-medium text-foreground">{email || "your email"}</span>.
      </p>
      <VerifyForm email={email} purpose={purpose} next={next} />
    </div>
  );
}
