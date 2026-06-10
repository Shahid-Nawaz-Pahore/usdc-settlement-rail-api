import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsCollector } from './metrics.collector';
import { SettlementStateModule } from '../settlement-state/settlement-state.module';

/**
 * Global so any service (relayer, listener, reconciliation) can inject
 * MetricsService without re-importing. One-way dependency on settlement-state
 * (for the by-status gauge) — no module here is imported back, so no cycles.
 */
@Global()
@Module({
  imports: [SettlementStateModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsCollector],
  exports: [MetricsService],
})
export class ObservabilityModule {}
