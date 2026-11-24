"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { consumeCode, issueCode, registerUser, resetPasswordWithCode, signInWithPassword } from "@/server/auth/service";
import { createSession, destroySession, requestMeta } from "@/server/auth/session";
import { ApiError } from "@/server/api/errors";
import { rateLimit } from "@/server/api/rate-limit";

export interface FormState {
  error?: string;
  field?: string;
  ok?: boolean;
  email?: string;
}

function safeNext(next: unknown): string {
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

async function guard(key: string) {
  const meta = await requestMeta();
  await rateLimit(`auth:${key}:${meta.ip ?? "local"}`, 20, 300);
  return meta;
}

function fail(err: unknown): FormState {
  if (err instanceof ApiError) {
    const field = (err.details as { field?: string } | undefined)?.field;
    return { error: err.message, field };
  }
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Invalid input" };
  throw err;
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = z
    .object({ email: z.string().email("Enter a valid work email"), password: z.string().min(1, "Enter your password"), next: z.string().optional() })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return fail(input.error);
  try {
    const meta = await guard("sign-in");
    const user = await signInWithPassword(input.data);
    await createSession(user.id, meta);
  } catch (err) {
    return fail(err);
  }
  redirect(safeNext(input.data.next));
}

export async function requestCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = z.object({ email: z.string().email("Enter a valid work email") }).safeParse(Object.fromEntries(formData));
  if (!input.success) return fail(input.error);
  try {
    await guard("code");
    await issueCode(input.data.email, "sign_in");
  } catch (err) {
    return fail(err);
  }
  return { ok: true, email: input.data.email.toLowerCase() };
}

export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = z
    .object({
      email: z.string().email(),
      code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
      purpose: z.enum(["sign_in", "verify_email"]).default("sign_in"),
      next: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return fail(input.error);
  try {
    const meta = await guard("verify");
    const user = await consumeCode(input.data.email, input.data.purpose, input.data.code);
    await createSession(user.id, meta);
  } catch (err) {
    return fail(err);
  }
  redirect(safeNext(input.data.next));
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = z
    .object({
      name: z.string().trim().min(1, "Enter your name").max(80),
      email: z.string().email("Enter a valid work email"),
      password: z.string().min(1, "Choose a password"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return fail(input.error);
  try {
    const meta = await guard("register");
    const user = await registerUser(input.data);
    await createSession(user.id, meta);
  } catch (err) {
    return fail(err);
  }
  redirect(`/verify?email=${encodeURIComponent(input.data.email.toLowerCase())}&purpose=verify_email`);
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = z.object({ email: z.string().email("Enter a valid work email") }).safeParse(Object.fromEntries(formData));
  if (!input.success) return fail(input.error);
  try {
    await guard("forgot");
    await issueCode(input.data.email, "password_reset");
  } catch (err) {
    return fail(err);
  }
  return { ok: true, email: input.data.email.toLowerCase() };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = z
    .object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"), password: z.string().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return fail(input.error);
  try {
    const meta = await guard("reset");
    const user = await resetPasswordWithCode(input.data.email, input.data.code, input.data.password);
    await createSession(user.id, meta);
  } catch (err) {
    return fail(err);
  }
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/sign-in");
}
