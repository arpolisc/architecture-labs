import { ListWaitingRequests } from '../application/use-cases/ListWaitingRequests';
import { RegisterConfirmedOrder } from '../application/use-cases/RegisterConfirmedOrder';
import { StartDelivery } from '../application/use-cases/StartDelivery';
import { Courier } from '../domain/entities/Courier';
import { deliveryMigrations } from '../infrastructure/migrations';
import { OutboxEventPublisher } from '../infrastructure/OutboxEventPublisher';
import { SqlCourierRepository, SqlDeliveryRepository, SqlDispatchQueueRepository } from '../infrastructure/SqlRepositories';
import { mapError } from '../presentation/errors';
import { buildRouter } from '../presentation/http';
import { migrate } from '../../../shared/db/migrate';
import { SqlDatabase } from '../../../shared/db/sqlite';
import { SqlUnitOfWork } from '../../../shared/db/uow';
import { SqlProcessedEvents } from '../../../shared/events/inbox';
import { Outbox, SqlOutboxStore, Subscriber } from '../../../shared/events/outbox';
import { errorResult } from '../../../shared/http/errors';
import { close, createJsonServer, listen } from '../../../shared/http/router';

export interface DeliveryOptions {
  port: number;
  /** Файл власної бази даних сервісу; без нього база існує лише в пам’яті процесу. */
  dbFile?: string;
  subscribers: Subscriber[];
  retryIntervalMs?: number;
  log?: (message: string) => void;
}

/** Єдина точка складання сервісу доставки. */
export async function createDeliveryApp(options: DeliveryOptions) {
  const db = await SqlDatabase.open(options.dbFile);
  migrate(db, deliveryMigrations);
  const uow = new SqlUnitOfWork(db);

  const queue = new SqlDispatchQueueRepository(db);
  const couriers = new SqlCourierRepository(db);
  const deliveries = new SqlDeliveryRepository(db);
  await uow.run(async () => {
    if (!(await couriers.findById('courier-1'))) await couriers.save(new Courier('courier-1', 'Олена Кур’єр'));
    if (!(await couriers.findById('courier-2'))) await couriers.save(new Courier('courier-2', 'Петро Кур’єр'));
  });

  const outbox = new Outbox({
    producer: 'delivery',
    subscribers: options.subscribers,
    store: new SqlOutboxStore(db),
    retryIntervalMs: options.retryIntervalMs,
    log: options.log,
  });

  const router = buildRouter(
    {
      startDelivery: new StartDelivery(queue, couriers, deliveries, new OutboxEventPublisher(outbox), uow),
      listWaiting: new ListWaitingRequests(queue),
      registerConfirmedOrder: new RegisterConfirmedOrder(queue),
    },
    { store: new SqlProcessedEvents(db), transaction: uow },
  );
  const server = createJsonServer(router, mapError, errorResult(404, 'NOT_FOUND', 'Маршрут не знайдено'));

  return {
    name: 'delivery',
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
