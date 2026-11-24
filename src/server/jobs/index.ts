import "server-only";
import { nanoid } from "nanoid";
import { prisma } from "@/server/db/client";
import { logger } from "@/server/logger";
import { env } from "@/lib/env";

/**
 * Job abstraction. Handlers are registered once (`defineJob`) and enqueued
 * with `enqueue`. Backends:
 *  - inline: runs the handler immediately in-process (development, tests, or
 *    JOBS_BACKEND=inline). Safe because handlers are idempotent.
 *  - pgboss: Postgres-backed queue (production). The worker process
 *    (`npm run worker`) registers the same handlers via `startWorker()`.
 */
export type JobHandler<T> = (payload: T, ctx: { jobId: string; attempt: number }) => Promise<void>;

interface JobDef<T = unknown> {
  name: string;
  handler: JobHandler<T>;
  options?: { retryLimit?: number; retryDelaySeconds?: number; singletonKey?: (payload: T) => string | undefined };
}

const registry = new Map<string, JobDef>();

export function defineJob<T>(name: string, handler: JobHandler<T>, options?: JobDef<T>["options"]): { name: string } {
  registry.set(name, { name, handler: handler as JobHandler<unknown>, options: options as JobDef["options"] });
  return { name };
}

function backend(): "inline" | "pgboss" {
  const forced = process.env.JOBS_BACKEND;
  if (forced === "inline" || forced === "pgboss") return forced;
  return env().NODE_ENV === "production" ? "pgboss" : "inline";
}

let bossPromise: Promise<import("pg-boss").PgBoss> | null = null;
async function boss() {
  if (!bossPromise) {
    bossPromise = (async () => {
      const { PgBoss } = await import("pg-boss");
      const b = new PgBoss({ connectionString: env().DATABASE_URL, schema: "pgboss" });
      b.on("error", (err: unknown) => logger.error({ err }, "pg-boss error"));
      await b.start();
      return b;
    })();
  }
  return bossPromise;
}

export async function enqueue<T extends object>(name: string, payload: T, options?: { workspaceId?: string; startAfterSeconds?: number }): Promise<{ jobId: string; ran: "inline" | "queued" }> {
  const def = registry.get(name);
  if (!def) throw new Error(`Unknown job ${name}`);
  const jobId = nanoid(16);
  const summary = JSON.parse(JSON.stringify(payload)) as object;
  await prisma.backgroundJob.create({
    data: { workspaceId: options?.workspaceId, queue: name, jobId, name, status: "queued", payloadSummary: summary },
  });
  if (backend() === "pgboss") {
    const b = await boss();
    await b.createQueue(name).catch(() => {});
    await b.send(name, { ...payload, __jobId: jobId }, {
      retryLimit: def.options?.retryLimit ?? 3,
      retryDelay: def.options?.retryDelaySeconds ?? 30,
      retryBackoff: true,
      startAfter: options?.startAfterSeconds,
      singletonKey: def.options?.singletonKey?.(payload as never),
    });
    return { jobId, ran: "queued" };
  }
  await runJob(def, payload, jobId, 1);
  return { jobId, ran: "inline" };
}

async function runJob(def: JobDef, payload: unknown, jobId: string, attempt: number) {
  await prisma.backgroundJob.updateMany({ where: { queue: def.name, jobId }, data: { status: "active", startedAt: new Date(), attempts: attempt } });
  try {
    await def.handler(payload, { jobId, attempt });
    await prisma.backgroundJob.updateMany({ where: { queue: def.name, jobId }, data: { status: "completed", finishedAt: new Date() } });
  } catch (err) {
    logger.error({ err, job: def.name, jobId }, "job failed");
    await prisma.backgroundJob.updateMany({ where: { queue: def.name, jobId }, data: { status: "failed", finishedAt: new Date(), error: (err as Error).message?.slice(0, 1000) } });
    throw err;
  }
}

/** Called by the worker process: subscribes every registered job. */
export async function startWorker() {
  const b = await boss();
  for (const def of registry.values()) {
    await b.createQueue(def.name).catch(() => {});
    await b.work(def.name, { batchSize: 1 }, async (jobs: { id: string; data: unknown; retryCount?: number }[]) => {
      for (const job of jobs) {
        const { __jobId, ...payload } = job.data as { __jobId?: string } & Record<string, unknown>;
        await runJob(def, payload, __jobId ?? job.id, (job.retryCount ?? 0) + 1);
      }
    });
    logger.info({ job: def.name }, "worker subscribed");
  }
  return b;
}

export async function scheduleRepeating(name: string, cron: string, payload: object = {}) {
  const b = await boss();
  await b.createQueue(name).catch(() => {});
  await b.schedule(name, cron, payload);
}

export function listJobs(): string[] {
  return [...registry.keys()];
}
