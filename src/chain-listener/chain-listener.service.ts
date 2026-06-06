import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Settlement, SettlementStatus } from '@prisma/client';
import { ChainService } from '../chain/chain.service';
import { AppConfigService } from '../config/app-config.service';
import { LedgerService } from '../ledger/ledger.service';
import { SettlementStateService } from '../settlement-state/settlement-state.service';

/**
 * The chain is the source of truth. This service:
 *  1. Subscribes (WSS) to USDC Transfer events FROM the operator — a fast signal
 *     that one of our sends just landed in a block.
 *  2. Drives confirmation depth by POLLING each pending receipt every ~5s
 *     (cheaper and steadier than reacting to every new block).
 *
 * Transitions: SUBMITTED → CONFIRMED at CONFIRMATIONS_CONFIRMED, → FINAL at
 * CONFIRMATIONS_FINAL. Finalization books the ledger (idempotently) BEFORE
 * flipping to FINAL so a crash in between cannot orphan the ledger entry.
 */
@Injectable()
export class ChainListenerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChainListenerService.name);
  private polling = false;

  constructor(
    private readonly chain: ChainService,
    private readonly config: AppConfigService,
    private readonly state: SettlementStateService,
    private readonly ledger: LedgerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.subscribeTransfers();
    // On every reconnect: re-attach the subscription AND re-check open
    // settlements via receipts, so events missed while offline don't orphan them.
    this.chain.onWssReconnect(async () => {
      this.subscribeTransfers();
      await this.pollConfirmations();
    });
    // Back-fill anything already open at boot.
    await this.pollConfirmations();
  }

  /** Attach the Transfer(from = operator) subscription to the current WSS contract. */
  private subscribeTransfers(): void {
    const operator = this.chain.getOperatorAddress();
    const contract = this.chain.getUsdcEventsContract();
    const filter = contract.filters.Transfer(operator);

    void contract.removeAllListeners(filter);
    void contract.on(filter, (...args: unknown[]) => {
      const payload = args[args.length - 1] as
        | { log?: { transactionHash?: string } }
        | undefined;
      const txHash = payload?.log?.transactionHash;
      if (!txHash) return;
      this.logger.debug(`Transfer event from operator tx=${txHash}`);
      // Process just this tx promptly; the interval poll is the safety net.
      void this.processByTxHash(txHash);
    });
    this.logger.log(`Subscribed to USDC Transfer events from=${operator}`);
  }

  @Interval('confirmation-poll', 5_000)
  async pollConfirmations(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const open = await this.state.findByStatuses([
        SettlementStatus.SUBMITTED,
        SettlementStatus.CONFIRMED,
      ]);
      if (open.length === 0) return;
      const currentBlock = await this.chain.getCurrentBlock();
      for (const s of open) {
        await this.processReceipt(s, currentBlock);
      }
    } catch (err) {
      this.logger.error(`Confirmation poll failed: ${(err as Error).message}`);
    } finally {
      this.polling = false;
    }
  }

  private async processByTxHash(txHash: string): Promise<void> {
    const settlement = await this.state.findByTxHash(txHash);
    if (!settlement) return;
    if (
      settlement.status !== SettlementStatus.SUBMITTED &&
      settlement.status !== SettlementStatus.CONFIRMED
    ) {
      return;
    }
    const currentBlock = await this.chain.getCurrentBlock();
    await this.processReceipt(settlement, currentBlock);
  }

  private async processReceipt(
    settlement: Settlement,
    currentBlock: number,
  ): Promise<void> {
    if (!settlement.txHash) return;

    const receipt = await this.chain
      .getProvider()
      .getTransactionReceipt(settlement.txHash);
    if (!receipt) return; // not mined yet — relayer's stuck-watcher owns this case

    if (receipt.status === 0) {
      // Mined but reverted — terminal failure.
      await this.state.transition(settlement.id, SettlementStatus.FAILED, {
        failureReason: 'REVERTED_ONCHAIN',
        expectedFrom: [SettlementStatus.SUBMITTED, SettlementStatus.CONFIRMED],
      });
      return;
    }

    const confirmations = currentBlock - receipt.blockNumber + 1;

    if (confirmations >= this.config.confirmationsFinal) {
      await this.finalize(settlement);
    } else if (
      confirmations >= this.config.confirmationsConfirmed &&
      settlement.status === SettlementStatus.SUBMITTED
    ) {
      await this.state.transition(settlement.id, SettlementStatus.CONFIRMED, {
        txHash: settlement.txHash,
        expectedFrom: [SettlementStatus.SUBMITTED],
      });
      this.logger.log(
        `Settlement ${settlement.id} CONFIRMED (${confirmations} confs)`,
      );
    }
  }

  private async finalize(settlement: Settlement): Promise<void> {
    // Book the ledger FIRST (idempotent via unique constraint), then flip status.
    await this.ledger.recordSettlementFinalized(
      settlement.id,
      settlement.amount,
    );
    const moved = await this.state.transition(
      settlement.id,
      SettlementStatus.FINAL,
      {
        txHash: settlement.txHash,
        expectedFrom: [SettlementStatus.SUBMITTED, SettlementStatus.CONFIRMED],
      },
    );
    if (moved) {
      this.logger.log(
        `Settlement ${settlement.id} FINAL tx=${settlement.txHash}`,
      );
    }
  }
}
