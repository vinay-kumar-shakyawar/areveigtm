import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset password · AREVEI GTM" };

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">We will email you a one-time code to choose a new password.</p>
      <ForgotForm />
    </div>
  );
}
