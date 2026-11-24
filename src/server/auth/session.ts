import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { prisma } from "@/server/db/client";
import { newOpaqueToken, sha256, ipHash } from "@/server/auth/tokens";
import { isProduction } from "@/lib/env";

export const SESSION_COOKIE = "arevei_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000; // extend once a day

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  isSuperAdmin: boolean;
}

export async function createSession(userId: string, meta?: { ip?: string | null; userAgent?: string | null }) {
  const { token, tokenHash } = newOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { userId, tokenHash, expiresAt, ipHash: ipHash(meta?.ip), userAgent: meta?.userAgent?.slice(0, 300) },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: expiresAt,
  });
  return { expiresAt };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  store.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Resolve the signed-in user from the session cookie. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  // Sliding expiry, extended at most once a day to keep writes cheap.
  if (session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - SESSION_REFRESH_AFTER_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
  }
  const u = session.user;
  return { id: u.id, email: u.email, name: u.name, emailVerifiedAt: u.emailVerifiedAt, isSuperAdmin: u.isSuperAdmin };
});

/** Resolve a user from a bearer session token (used by route handlers when cookies are absent). */
export async function getUserBySessionToken(token: string): Promise<CurrentUser | null> {
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const u = session.user;
  return { id: u.id, email: u.email, name: u.name, emailVerifiedAt: u.emailVerifiedAt, isSuperAdmin: u.isSuperAdmin };
}

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  return { ip, userAgent: h.get("user-agent") };
}
