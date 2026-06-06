import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  LedgerAccount,
  LedgerDirection,
  Prisma,
  SettlementStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';

/**
 * Append-only double-entry ledger.
 *
 * Convention (documented once, here):
 *   - GENESIS  : a single CREDIT row holding the operator's on-chain USDC balance
 *                snapshotted at first boot. This is the opening balance.
 *   - OPERATOR : our treasury. A payout DEBITs it (funds leave).
 *   - SETTLED_OUT: cumulative amount paid to counterparties. A payout CREDITs it.
 *
 * Operator balance = opening + Σ(CREDIT OPERATOR) − Σ(DEBIT OPERATOR)
 *                  = opening − Σ(finalized payouts).
 *
 * Rows are NEVER updated or deleted. Idempotency of finalization is enforced by
 * the DB unique(settlementId, account) constraint, not by read-then-write.
 */
@Injectable()
export class LedgerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LedgerService.name);

  /** Fixed instructionId for the pseudo-settlement that anchors the genesis entry. */
  static readonly GENESIS_INSTRUCTION_ID = '__genesis_opening_balance__';

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
  ) {}

  /** Runs after all OnModuleInit hooks (chain is connected) — snapshot opening balance. */
  async onApplicationBootstrap(): Promise<void> {
    await this.ensureOpeningSnapshot();
  }

  /**
   * On first boot only, record the operator's current on-chain balance as the
   * ledger's opening balance. Idempotent: a second boot finds the GENESIS row
   * and does nothing.
   */
  async ensureOpeningSnapshot(): Promise<void> {
    const existing = await this.prisma.ledgerEntry.findFirst({
      where: { account: LedgerAccount.GENESIS },
    });
    if (existing) {
      this.logger.log(
        `Opening balance already snapshotted: ${existing.amount.toString()} USDC`,
      );
      return;
    }

    const opening = await this.chain.getChainBalance();

    await this.prisma.$transaction(async (tx) => {
      // Re-check inside the transaction to close the (single-process) boot race.
      const again = await tx.ledgerEntry.findFirst({
        where: { account: LedgerAccount.GENESIS },
      });
      if (again) return;

      const genesis = await tx.settlement.upsert({
        where: { instructionId: LedgerService.GENESIS_INSTRUCTION_ID },
        update: {},
        create: {
          instructionId: LedgerService.GENESIS_INSTRUCTION_ID,
          toAddress: this.chain.getOperatorAddress(),
          amount: opening,
          status: SettlementStatus.FINAL,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          settlementId: genesis.id,
          account: LedgerAccount.GENESIS,
          direction: LedgerDirection.CREDIT,
          amount: opening,
        },
      });
    });

    this.logger.log(`Opening balance snapshotted: ${opening.toString()} USDC`);
  }

  /**
   * Write the DEBIT/CREDIT pair for a finalized settlement atomically.
   * Returns true if it booked, false if it was already booked (idempotent).
   */
  async recordSettlementFinalized(
    settlementId: string,
    amount: Prisma.Decimal | string,
  ): Promise<boolean> {
    const value = new Prisma.Decimal(amount);
    try {
      await this.prisma.$transaction([
        this.prisma.ledgerEntry.create({
          data: {
            settlementId,
            account: LedgerAccount.OPERATOR,
            direction: LedgerDirection.DEBIT,
            amount: value,
          },
        }),
        this.prisma.ledgerEntry.create({
          data: {
            settlementId,
            account: LedgerAccount.SETTLED_OUT,
            direction: LedgerDirection.CREDIT,
            amount: value,
          },
        }),
      ]);
      this.logger.log(
        `Ledger booked settlement=${settlementId} amount=${value.toString()} (DEBIT OPERATOR / CREDIT SETTLED_OUT)`,
      );
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) {
        // A duplicate Transfer event or reconnect re-check tried to double-book.
        this.logger.warn(
          `Ledger already booked for settlement=${settlementId} — skipping (idempotent)`,
        );
        return false;
      }
      throw err;
    }
  }

  /** Opening on-chain snapshot recorded at first boot (0 if not yet snapshotted). */
  async getOpeningBalance(): Promise<Prisma.Decimal> {
    const genesis = await this.prisma.ledgerEntry.findFirst({
      where: { account: LedgerAccount.GENESIS },
    });
    return genesis ? genesis.amount : new Prisma.Decimal(0);
  }

  /** Operator balance derived purely from the append-only ledger. */
  async getOperatorBalance(): Promise<Prisma.Decimal> {
    const opening = await this.getOpeningBalance();

    const [credits, debits] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: {
          account: LedgerAccount.OPERATOR,
          direction: LedgerDirection.CREDIT,
        },
      }),
      this.prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: {
          account: LedgerAccount.OPERATOR,
          direction: LedgerDirection.DEBIT,
        },
      }),
    ]);

    const creditSum = credits._sum.amount ?? new Prisma.Decimal(0);
    const debitSum = debits._sum.amount ?? new Prisma.Decimal(0);
    return opening.plus(creditSum).minus(debitSum);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
