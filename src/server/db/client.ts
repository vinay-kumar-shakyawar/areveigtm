import "server-only";
import { PrismaClient } from "@prisma/client";

declare global {
  var __areveiPrisma: PrismaClient | undefined;
}

/**
 * Single Prisma client per process. In development Next.js hot-reloads modules,
 * so the instance is cached on globalThis to avoid exhausting connections.
 */
export const prisma: PrismaClient =
  globalThis.__areveiPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalThis.__areveiPrisma = prisma;

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
