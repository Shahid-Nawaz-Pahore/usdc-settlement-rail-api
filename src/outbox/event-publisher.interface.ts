export interface SettlementEvent {
  id: string;
  type: string; // settlement.submitted | .confirmed | .final | .failed
  settlementId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Broker abstraction for relaying outbox events. Same pluggable pattern as
 * IComplianceProvider — a Redis Streams adapter today; Kafka/RabbitMQ could bind
 * the same token without touching the relay.
 */
export interface IEventPublisher {
  publish(event: SettlementEvent): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
