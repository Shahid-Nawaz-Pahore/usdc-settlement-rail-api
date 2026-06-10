import { Logger } from '@nestjs/common';
import { IEventPublisher, SettlementEvent } from './event-publisher.interface';

/**
 * Graceful-degrade publisher used when REDIS_URL is unset: events are still
 * written to the outbox table and logged here, so the service runs without a
 * broker (e.g. on the serverless demo).
 */
export class LogPublisher implements IEventPublisher {
  private readonly logger = new Logger(LogPublisher.name);

  publish(event: SettlementEvent): Promise<void> {
    this.logger.log(
      `event ${event.type} settlement=${event.settlementId} (no broker configured)`,
    );
    return Promise.resolve();
  }
}
