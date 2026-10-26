import { EventPublisher } from '../application/ports/EventPublisher';
import { Outbox } from '../../../shared/events/outbox';

export class OutboxEventPublisher implements EventPublisher {
  constructor(private readonly outbox: Outbox) {}

  publish(type: string, version: number, data: object): void {
    this.outbox.publish(type, version, data);
  }
}
