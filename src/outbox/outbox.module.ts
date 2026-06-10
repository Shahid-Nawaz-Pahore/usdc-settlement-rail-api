import { Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import { EVENT_PUBLISHER, IEventPublisher } from './event-publisher.interface';
import { RedisStreamPublisher } from './redis-stream.publisher';
import { LogPublisher } from './log.publisher';
import { OutboxRelay } from './outbox.relay';

/**
 * Event-driven outbox. The publisher binding is chosen at boot: a Redis Streams
 * adapter when REDIS_URL is set, otherwise a log-only publisher so the service
 * runs without a broker (graceful degradation). Outbox rows are still written
 * transactionally by SettlementStateService regardless.
 */
@Module({
  providers: [
    OutboxRelay,
    {
      provide: EVENT_PUBLISHER,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService): IEventPublisher => {
        if (cfg.redisUrl) {
          new Logger('OutboxModule').log('Event publisher: Redis Streams');
          const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 3 });
          return new RedisStreamPublisher(redis);
        }
        new Logger('OutboxModule').log(
          'Event publisher: log-only (no REDIS_URL)',
        );
        return new LogPublisher();
      },
    },
  ],
})
export class OutboxModule {}
