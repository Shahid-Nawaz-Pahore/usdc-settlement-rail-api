import { Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { IEventPublisher, SettlementEvent } from './event-publisher.interface';

/**
 * Publishes settlement events to a Redis Stream (XADD). A clearing system
 * consumes the stream (e.g. consumer groups) to drive its own trade lifecycle.
 */
export class RedisStreamPublisher implements IEventPublisher, OnModuleDestroy {
  private readonly logger = new Logger(RedisStreamPublisher.name);
  static readonly STREAM = 'settlement-events';

  constructor(private readonly redis: Redis) {
    this.redis.on('error', (err) =>
      this.logger.warn(`Redis error: ${err.message}`),
    );
  }

  async publish(event: SettlementEvent): Promise<void> {
    await this.redis.xadd(
      RedisStreamPublisher.STREAM,
      '*',
      'eventId',
      event.id,
      'type',
      event.type,
      'settlementId',
      event.settlementId,
      'createdAt',
      event.createdAt.toISOString(),
      'payload',
      JSON.stringify(event.payload),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
