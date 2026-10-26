import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { requestJson } from '../../shared/http/client';
import { eventually, startSystem, System } from '../helpers/system';

const order = (id: string, extra: Record<string, unknown> = {}) => ({
  id, customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ, Хрещатик, 10', items: ['Борщ'], ...extra,
});
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lr5-it-'));
const cacheStats = async (sys: System) => (await requestJson(`${sys.urls.orders}/internal/cache`, { timeoutMs: 1000 })).body;
const envelope = (eventId: string, orderId: string) => ({
  eventId, type: 'order.confirmed', version: 1, occurredAt: new Date().toISOString(), producer: 'orders',
  data: { orderId, customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ', items: ['Борщ'] },
});

describe('Кешування у сервісі замовлень', () => {
  let sys: System;
  afterEach(async () => { await sys.stopAll(); });

  test('повторні створення замовлень для одного ресторану обслуговуються з кешу', async () => {
    sys = await startSystem({ restaurantCacheTtlMs: 60_000 });
    for (const id of ['c1', 'c2', 'c3', 'c4']) expect((await sys.api('/api/orders', { method: 'POST', body: order(id) })).status).toBe(201);
    expect(await cacheStats(sys)).toMatchObject({ hits: 3, misses: 1, size: 1, ttlMs: 60000 });
  });

  test('інвалідизація за подією: після призупинення ресторану кеш скидається й нові замовлення відхиляються', async () => {
    sys = await startSystem({ restaurantCacheTtlMs: 60_000 });
    expect((await sys.api('/api/orders', { method: 'POST', body: order('c1') })).status).toBe(201); // кеш прогріто
    expect((await sys.api('/api/restaurants/rest-1/pause', { method: 'POST' })).status).toBe(200);

    const rejected = await eventually(async () => {
      const r = await sys.api('/api/orders', { method: 'POST', body: order(`probe-${Date.now()}`) });
      return r.status === 422 ? r : false;
    }, 5000, 30);
    expect(rejected.body.error.code).toBe('RESTAURANT_NOT_ACCEPTING');

    await sys.api('/api/restaurants/rest-1/resume', { method: 'POST' });
    const accepted = await eventually(async () => {
      const r = await sys.api('/api/orders', { method: 'POST', body: order(`ok-${Date.now()}`) });
      return r.status === 201 ? r : false;
    }, 5000, 30);
    expect(accepted.status).toBe(201);
  });

  test('кеш пом’якшує відмову ресторанів у межах часу життя запису', async () => {
    sys = await startSystem({ restaurantCacheTtlMs: 60_000 });
    await sys.api('/api/orders', { method: 'POST', body: order('c1') });
    await sys.stop('restaurants');
    expect((await sys.api('/api/orders', { method: 'POST', body: order('c2') })).status).toBe(201); // з кешу
    // ресторан, якого немає в кеші, при відмові сервісу по-старому дає 503
    await sys.stop('orders'); await sys.start('orders');
    expect((await sys.api('/api/orders', { method: 'POST', body: order('c3') })).status).toBe(503);
  });
});

describe('Узгодженість між сервісами через події', () => {
  let sys: System;
  afterEach(async () => { await sys.stopAll(); });

  test('вихідна подія переживає перезапуск продуцента (транзакційний outbox у базі даних)', async () => {
    const dataDir = tmpDir();
    sys = await startSystem({ dataDir });
    await sys.api('/api/orders', { method: 'POST', body: order('o1') });
    await sys.stop('delivery');
    expect((await sys.api('/api/orders/o1/confirm', { method: 'POST' })).status).toBe(200);
    expect(sys.app('orders').outbox.pending).toBe(1);

    await sys.stop('orders');        // процес-продуцент зупинено: у пам’яті подій немає
    await sys.start('orders');       // новий процес читає outbox зі свого файлу бази даних
    expect((await sys.api('/api/orders/o1')).body.status).toBe('CONFIRMED');
    expect(sys.app('orders').outbox.pending).toBe(1);

    await sys.start('delivery');
    const waiting = await eventually(async () => {
      const r = await sys.api('/api/deliveries/waiting');
      return r.status === 200 && r.body.length === 1 ? r.body : false;
    }, 10000);
    expect(waiting[0].orderId).toBe('o1');
    await eventually(async () => sys.app('orders').outbox.pending === 0);
  });

  test('обробник подій ідемпотентний: повторна подія не змінює результат, журнал оброблених переживає перезапуск', async () => {
    sys = await startSystem({ dataDir: tmpDir() });
    const send = () => requestJson(`${sys.urls.delivery}/internal/events`, { method: 'POST', body: envelope('evt-1', 'o9'), timeoutMs: 1000 });
    expect((await send()).body.status).toBe('processed');
    expect((await send()).body.status).toBe('duplicate');
    expect((await sys.api('/api/deliveries/waiting')).body).toHaveLength(1);

    await sys.stop('delivery');
    await sys.start('delivery');
    expect((await send()).body.status).toBe('duplicate');                       // журнал збережено в базі даних
    expect((await sys.api('/api/deliveries/waiting')).body).toHaveLength(1);     // дубліката немає
    const count = sys.app('delivery').db.get('SELECT COUNT(*) AS n FROM processed_events').n;
    expect(count).toBe(1);
  });

  test('різні події про те саме замовлення (інший eventId) також не створюють дубліката запиту на доставку', async () => {
    sys = await startSystem();
    const send = (id: string) => requestJson(`${sys.urls.delivery}/internal/events`, { method: 'POST', body: envelope(id, 'o7'), timeoutMs: 1000 });
    await send('evt-a');
    await send('evt-b');
    expect((await sys.api('/api/deliveries/waiting')).body).toHaveLength(1);
  });

  test('delivery.started: повторна подія не змінює замовлення, тривалість неузгодженості вимірюється', async () => {
    sys = await startSystem();
    await sys.api('/api/orders', { method: 'POST', body: order('o1') });
    await sys.api('/api/orders/o1/confirm', { method: 'POST' });
    await eventually(async () => (await sys.api('/api/deliveries/waiting')).body.length === 1);

    const t0 = Date.now();
    await sys.api('/api/deliveries', { method: 'POST', body: { orderId: 'o1', courierId: 'courier-1' } });
    await eventually(async () => (await sys.api('/api/orders/o1')).body.status === 'IN_DELIVERY');
    const lag = Date.now() - t0;
    expect(lag).toBeLessThan(2000);

    const dup = { eventId: 'evt-x', type: 'delivery.started', version: 1, occurredAt: new Date().toISOString(), producer: 'delivery',
      data: { deliveryId: 'delivery-o1', orderId: 'o1', courierId: 'courier-1' } };
    const first = await requestJson(`${sys.urls.orders}/internal/events`, { method: 'POST', body: dup, timeoutMs: 1000 });
    const second = await requestJson(`${sys.urls.orders}/internal/events`, { method: 'POST', body: dup, timeoutMs: 1000 });
    expect([first.body.status, second.body.status]).toEqual(['processed', 'duplicate']);
    expect((await sys.api('/api/orders/o1')).body).toMatchObject({ status: 'IN_DELIVERY', courierId: 'courier-1' });
  });

  test('чужі дані недоступні: сервіс доставки не має таблиці замовлень, а замовлення — таблиці доставок', async () => {
    sys = await startSystem();
    const tables = (name: 'orders' | 'delivery' | 'restaurants') =>
      sys.app(name).db.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((r: any) => r.name);
    expect(tables('delivery')).not.toContain('orders');
    expect(tables('delivery')).toContain('dispatch_requests'); // лише локальна копія потрібних полів
    expect(tables('orders')).not.toContain('deliveries');
    expect(tables('orders')).not.toContain('restaurants');
    expect(tables('restaurants')).not.toContain('orders');
  });
});
