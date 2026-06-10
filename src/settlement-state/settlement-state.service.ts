import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  Settlement,
  SettlementStatus,
  StatusTransition,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Statuses that still draw against the available balance (not yet in the ledger). */
export const IN_FLIGHT_STATUSES: SettlementStatus[] = [
  SettlementStatus.RECEIVED,
  SettlementStatus.COMPLIANCE_APPROVED,
  SettlementStatus.SUBMITTED,
  SettlementStatus.CONFIRMED,
];

/** On-chain but not yet finalized by our confirmation depth. */
export const PENDING_STATUSES: SettlementStatus[] = [
  SettlementStatus.SUBMITTED,
  SettlementStatus.CONFIRMED,
];

export interface TransitionOptions {
  txHash?: string | null;
  nonce?: number | null;
  failureReason?: string | null;
  retryCount?: number;
  confirmedBlockHash?: string | null;
  confirmedBlockNumber?: number | null;
  /** If set, the transition is skipped (no-op) unless current status is one of these. */
  expectedFrom?: SettlementStatus[];
}

/**
 * The Settlement aggregate's data-access layer. The one place that mutates
 * Settlement.status — and it always writes the StatusTransition audit row inside
 * the SAME transaction, with structured logging. Shared by relayer, listener,
 * API and reconciliation to keep them free of cycles.
 */
@Injectable()
export class SettlementStateService {
  private readonly logger = new Logger(SettlementStateService.name);

  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    instructionId: string;
    toAddress: string;
    amount: Prisma.Decimal | string;
    status?: SettlementStatus;
  }): Promise<Settlement> {
    return this.prisma.settlement.create({
      data: {
        instructionId: data.instructionId,
        toAddress: data.toAddress,
        amount: new Prisma.Decimal(data.amount),
        status: data.status ?? SettlementStatus.RECEIVED,
      },
    });
  }

  findById(id: string): Promise<Settlement | null> {
    return this.prisma.settlement.findUnique({ where: { id } });
  }

  findByInstructionId(instructionId: string): Promise<Settlement | null> {
    return this.prisma.settlement.findUnique({ where: { instructionId } });
  }

  findByTxHash(txHash: string): Promise<Settlement | null> {
    return this.prisma.settlement.findFirst({ where: { txHash } });
  }

  findByStatuses(statuses: SettlementStatus[]): Promise<Settlement[]> {
    return this.prisma.settlement.findMany({
      where: { status: { in: statuses } },
    });
  }

  /** Append-only audit trail for a settlement, oldest transition first. */
  getTransitions(settlementId: string): Promise<StatusTransition[]> {
    return this.prisma.statusTransition.findMany({
      where: { settlementId },
      orderBy: { createdAt: 'asc' },
    });
  }

  listRecent(): Promise<Settlement[]> {
    return this.prisma.settlement.findMany({
      where: {
        instructionId: { not: '__genesis_opening_balance__' },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Σ amount across the given statuses (0 if none). */
  async sumByStatuses(statuses: SettlementStatus[]): Promise<Prisma.Decimal> {
    const agg = await this.prisma.settlement.aggregate({
      _sum: { amount: true },
      where: { status: { in: statuses } },
    });
    return agg._sum.amount ?? new Prisma.Decimal(0);
  }

  /** Count of real settlements per status (excludes the GENESIS pseudo-row). */
  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.prisma.settlement.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { instructionId: { not: '__genesis_opening_balance__' } },
    });
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = row._count._all;
    return counts;
  }

  /**
   * Atomically: update the settlement's status (+ optional fields) and append a
   * StatusTransition row, in a single DB transaction. Returns the updated row,
   * or null if an expectedFrom guard rejected the transition.
   */
  async transition(
    id: string,
    toStatus: SettlementStatus,
    opts: TransitionOptions = {},
  ): Promise<Settlement | null> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.settlement.findUnique({ where: { id } });
      if (!current) {
        throw new Error(`Settlement ${id} not found for transition`);
      }

      if (opts.expectedFrom && !opts.expectedFrom.includes(current.status)) {
        return null; // illegal/stale transition — ignore
      }

      const data: Prisma.SettlementUpdateInput = { status: toStatus };
      if (opts.txHash !== undefined) data.txHash = opts.txHash;
      if (opts.nonce !== undefined) data.nonce = opts.nonce;
      if (opts.failureReason !== undefined)
        data.failureReason = opts.failureReason;
      if (opts.retryCount !== undefined) data.retryCount = opts.retryCount;
      if (opts.confirmedBlockHash !== undefined)
        data.confirmedBlockHash = opts.confirmedBlockHash;
      if (opts.confirmedBlockNumber !== undefined)
        data.confirmedBlockNumber = opts.confirmedBlockNumber;

      const next = await tx.settlement.update({ where: { id }, data });

      await tx.statusTransition.create({
        data: {
          settlementId: id,
          fromStatus: current.status,
          toStatus,
          txHash: opts.txHash ?? current.txHash ?? null,
        },
      });

      return next;
    });

    if (updated) {
      this.logger.log(
        `Settlement ${id} -> ${toStatus} txHash=${updated.txHash ?? 'n/a'}`,
      );
    }
    return updated;
  }

  /**
   * Record a gas-bump resend: new txHash + retryCount, status stays SUBMITTED.
   * Not a status change, so no StatusTransition row — logged instead.
   */
  async recordResend(
    id: string,
    txHash: string,
    retryCount: number,
  ): Promise<Settlement> {
    const updated = await this.prisma.settlement.update({
      where: { id },
      data: { txHash, retryCount },
    });
    this.logger.warn(
      `Settlement ${id} resend #${retryCount} newTxHash=${txHash} (same nonce ${updated.nonce})`,
    );
    return updated;
  }
}
