import { ConfirmOrder } from '../application/use-cases/ConfirmOrder';
import { CreateOrder } from '../application/use-cases/CreateOrder';
import { GetOrder } from '../application/use-cases/GetOrder';
import { HandleDeliveryStarted } from '../application/use-cases/HandleDeliveryStarted';
import { Customer } from '../domain/entities/Customer';
import { HttpRestaurantDirectory } from '../infrastructure/HttpRestaurantDirectory';
import { InMemoryCustomerRepository, InMemoryOrderRepository } from '../infrastructure/InMemoryRepositories';
import { OutboxEventPublisher } from '../infrastructure/OutboxEventPublisher';
import { mapError } from '../presentation/errors';
import { buildRouter } from '../presentation/http';
import { Outbox, Subscriber } from '../../../shared/events/outbox';
import { errorResult } from '../../../shared/http/errors';
import { close, createJsonServer, listen } from '../../../shared/http/router';

export interface OrdersOptions {
  port: number;
  restaurantsUrl: string;
  /** Тайм-аут синхронного виклику сервісу ресторанів. */
  restaurantsTimeoutMs: number;
  subscribers: Subscriber[];
  retryIntervalMs?: number;
  log?: (message: string) => void;
}

/** Єдина точка складання сервісу замовлень (composition root). */
export function createOrdersApp(options: OrdersOptions) {
  const orders = new InMemoryOrderRepository();
  const customers = new InMemoryCustomerRepository();
  const seeded = customers.save(new Customer('cust-1', 'Ірина Коваленко', '+380501112233'));

  const outbox = new Outbox({
    producer: 'orders',
    subscribers: options.subscribers,
    retryIntervalMs: options.retryIntervalMs,
    log: options.log,
  });
  const restaurants = new HttpRestaurantDirectory(options.restaurantsUrl, options.restaurantsTimeoutMs);

  const router = buildRouter({
    createOrder: new CreateOrder(orders, customers, restaurants),
    confirmOrder: new ConfirmOrder(orders, new OutboxEventPublisher(outbox)),
    getOrder: new GetOrder(orders),
    handleDeliveryStarted: new HandleDeliveryStarted(orders),
  });
  const server = createJsonServer(router, mapError, errorResult(404, 'NOT_FOUND', 'Маршрут не знайдено'));

  return {
    name: 'orders',
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
