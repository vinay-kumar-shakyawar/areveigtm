/**
 * Background worker. Registers every job handler and subscribes to pg-boss.
 *   npm run worker   (production: JOBS_BACKEND=pgboss)
 */
import "@/server/modules/discovery/service";
import "@/server/modules/enrichment/service";
import "@/server/modules/intelligence/service";
import "@/server/modules/signals/service";
import "@/server/modules/execution/service";
import "@/server/modules/webhooks/service";
import "@/server/modules/inbound/service";
import "@/server/modules/inbox/service";
import { prisma } from "@/server/db/client";
import { defineJob, enqueue, listJobs, scheduleRepeating, startWorker } from "@/server/jobs";
import { logger } from "@/server/logger";

// Every minute, enqueue a tick for each workspace with an active campaign.
defineJob("campaign.tick-all", async () => {
  const active = await prisma.campaign.findMany({ where: { status: "active" }, select: { workspaceId: true }, distinct: ["workspaceId"] });
  for (const { workspaceId } of active) await enqueue("campaign.tick", { workspaceId }, { workspaceId });
});

async function main() {
  process.env.JOBS_BACKEND ??= "pgboss";
  logger.info({ jobs: listJobs() }, "worker starting");
  const boss = await startWorker();
  await scheduleRepeating("campaign.tick-all", "* * * * *");
  await scheduleRepeating("webhook.flush", "* * * * *");
  await scheduleRepeating("inbox.sync-all", "*/2 * * * *");
  const stop = async () => {
    logger.info("worker stopping");
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
