import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SettlementStatus } from '@prisma/client';
import { SettlementStateService } from '../settlement-state/settlement-state.service';
import { MetricsService } from './metrics.service';

/**
 * Refreshes gauges that are derived from current DB state (rather than
 * incremented at an event site) on a fixed interval.
 */
@Injectable()
export class MetricsCollector {
  private readonly logger = new Logger(MetricsCollector.name);

  constructor(
    private readonly state: SettlementStateService,
    private readonly metrics: MetricsService,
  ) {}

  @Interval('metrics-refresh', 15_000)
  async refresh(): Promise<void> {
    try {
      const counts = await this.state.countByStatus();
      // Set every known status so a status that dropped to 0 is reported as 0.
      for (const status of Object.values(SettlementStatus)) {
        this.metrics.settlementsByStatus.set({ status }, counts[status] ?? 0);
      }
    } catch (err) {
      this.logger.warn(`Metrics refresh failed: ${(err as Error).message}`);
    }
  }
}
