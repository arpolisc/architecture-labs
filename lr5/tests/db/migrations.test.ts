import { appliedVersions, migrate } from '../../shared/db/migrate';
import { SqlDatabase } from '../../shared/db/sqlite';
import { ordersMigrations } from '../../services/orders/infrastructure/migrations';
import { SqlOrderRepository } from '../../services/orders/infrastructure/SqlRepositories';
import { Order } from '../../services/orders/domain/entities/Order';
import { codeVersions, worksWith } from '../../scripts/migration/orderCodeVersions';

const columns = (db: SqlDatabase) => db.all<{ name: string }>("SELECT name FROM pragma_table_info('orders')").map((c) => c.name);
const byName = (name: string) => codeVersions.find((v) => v.name === name)!;

describe('Міграції за шаблоном «розширення – скорочення» (orders.courier → orders.courier_id)', () => {
  test('кожен етап оформлено окремою міграцією; повторний запуск нічого не змінює', async () => {
    const db = await SqlDatabase.open();
    expect(migrate(db, ordersMigrations)).toEqual([1, 2, 3, 4]);
    expect(migrate(db, ordersMigrations)).toEqual([]);
    expect(appliedVersions(db)).toEqual([1, 2, 3, 4]);
  });

  test('схема на кожному етапі: розширення додає стовпець, скорочення вилучає старий', async () => {
    const db = await SqlDatabase.open();
    migrate(db, ordersMigrations, 1);
    expect(columns(db)).toContain('courier');
    expect(columns(db)).not.toContain('courier_id');
    migrate(db, ordersMigrations, 2);
    expect(columns(db)).toEqual(expect.arrayContaining(['courier', 'courier_id']));
    migrate(db, ordersMigrations, 3);
    expect(columns(db)).toEqual(expect.arrayContaining(['courier', 'courier_id']));
    migrate(db, ordersMigrations, 4);
    expect(columns(db)).toContain('courier_id');
    expect(columns(db)).not.toContain('courier');
  });

  test('матриця сумісності: яка версія коду працює з якою версією схеми', async () => {
    const stages: { upTo: number; works: string[] }[] = [
      { upTo: 1, works: ['v1'] },                       // початкова схема: лише старий код
      { upTo: 2, works: ['v1', 'v2', 'v3', 'v4'] },     // після розширення старий код ще працює (v3 бачить лише нові рядки)
      { upTo: 3, works: ['v1', 'v2', 'v3', 'v4'] },     // після перенесення даних усі версії бачать усі рядки
      { upTo: 4, works: ['v4'] },                       // після скорочення працює лише код без старого стовпця
    ];
    for (const stage of stages) {
      const db = await SqlDatabase.open();
      migrate(db, ordersMigrations, stage.upTo);
      const result = codeVersions.filter((v, i) => worksWith(v, db, `probe-${stage.upTo}-${i}`)).map((v) => v.name);
      expect([stage.upTo, result]).toEqual([stage.upTo, stage.works]);
    }
  });

  test('розширення зворотно сумісне: попередня версія коду продовжує працювати після застосування міграції 002', async () => {
    const db = await SqlDatabase.open();
    migrate(db, ordersMigrations, 1);
    byName('v1').write(db, { id: 'o-old', courierId: 'courier-1' });
    migrate(db, ordersMigrations, 2);
    expect(byName('v1').read(db, 'o-old')?.courierId).toBe('courier-1');
    byName('v1').write(db, { id: 'o-old2', courierId: 'courier-2' });
    expect(byName('v1').read(db, 'o-old2')?.courierId).toBe('courier-2');
  });

  test('перенесення даних: рядки, записані старим кодом, стають видимими для коду, що читає новий стовпець', async () => {
    const db = await SqlDatabase.open();
    migrate(db, ordersMigrations, 2);
    byName('v1').write(db, { id: 'a', courierId: 'courier-1' }); // старий код
    byName('v2').write(db, { id: 'b', courierId: 'courier-2' }); // код з паралельним записом
    expect(byName('v3').read(db, 'a')?.courierId).toBeNull();     // до перенесення старі рядки порожні в новому стовпці
    expect(byName('v3').read(db, 'b')?.courierId).toBe('courier-2');
    migrate(db, ordersMigrations, 3);
    expect(byName('v3').read(db, 'a')?.courierId).toBe('courier-1');
    expect(byName('v3').read(db, 'b')?.courierId).toBe('courier-2');
  });

  test('скорочення: дані зберігаються, а код попередніх версій ламається (тому вилучення виконується останнім)', async () => {
    const db = await SqlDatabase.open();
    migrate(db, ordersMigrations, 3);
    byName('v3').write(db, { id: 'o1', courierId: 'courier-1' });
    migrate(db, ordersMigrations, 4);
    expect(byName('v4').read(db, 'o1')?.courierId).toBe('courier-1');
    expect(() => byName('v2').write(db, { id: 'o2', courierId: 'c' })).toThrow();
    expect(() => byName('v1').read(db, 'o1')).toThrow();
  });

  test('поточний репозиторій працює зі схемою після всіх міграцій', async () => {
    const db = await SqlDatabase.open();
    migrate(db, ordersMigrations);
    const repo = new SqlOrderRepository(db);
    const order = Order.create('o1', 'cust-1', 'rest-1', 'Київ, Хрещатик, 10', ['Борщ', 'Вареники']);
    order.confirm();
    order.assignCourier('courier-1');
    order.startDelivery();
    await repo.save(order);
    const loaded = await repo.findById('o1');
    expect(loaded).toMatchObject({ id: 'o1', status: 'IN_DELIVERY', courierId: 'courier-1', items: ['Борщ', 'Вареники'] });
  });

  test('невдала міграція відкочується повністю й не записується в журнал', async () => {
    const db = await SqlDatabase.open();
    expect(() =>
      migrate(db, [{ version: 1, name: 'broken', sql: 'CREATE TABLE a (x INTEGER); CREATE TABLE a (y INTEGER);' }]),
    ).toThrow();
    expect(appliedVersions(db)).toEqual([]);
    expect(db.get("SELECT name FROM sqlite_master WHERE name = 'a'")).toBeUndefined();
  });
});
