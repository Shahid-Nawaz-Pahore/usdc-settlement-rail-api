import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import {
  Prisma,
  ReconciliationRun,
  ReconciliationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';
import { LedgerService } from '../ledger/ledger.service';
import {
  PENDING_STATUSES,
  SettlementStateService,
} from '../settlement-state/settlement-state.service';
import { AppConfigService } from '../config/app-config.service';

// Tolerance below USDC's 6-dp resolution: anything smaller is rounding noise.
const EPSILON = new Prisma.Decimal('0.000001');

/**
 * Continuously checks that the internal ledger agrees with the chain:
 *
 *   ledgerBalance − pendingAmount ≈ chainBalance
 *
 * Intuition: the ledger only records FINAL settlements, while the chain already
 * reflects every mined (but not-yet-final) transfer. Subtracting the pending
 * amount bridges the two. A mismatch is logged loudly and never auto-corrected —
 * it means a settlement moved on one side but not the other.
 */
@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    private readonly ledger: LedgerService,
    private readonly state: SettlementStateService,
    private readonly config: AppConfigService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    // Cron expression comes from config, so register the job dynamically.
    const job = new CronJob(this.config.reconCron, () => {
      void this.run().catch((err: Error) =>
        this.logger.error(`Scheduled reconciliation failed: ${err.message}`),
      );
    });
    this.registry.addCronJob('reconciliation', job);
    job.start();
    this.logger.log(`Reconciliation scheduled: "${this.config.reconCron}"`);
  }

  async run(): Promise<ReconciliationRun> {
    const [ledgerBalance, chainBalance, pendingAmount] = await Promise.all([
      this.ledger.getOperatorBalance(),
      this.chain.getChainBalance(),
      this.state.sumByStatuses(PENDING_STATUSES),
    ]);

    const diff = ledgerBalance.minus(pendingAmount).minus(chainBalance);
    const matched = diff.abs().lt(EPSILON);
    const status = matched
      ? ReconciliationStatus.MATCHED
      : ReconciliationStatus.MISMATCH;

    const record = await this.prisma.reconciliationRun.create({
      data: {
        ledgerBalance,
        chainBalance,
        pendingAmount,
        diff,
        status,
      },
    });

    if (matched) {
      this.logger.log(
        `Reconciliation MATCHED ledger=${ledgerBalance.toString()} pending=${pendingAmount.toString()} chain=${chainBalance.toString()}`,
      );
    } else {
      // Surface every number; a human must investigate. Never auto-correct.
      this.logger.error(
        `Reconciliation MISMATCH diff=${diff.toString()} ` +
          `ledgerBalance=${ledgerBalance.toString()} ` +
          `pendingAmount=${pendingAmount.toString()} ` +
          `chainBalance=${chainBalance.toString()}`,
      );
    }

    return record;
  }
}
