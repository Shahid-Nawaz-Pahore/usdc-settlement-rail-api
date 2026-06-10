import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EVENT_PUBLISHER } from './event-publisher.interface';
import type { IEventPublisher } from './event-publisher.interface';

/**
 * Relays unpublished outbox rows to the broker, oldest first, then marks them
 * published. At-least-once delivery: a crash between publish and mark re-sends
 * on the next tick (consumers must dedup on eventId). Stops the batch on the
 * first failure and retries next tick.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  @Interval('outbox-relay', 3000)
  async relay(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const row of rows) {
        await this.publisher.publish({
          id: row.id,
          type: row.type,
          settlementId: row.settlementId,
          payload: row.payload as Record<string, unknown>,
          createdAt: row.createdAt,
        });
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: { publishedAt: new Date() },
        });
      }
    } catch (err) {
      this.logger.warn(`Outbox relay failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
