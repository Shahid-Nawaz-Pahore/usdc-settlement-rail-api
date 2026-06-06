-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('RECEIVED', 'REJECTED_COMPLIANCE', 'COMPLIANCE_APPROVED', 'SUBMITTED', 'CONFIRMED', 'FINAL', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('OPERATOR', 'SETTLED_OUT', 'GENESIS');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'MISMATCH');

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "instructionId" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" DECIMAL(38,6) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'RECEIVED',
    "txHash" TEXT,
    "nonce" INTEGER,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(38,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusTransition" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "fromStatus" "SettlementStatus" NOT NULL,
    "toStatus" "SettlementStatus" NOT NULL,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "ledgerBalance" DECIMAL(38,6) NOT NULL,
    "chainBalance" DECIMAL(38,6) NOT NULL,
    "pendingAmount" DECIMAL(38,6) NOT NULL,
    "diff" DECIMAL(38,6) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_instructionId_key" ON "Settlement"("instructionId");

-- CreateIndex
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- CreateIndex
CREATE INDEX "Settlement_createdAt_idx" ON "Settlement"("createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_idx" ON "LedgerEntry"("account");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_settlementId_account_key" ON "LedgerEntry"("settlementId", "account");

-- CreateIndex
CREATE INDEX "StatusTransition_settlementId_idx" ON "StatusTransition"("settlementId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusTransition" ADD CONSTRAINT "StatusTransition_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

