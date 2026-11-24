-- AlterEnum
ALTER TYPE "InboundMode" ADD VALUE 'graph_poll';

-- AlterTable
ALTER TABLE "SenderAccount" ADD COLUMN "inboundCursor" JSONB;
