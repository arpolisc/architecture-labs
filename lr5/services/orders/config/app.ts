import { ConfirmOrder } from '../application/use-cases/ConfirmOrder';
import { CreateOrder } from '../application/use-cases/CreateOrder';
import { GetCacheStats } from '../application/use-cases/GetCacheStats';
import { GetOrder } from '../application/use-cases/GetOrder';
import { HandleDeliveryStarted } from '../application/use-cases/HandleDeliveryStarted';
import { InvalidateRestaurantCache } from '../application/use-cases/InvalidateRestaurantCache';
import { Customer } from '../domain/entities/Customer';
import { CachingRestaurantDirectory } from '../infrastructure/CachingRestaurantDirectory';
import { HttpRestaurantDirectory } from '../infrastructure/HttpRestaurantDirectory';
import { ordersMigrations } from '../infrastructure/migrations';
import { OutboxEventPublisher } from '../infrastructure/OutboxEventPublisher';
import { SqlCustomerRepository, SqlOrderRepository } from '../infrastructure/SqlRepositories';
import { mapError } from '../presentation/errors';
import { buildRouter } from '../presentation/http';
import { migrate } from '../../../shared/db/migrate';
import { SqlDatabase } from '../../../shared/db/sqlite';
import { SqlUnitOfWork } from '../../../shared/db/uow';
import { SqlProcessedEvents } from '../../../shared/events/inbox';
import { Outbox, SqlOutboxStore, Subscriber } from '../../../shared/events/outbox';
import { errorResult } from '../../../shared/http/errors';
import { close, createJsonServer, listen } from '../../../shared/http/router';

export interface OrdersOptions {
  port: number;
  /** Файл власної бази даних сервісу; без нього база існує лише в пам’яті процесу. */
  dbFile?: string;
  restaurantsUrl: string;
  /** Тайм-аут синхронного виклику сервісу ресторанів. */
  restaurantsTimeoutMs: number;
  /** Час життя запису кешу ресторанів; 0 вимикає кеш. */
  restaurantCacheTtlMs?: number;
  subscribers: Subscriber[];
  retryIntervalMs?: number;
  log?: (message: string) => void;
}

/** Єдина точка складання сервісу замовлень (composition root). */
export async function createOrdersApp(options: OrdersOptions) {
  const db = await SqlDatabase.open(options.dbFile);
  migrate(db, ordersMigrations);
  const uow = new SqlUnitOfWork(db);

  const orders = new SqlOrderRepository(db);
  const customers = new SqlCustomerRepository(db);
  await uow.run(() => customers.save(new Customer('cust-1', 'Ірина Коваленко', '+380501112233')));

  const outbox = new Outbox({
    producer: 'orders',
    subscribers: options.subscribers,
    store: new SqlOutboxStore(db),
    retryIntervalMs: options.retryIntervalMs,
    log: options.log,
  });
  const restaurants = new CachingRestaurantDirectory(
    new HttpRestaurantDirectory(options.restaurantsUrl, options.restaurantsTimeoutMs),
    options.restaurantCacheTtlMs ?? 30_000,
  );

  const router = buildRouter(
    {
      createOrder: new CreateOrder(orders, customers, restaurants, uow),
      confirmOrder: new ConfirmOrder(orders, new OutboxEventPublisher(outbox), uow),
      getOrder: new GetOrder(orders),
      handleDeliveryStarted: new HandleDeliveryStarted(orders),
      invalidateRestaurantCache: new InvalidateRestaurantCache(restaurants),
      getCacheStats: new GetCacheStats(restaurants),
    },
    { store: new SqlProcessedEvents(db), transaction: uow },
  );
  const server = createJsonServer(router, mapError, errorResult(404, 'NOT_FOUND', 'Маршрут не знайдено'));

  return {
    name: 'orders',
    outbox,
    db,
    async start(): Promise<number> {
      outbox.start();
      return listen(server, options.port);
    },
    async stop(): Promise<void> {
      outbox.stop();
      await close(server);
      db.close();
    },
  };
}
