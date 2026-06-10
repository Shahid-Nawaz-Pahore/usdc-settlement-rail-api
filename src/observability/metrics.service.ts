import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics for the settlement rail. One registry, exposed at /metrics.
 * Event sites (relayer, listener, reconciliation) increment counters/gauges;
 * MetricsCollector refreshes the by-status gauge from the DB on an interval.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /** USDC transfer broadcasts from the relayer (new sends + gas-bump resends). */
  readonly broadcasts = new Counter({
    name: 'relayer_broadcasts_total',
    help: 'Total USDC transfer broadcasts (new sends and gas-bump resends)',
    registers: [this.registry],
  });

  /** Cumulative gas spent in wei (gasUsed × effectiveGasPrice) on finalized txs. */
  readonly gasWei = new Counter({
    name: 'relayer_gas_wei_total',
    help: 'Cumulative gas spent in wei across finalized settlements',
    registers: [this.registry],
  });

  /** Reconciliation runs labelled by outcome. */
  readonly reconRuns = new Counter({
    name: 'reconciliation_runs_total',
    help: 'Reconciliation runs by status',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });

  /** Reconciliation mismatches (also counted in reconRuns; broken out for alerting). */
  readonly reconMismatches = new Counter({
    name: 'reconciliation_mismatches_total',
    help: 'Reconciliation runs that ended in MISMATCH',
    registers: [this.registry],
  });

  /** Chain reorgs detected on an in-flight settlement (reverted to SUBMITTED). */
  readonly reorgs = new Counter({
    name: 'chain_reorgs_total',
    help: 'In-flight settlements reverted because their tx was reorged',
    registers: [this.registry],
  });

  /** Relayer in-flight queue depth (queued + broadcast-not-yet-mined). */
  readonly queueDepth = new Gauge({
    name: 'relayer_queue_depth',
    help: 'Relayer queued + in-flight settlement count',
    registers: [this.registry],
  });

  /** Current settlement count by status (refreshed by MetricsCollector). */
  readonly settlementsByStatus = new Gauge({
    name: 'settlements_by_status',
    help: 'Current number of settlements in each status',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });

  constructor() {
    // Node/process metrics (event loop lag, heap, GC, etc.).
    collectDefaultMetrics({ register: this.registry });
  }

  contentType(): string {
    return this.registry.contentType;
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
