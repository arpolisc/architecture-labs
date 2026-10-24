import { ListWaitingRequests } from '../application/use-cases/ListWaitingRequests';
import { RegisterConfirmedOrder } from '../application/use-cases/RegisterConfirmedOrder';
import { StartDelivery } from '../application/use-cases/StartDelivery';
import { Courier } from '../domain/entities/Courier';
import {
  InMemoryCourierRepository,
  InMemoryDeliveryRepository,
  InMemoryDispatchQueueRepository,
} from '../infrastructure/InMemoryRepositories';
import { OutboxEventPublisher } from '../infrastructure/OutboxEventPublisher';
import { mapError } from '../presentation/errors';
import { buildRouter } from '../presentation/http';
import { Outbox, Subscriber } from '../../../shared/events/outbox';
import { errorResult } from '../../../shared/http/errors';
import { close, createJsonServer, listen } from '../../../shared/http/router';

export interface DeliveryOptions {
  port: number;
  subscribers: Subscriber[];
  retryIntervalMs?: number;
  log?: (message: string) => void;
}

/** Єдина точка складання сервісу доставки. */
export function createDeliveryApp(options: DeliveryOptions) {
  const queue = new InMemoryDispatchQueueRepository();
  const couriers = new InMemoryCourierRepository();
  const deliveries = new InMemoryDeliveryRepository();
  const seeded = Promise.all([
    couriers.save(new Courier('courier-1', 'Олена Кур’єр')),
    couriers.save(new Courier('courier-2', 'Петро Кур’єр')),
  ]);

  const outbox = new Outbox({
    producer: 'delivery',
    subscribers: options.subscribers,
    retryIntervalMs: options.retryIntervalMs,
    log: options.log,
  });

  const router = buildRouter({
    startDelivery: new StartDelivery(queue, couriers, deliveries, new OutboxEventPublisher(outbox)),
    listWaiting: new ListWaitingRequests(queue),
    registerConfirmedOrder: new RegisterConfirmedOrder(queue),
  });
  const server = createJsonServer(router, mapError, errorResult(404, 'NOT_FOUND', 'Маршрут не знайдено'));

  return {
    name: 'delivery',
    outbox,
    async start(): Promise<number> {
      await seeded;
      outbox.start();
      return listen(server, options.port);
    },
    async stop(): Promise<void> {
      outbox.stop();
      await close(server);
    },
  };
}
