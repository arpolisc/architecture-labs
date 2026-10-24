import { eventually, startSystem, System } from '../helpers/system';
import { requestJson } from '../../shared/http/client';

const order = (id: string, extra: Record<string, unknown> = {}) => ({
  id, customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ, Хрещатик, 10', items: ['Борщ'], ...extra,
});

describe('Інтеграційні сценарії через шлюз (окремі сервіси, окремі сховища)', () => {
  let sys: System;
  beforeEach(async () => { sys = await startSystem(); });
  afterEach(async () => { await sys.stopAll(); });

  test('повний потік: створення → підтвердження → подія → черга диспетчера → доставка → подія → IN_DELIVERY', async () => {
    const created = await sys.api('/api/orders', { method: 'POST', body: order('o1') });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('NEW');

    const confirmed = await sys.api('/api/orders/o1/confirm', { method: 'POST' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('CONFIRMED');

    // асинхронно: подія дійшла до сервісу доставки
    const waiting = await eventually(async () => {
      const r = await sys.api('/api/deliveries/waiting');
      return r.body.length === 1 ? r.body : false;
    });
    expect(waiting[0]).toMatchObject({ orderId: 'o1', restaurantId: 'rest-1' });

    const started = await sys.api('/api/deliveries', { method: 'POST', body: { orderId: 'o1', courierId: 'courier-1' } });
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ id: 'delivery-o1', status: 'IN_PROGRESS' });

    // асинхронно: сервіс замовлень отримав delivery.started
    const inDelivery = await eventually(async () => {
      const r = await sys.api('/api/orders/o1');
      return r.body.status === 'IN_DELIVERY' ? r.body : false;
    });
    expect(inDelivery.courierId).toBe('courier-1');
  });

  test('ідемпотентність: повторне створення та повторне призначення повертають наявні об’єкти', async () => {
    expect((await sys.api('/api/orders', { method: 'POST', body: order('o1') })).status).toBe(201);
    expect((await sys.api('/api/orders', { method: 'POST', body: order('o1') })).status).toBe(200);
    const conflict = await sys.api('/api/orders', { method: 'POST', body: order('o1', { items: ['Інше'] }) });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('ORDER_ID_CONFLICT');

    await sys.api('/api/orders/o1/confirm', { method: 'POST' });
    await eventually(async () => (await sys.api('/api/deliveries/waiting')).body.length === 1);
    expect((await sys.api('/api/deliveries', { method: 'POST', body: { orderId: 'o1', courierId: 'courier-1' } })).status).toBe(201);
    expect((await sys.api('/api/deliveries', { method: 'POST', body: { orderId: 'o1', courierId: 'courier-1' } })).status).toBe(200);
    const other = await sys.api('/api/deliveries', { method: 'POST', body: { orderId: 'o1', courierId: 'courier-2' } });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('DELIVERY_ALREADY_ASSIGNED');
  });

  test('помилки домену й валідації мають коди за контрактом', async () => {
    expect((await sys.api('/api/orders', { method: 'POST', body: { id: 'x' } })).body.error.code).toBe('VALIDATION_FAILED');
    expect((await sys.api('/api/orders/nope')).body.error.code).toBe('ORDER_NOT_FOUND');
    await sys.api('/api/orders', { method: 'POST', body: order('o1') });
    await sys.api('/api/orders/o1/confirm', { method: 'POST' });
    const again = await sys.api('/api/orders/o1/confirm', { method: 'POST' });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('RULE_VIOLATION');
    const ghost = await sys.api('/api/deliveries', { method: 'POST', body: { orderId: 'ghost', courierId: 'courier-1' } });
    expect(ghost.body.error.code).toBe('ORDER_NOT_AWAITING_DELIVERY');
  });

  test('шлюз не публікує внутрішні маршрути та приховує поділ на сервіси', async () => {
    expect((await sys.api('/internal/events', { method: 'POST', body: {} })).status).toBe(404);
    expect((await sys.api('/api/internal/events', { method: 'POST', body: {} })).status).toBe(404);
    const health = await sys.api('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.services).toEqual({ orders: 'ok', restaurants: 'ok', delivery: 'ok' });
  });

  test('дубль події не створює другий запис у черзі (ідемпотентність споживача)', async () => {
    const envelope = {
      eventId: 'evt-1', type: 'order.confirmed', version: 1, occurredAt: new Date().toISOString(), producer: 'orders',
      data: { orderId: 'o9', customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ', items: ['Борщ'] },
    };
    const first = await requestJson(`${sys.urls.delivery}/internal/events`, { method: 'POST', body: envelope, timeoutMs: 1000 });
    const second = await requestJson(`${sys.urls.delivery}/internal/events`, { method: 'POST', body: envelope, timeoutMs: 1000 });
    expect(first.body.status).toBe('processed');
    expect(second.body.status).toBe('duplicate');
    expect((await sys.api('/api/deliveries/waiting')).body).toHaveLength(1);
  });
});

describe('Експеримент: вимкнений сервіс', () => {
  let sys: System;
  beforeEach(async () => { sys = await startSystem({ restaurantsTimeoutMs: 300 }); });
  afterEach(async () => { await sys.stopAll(); });

  test('синхронний виклик: сервіс ресторанів вимкнено → створення замовлення відхиляється за тайм-аут, після відновлення працює', async () => {
    await sys.api('/api/orders', { method: 'POST', body: order('exists') });
    await sys.stop('restaurants');

    const started = Date.now();
    const failed = await sys.api('/api/orders', { method: 'POST', body: order('o2') });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');

    // повтор уже створеного замовлення не потребує сервісу ресторанів
    expect((await sys.api('/api/orders', { method: 'POST', body: order('exists') })).status).toBe(200);
    // сервіс замовлень сам не впав
    expect((await sys.api('/api/orders/exists')).status).toBe(200);
    // шлюз повідомляє про стан
    expect((await sys.api('/api/restaurants/rest-1')).status).toBe(503);

    await sys.start('restaurants');
    expect((await sys.api('/api/orders', { method: 'POST', body: order('o2') })).status).toBe(201);
  });

  test('асинхронна подія: сервіс доставки вимкнено → підтвердження працює, подія доставляється після відновлення', async () => {
    await sys.api('/api/orders', { method: 'POST', body: order('o1') });
    await sys.stop('delivery');

    const started = Date.now();
    const confirmed = await sys.api('/api/orders/o1/confirm', { method: 'POST' });
    expect(confirmed.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(500); // продуцент не чекає споживача

    const blocked = await sys.api('/api/deliveries/waiting');
    expect(blocked.status).toBe(503);
    expect(blocked.body.error.code).toBe('SERVICE_UNAVAILABLE');

    await sys.start('delivery'); // нова копія сервісу з порожньою чергою
    const waiting = await eventually(async () => {
      const r = await sys.api('/api/deliveries/waiting');
      return r.status === 200 && r.body.length === 1 ? r.body : false;
    }, 10000);
    expect(waiting[0].orderId).toBe('o1');
  });
});

describe('Тайм-аут синхронного виклику повільного сервісу', () => {
  test('повільний сервіс ресторанів не блокує замовлення довше за тайм-аут', async () => {
    const http = await import('node:http');
    const slow = http.createServer((_req, res) => setTimeout(() => { res.end('{}'); }, 2000));
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', r));
    const slowPort = (slow.address() as import('node:net').AddressInfo).port;

    const { createOrdersApp } = await import('../../services/orders/config/app');
    const { freePort } = await import('../helpers/system');
    const port = await freePort();
    const app = createOrdersApp({ port, restaurantsUrl: `http://127.0.0.1:${slowPort}`, restaurantsTimeoutMs: 250, subscribers: [] });
    await app.start();
    try {
      const t0 = Date.now();
      const res = await requestJson(`http://127.0.0.1:${port}/orders`, { method: 'POST', body: order('o1'), timeoutMs: 3000 });
      const elapsed = Date.now() - t0;
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
      expect(elapsed).toBeGreaterThanOrEqual(240);
      expect(elapsed).toBeLessThan(1200);
    } finally {
      await app.stop();
      slow.closeAllConnections?.();
      await new Promise((r) => slow.close(r));
    }
  });
});
