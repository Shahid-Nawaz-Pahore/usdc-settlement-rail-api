-- Reorg-aware finality: remember which block a tx was confirmed in so a chain
-- reorg (block hash change, or tx dropped from the canonical chain) is detectable.
ALTER TABLE "Settlement" ADD COLUMN "confirmedBlockHash" TEXT;
ALTER TABLE "Settlement" ADD COLUMN "confirmedBlockNumber" INTEGER;
