import "server-only";
import { hash, verify } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export function passwordPolicyIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 10) issues.push("Use at least 10 characters.");
  if (password.length > 128) issues.push("Use at most 128 characters.");
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) issues.push("Mix letters and numbers.");
  return issues;
}
