import { describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/server/db/client";

vi.mock("@/server/email/system-mailer", () => ({ sendSystemEmail: vi.fn(async () => {}) }));

const { sendSystemEmail } = await import("@/server/email/system-mailer");
const { registerUser, signInWithPassword, issueCode, consumeCode, resetPasswordWithCode } = await import("@/server/auth/service");

function lastCode(): string {
  const calls = (sendSystemEmail as unknown as { mock: { calls: { text: string }[][] } }).mock.calls;
  const text = calls[calls.length - 1][0].text;
  const m = /Your code is (\d{6})/.exec(text);
  if (!m) throw new Error("no code in email");
  return m[1];
}

describe("auth service", () => {
  it("registers with a strong password and signs in", async () => {
    const email = `${nanoid(6).toLowerCase()}@test.local`;
    const user = await registerUser({ email, password: "correct-horse-9", name: "Ann" });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain("correct-horse");
    const signedIn = await signInWithPassword({ email: email.toUpperCase(), password: "correct-horse-9" });
    expect(signedIn.id).toBe(user.id);
    await expect(signInWithPassword({ email, password: "wrong" })).rejects.toThrow(/Incorrect/);
  });

  it("rejects weak passwords and duplicate emails", async () => {
    const email = `${nanoid(6).toLowerCase()}@test.local`;
    await expect(registerUser({ email, password: "short" })).rejects.toThrow(/at least 10/);
    await registerUser({ email, password: "longenough123" });
    await expect(registerUser({ email, password: "longenough123" })).rejects.toThrow(/already exists/);
  });

  it("signs in with an emailed one-time code and creates the user on first use", async () => {
    const email = `${nanoid(6).toLowerCase()}@test.local`;
    await issueCode(email, "sign_in");
    const code = lastCode();
    await expect(consumeCode(email, "sign_in", "000000")).rejects.toThrow(/not correct|expired/);
    const user = await consumeCode(email, "sign_in", code);
    expect(user.email).toBe(email);
    expect(user.emailVerifiedAt).toBeTruthy();
    // A consumed code cannot be reused.
    await expect(consumeCode(email, "sign_in", code)).rejects.toThrow();
  });

  it("locks a code after too many attempts", async () => {
    const email = `${nanoid(6).toLowerCase()}@test.local`;
    await issueCode(email, "sign_in");
    for (let i = 0; i < 5; i++) await consumeCode(email, "sign_in", "111111").catch(() => {});
    await expect(consumeCode(email, "sign_in", lastCode())).rejects.toThrow(/Too many/);
  });

  it("resets a password with a code and invalidates sessions", async () => {
    const email = `${nanoid(6).toLowerCase()}@test.local`;
    const user = await registerUser({ email, password: "firstpass123" });
    await prisma.session.create({ data: { userId: user.id, tokenHash: nanoid(20), expiresAt: new Date(Date.now() + 1000) } });
    await issueCode(email, "password_reset");
    await resetPasswordWithCode(email, lastCode(), "secondpass123");
    await expect(signInWithPassword({ email, password: "secondpass123" })).resolves.toBeTruthy();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });
});
