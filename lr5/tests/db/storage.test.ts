import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { migrate } from '../../shared/db/migrate';
import { SqlDatabase } from '../../shared/db/sqlite';
import { SqlUnitOfWork } from '../../shared/db/uow';
import { SqlOutboxStore, Outbox } from '../../shared/events/outbox';
import { ordersMigrations } from '../../services/orders/infrastructure/migrations';
import { SqlOrderRepository } from '../../services/orders/infrastructure/SqlRepositories';
import { Order } from '../../services/orders/domain/entities/Order';
import { deliveryMigrations } from '../../services/delivery/infrastructure/migrations';
import { SqlCourierRepository, SqlDeliveryRepository, SqlDispatchQueueRepository } from '../../services/delivery/infrastructure/SqlRepositories';
import { Courier } from '../../services/delivery/domain/entities/Courier';
import { Delivery } from '../../services/delivery/domain/entities/Delivery';
import { DispatchRequest } from '../../services/delivery/domain/entities/DispatchRequest';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lr5-'));

describe('Сховище: транзакції, довговічність, власні бази', () => {
  test('дані переживають перезапуск (закриття та повторне відкриття файлу бази даних)', async () => {
    const file = path.join(tmp(), 'orders.db');
    let db = await SqlDatabase.open(file);
    migrate(db, ordersMigrations);
    const uow = new SqlUnitOfWork(db);
    await uow.run(() => new SqlOrderRepository(db).save(Order.create('o1', 'cust-1', 'rest-1', 'Київ', ['Борщ'])));
    db.close();

    db = await SqlDatabase.open(file);
    expect(migrate(db, ordersMigrations)).toEqual([]); // міграції вже застосовано
    const loaded = await new SqlOrderRepository(db).findById('o1');
    expect(loaded).toMatchObject({ id: 'o1', status: 'NEW', items: ['Борщ'] });
  });

  test('транзакція замовлення і запису в outbox атомарна: при помилці не залишається ні замовлення, ні події', async () => {
    const db = await SqlDatabase.open();
    migrate(db, ordersMigrations);
    const uow = new SqlUnitOfWork(db);
    const repo = new SqlOrderRepository(db);
    const outbox = new Outbox({ producer: 'orders', subscribers: [{ type: 'order.confirmed', url: 'http://127.0.0.1:1/x' }], store: new SqlOutboxStore(db) });

    await expect(
      uow.run(async () => {
        await repo.save(Order.create('o1', 'cust-1', 'rest-1', 'Київ', ['Борщ']));
        outbox.publish('order.confirmed', 1, { orderId: 'o1' });
        throw new Error('збій у середині транзакції');
      }),
    ).rejects.toThrow('збій');
    expect(await repo.findById('o1')).toBeNull();
    expect(outbox.pending).toBe(0);

    await uow.run(async () => {
      await repo.save(Order.create('o2', 'cust-1', 'rest-1', 'Київ', ['Борщ']));
      outbox.publish('order.confirmed', 1, { orderId: 'o2' });
    });
    expect(await repo.findById('o2')).not.toBeNull();
    expect(outbox.pending).toBe(1);
  });

  test('вкладена одиниця роботи приєднується до зовнішньої, а паралельні транзакції виконуються послідовно', async () => {
    const db = await SqlDatabase.open();
    migrate(db, ordersMigrations);
    const uow = new SqlUnitOfWork(db);
    const repo = new SqlOrderRepository(db);
    await Promise.all(
      ['a', 'b', 'c', 'd'].map((id) =>
        uow.run(async () => {
          await uow.run(() => repo.save(Order.create(id, 'cust-1', 'rest-1', 'Київ', ['x'])));
          await Promise.resolve();
        }),
      ),
    );
    for (const id of ['a', 'b', 'c', 'd']) expect(await repo.findById(id)).not.toBeNull();
    expect(db.inTransaction).toBe(false);
  });

  test('сервіс доставки: репозиторії відновлюють сутності зі збереженим станом', async () => {
    const db = await SqlDatabase.open();
    migrate(db, deliveryMigrations);
    const couriers = new SqlCourierRepository(db);
    const deliveries = new SqlDeliveryRepository(db);
    const queue = new SqlDispatchQueueRepository(db);

    const courier = new Courier('c1', 'Олена');
    courier.assignToDelivery();
    await couriers.save(courier);
    expect((await couriers.findById('c1'))?.isAvailable).toBe(false);

    const delivery = new Delivery('d1', 'o1', 'c1');
    delivery.start();
    await deliveries.save(delivery);
    expect(await deliveries.findByOrderId('o1')).toMatchObject({ id: 'd1', status: 'IN_PROGRESS' });

    await queue.save(new DispatchRequest('o1', 'rest-1', 'Київ'));
    expect((await queue.findWaiting()).length).toBe(1);
  });

  test('локальна копія лише для читання: повторне збереження змінює прапорець waiting, але не скопійовані поля', async () => {
    const db = await SqlDatabase.open();
    migrate(db, deliveryMigrations);
    const queue = new SqlDispatchQueueRepository(db);
    await queue.save(new DispatchRequest('o1', 'rest-1', 'Київ, Хрещатик, 10'));
    await queue.save(new DispatchRequest('o1', 'rest-9', 'Інша адреса', false)); // спроба «відредагувати» копію
    const row = await queue.findByOrderId('o1');
    expect(row).toMatchObject({ restaurantId: 'rest-1', deliveryAddress: 'Київ, Хрещатик, 10', isWaiting: false });
  });

  test('кожен сервіс має власний файл бази даних (спільної бази немає)', async () => {
    const dir = tmp();
    const { startSystem } = await import('../helpers/system');
    const sys = await startSystem({ dataDir: dir });
    await sys.stopAll();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
    expect(files).toEqual(['delivery.db', 'orders.db', 'restaurants.db']);
  });
});
