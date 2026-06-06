import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RelayerService } from './relayer.service';

/**
 * Periodically asks the relayer to sweep for stuck transactions (SUBMITTED but
 * unmined past STUCK_TX_SECONDS) and gas-bump-resend them. Kept as its own
 * provider so the scheduling concern is separate from the send logic.
 */
@Injectable()
export class StuckTxWatcher {
  private readonly logger = new Logger(StuckTxWatcher.name);
  private running = false;

  constructor(private readonly relayer: RelayerService) {}

  // Sweep cadence is fixed; the staleness threshold itself is STUCK_TX_SECONDS.
  @Interval('stuck-tx-sweep', 15_000)
  async sweep(): Promise<void> {
    if (this.running) return; // never overlap sweeps
    this.running = true;
    try {
      await this.relayer.sweepStuckTransactions();
    } catch (err) {
      this.logger.error(`Stuck-tx sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
