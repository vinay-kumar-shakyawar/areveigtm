import "server-only";
import { prisma } from "@/server/db/client";
import { hashPassword, verifyPassword, passwordPolicyIssues } from "@/server/auth/password";
import { codeHash, newOneTimeCode, safeEqualHex } from "@/server/auth/tokens";
import { sendSystemEmail } from "@/server/email/system-mailer";
import { ApiError } from "@/server/api/errors";
import { logger } from "@/server/logger";
import type { CodePurpose } from "@prisma/client";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function registerUser(input: { email: string; password: string; name?: string }) {
  const email = normalizeEmail(input.email);
  const issues = passwordPolicyIssues(input.password);
  if (issues.length) throw ApiError.invalid(issues.join(" "), { field: "password" });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ApiError.conflict("An account with this email already exists", { field: "email" });
  const user = await prisma.user.create({
    data: { email, name: input.name?.trim() || null, passwordHash: await hashPassword(input.password) },
  });
  await issueCode(email, "verify_email");
  return user;
}

export async function signInWithPassword(input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-ish time: always run a verify even when the user is missing.
  const ok = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", input.password).then(() => false);
  if (!user || !ok) throw ApiError.unauthorized("Incorrect email or password");
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

/** Issue a 6-digit code for sign-in, verification or password reset. Always succeeds to avoid account enumeration. */
export async function issueCode(rawEmail: string, purpose: CodePurpose) {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user && purpose !== "sign_in") {
    logger.info({ purpose }, "code requested for unknown email; skipping");
    return;
  }
  const code = newOneTimeCode();
  await prisma.emailVerificationCode.updateMany({
    where: { email, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.emailVerificationCode.create({
    data: { email, purpose, codeHash: codeHash(email, purpose, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  const subjects: Record<CodePurpose, string> = {
    sign_in: "Your AREVEI GTM sign-in code",
    verify_email: "Confirm your email for AREVEI GTM",
    password_reset: "Reset your AREVEI GTM password",
  };
  await sendSystemEmail({
    to: email,
    subject: subjects[purpose],
    text: `Your code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
  });
}

/** Verify a code; returns the user (creating one for sign_in if the email is new). */
export async function consumeCode(rawEmail: string, purpose: CodePurpose, code: string) {
  const email = normalizeEmail(rawEmail);
  const record = await prisma.emailVerificationCode.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt.getTime() < Date.now()) throw ApiError.invalid("That code has expired. Request a new one.");
  if (record.attempts >= MAX_CODE_ATTEMPTS) throw ApiError.invalid("Too many attempts. Request a new code.");
  const matches = safeEqualHex(record.codeHash, codeHash(email, purpose, code.trim()));
  if (!matches) {
    await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw ApiError.invalid("That code is not correct.");
  }
  await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    if (purpose !== "sign_in") throw ApiError.notFound("account");
    user = await prisma.user.create({ data: { email, emailVerifiedAt: new Date() } });
  } else if (!user.emailVerifiedAt) {
    user = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

export async function resetPasswordWithCode(rawEmail: string, code: string, newPassword: string) {
  const issues = passwordPolicyIssues(newPassword);
  if (issues.length) throw ApiError.invalid(issues.join(" "), { field: "password" });
  const user = await consumeCode(rawEmail, "password_reset", code);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash && !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw ApiError.invalid("Current password is incorrect", { field: "currentPassword" });
  }
  const issues = passwordPolicyIssues(newPassword);
  if (issues.length) throw ApiError.invalid(issues.join(" "), { field: "newPassword" });
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
}
