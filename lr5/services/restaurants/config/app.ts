import { GetRestaurant } from '../application/use-cases/GetRestaurant';
import { SetAvailability } from '../application/use-cases/SetAvailability';
import { Restaurant } from '../domain/entities/Restaurant';
import { restaurantsMigrations } from '../infrastructure/migrations';
import { OutboxEventPublisher } from '../infrastructure/OutboxEventPublisher';
import { SqlRestaurantRepository } from '../infrastructure/SqlRestaurantRepository';
import { mapError } from '../presentation/errors';
import { buildRouter } from '../presentation/http';
import { migrate } from '../../../shared/db/migrate';
import { SqlDatabase } from '../../../shared/db/sqlite';
import { SqlUnitOfWork } from '../../../shared/db/uow';
import { Outbox, SqlOutboxStore, Subscriber } from '../../../shared/events/outbox';
import { errorResult } from '../../../shared/http/errors';
import { close, createJsonServer, listen } from '../../../shared/http/router';

export interface RestaurantsOptions {
  port: number;
  /** Файл власної бази даних сервісу; без нього база існує лише в пам’яті процесу. */
  dbFile?: string;
  subscribers?: Subscriber[];
  retryIntervalMs?: number;
  simulatedLatencyMs?: number;
  log?: (message: string) => void;
}

/** Єдина точка складання сервісу ресторанів. */
export async function createRestaurantsApp(options: RestaurantsOptions) {
  const db = await SqlDatabase.open(options.dbFile);
  migrate(db, restaurantsMigrations);
  const uow = new SqlUnitOfWork(db);
  const restaurants = new SqlRestaurantRepository(db);
  await uow.run(async () => {
    if (!(await restaurants.findById('rest-1'))) await restaurants.save(new Restaurant('rest-1', 'Ресторан Смачно'));
    if (!(await restaurants.findById('rest-2'))) await restaurants.save(new Restaurant('rest-2', 'Піцерія Рома'));
  });

  const outbox = new Outbox({
    producer: 'restaurants',
    subscribers: options.subscribers ?? [],
    store: new SqlOutboxStore(db),
    retryIntervalMs: options.retryIntervalMs,
    log: options.log,
  });
  const router = buildRouter(
    {
      getRestaurant: new GetRestaurant(restaurants),
      setAvailability: new SetAvailability(restaurants, new OutboxEventPublisher(outbox), uow),
    },
    { simulatedLatencyMs: options.simulatedLatencyMs },
  );
  const server = createJsonServer(router, mapError, errorResult(404, 'NOT_FOUND', 'Маршрут не знайдено'));

  return {
    name: 'restaurants',
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
