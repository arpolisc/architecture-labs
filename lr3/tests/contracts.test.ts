import Ajv from 'ajv';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { AddressInfo } from 'node:net';
import { parse } from 'yaml';
import { createDeliveryApp } from '../services/delivery/config/app';
import { createOrdersApp } from '../services/orders/config/app';
import { eventually, freePort, startSystem } from './helpers/system';
import { requestJson } from '../shared/http/client';

const ROOT = path.resolve(__dirname, '../contracts');
const yamlDoc = (name: string) => parse(fs.readFileSync(path.join(ROOT, 'openapi', `${name}.yaml`), 'utf8'));
const json = (name: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'events', name), 'utf8'));

function ajvWithContracts() {
  const ajv = new Ajv({ strict: false, allErrors: true });
  for (const f of ['envelope', 'order.confirmed.v1', 'delivery.started.v1']) ajv.addSchema(json(`${f}.schema.json`));
  for (const svc of ['orders', 'restaurants', 'delivery']) ajv.addSchema({ $id: `oas-${svc}`, components: yamlDoc(svc).components });
  return ajv;
}

describe('Контракти: повнота опису (OpenAPI)', () => {
  const services = ['orders', 'restaurants', 'delivery'];

  test.each(services)('%s: кожна операція має ідемпотентність і гарантії (час відповіді, тайм-аут)', (svc) => {
    const doc = yamlDoc(svc);
    for (const [p, methods] of Object.entries<any>(doc.paths)) {
      for (const [method, op] of Object.entries<any>(methods)) {
        expect([p, method, typeof op['x-idempotent']]).toEqual([p, method, 'boolean']);
        expect(op['x-guarantees']?.timeoutMs).toBeGreaterThan(0);
        expect(op['x-guarantees']?.typicalLatencyMs).toBeGreaterThan(0);
        expect(op.operationId).toBeTruthy();
      }
    }
  });

  test.each(services)('%s: операції зі шляховими параметрами або тілом описують помилки 4xx', (svc) => {
    const doc = yamlDoc(svc);
    for (const [p, methods] of Object.entries<any>(doc.paths)) {
      for (const [method, op] of Object.entries<any>(methods)) {
        if (p === '/internal/events') continue;
        if (!op.parameters && !op.requestBody) continue;
        const codes = Object.keys(op.responses);
        expect([p, method, codes.some((c) => c.startsWith('4'))]).toEqual([p, method, true]);
      }
    }
  });

  test('контракт створення замовлення описує ключові коди помилок та ідемпотентність', () => {
    const op = yamlDoc('orders').paths['/orders'].post;
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['200', '201', '400', '404', '409', '422', '503']));
    expect(op['x-idempotent']).toBe(true);
    expect(op.description).toContain('Ідемпотентність');
  });

  test('версіонування: версія вказана у специфікаціях і в схемах подій', () => {
    for (const svc of ['orders', 'restaurants', 'delivery', 'gateway']) expect(yamlDoc(svc).info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(json('order.confirmed.v1.schema.json')['x-compatibility']).toBeTruthy();
    expect(json('delivery.started.v1.schema.json')['x-compatibility']).toBeTruthy();
  });
});

describe('Контракти: відповідність реальних відповідей схемам', () => {
  test('відповіді сервісів та помилки відповідають схемам OpenAPI', async () => {
    const ajv = ajvWithContracts();
    const sys = await startSystem();
    try {
      const check = (svc: string, schema: string, data: unknown) => {
        const ok = ajv.validate({ $ref: `oas-${svc}#/components/schemas/${schema}` }, data);
        expect([schema, ok, ajv.errorsText()]).toEqual([schema, true, 'No errors']);
      };
      const created = await sys.api('/api/orders', { method: 'POST', body: { id: 'c1', customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ', items: ['Борщ'] } });
      check('orders', 'Order', created.body);
      check('orders', 'Order', (await sys.api('/api/orders/c1')).body);
      check('orders', 'Error', (await sys.api('/api/orders/none')).body);
      check('restaurants', 'Restaurant', (await sys.api('/api/restaurants/rest-1')).body);
      check('restaurants', 'Error', (await sys.api('/api/restaurants/none')).body);
      await sys.api('/api/orders/c1/confirm', { method: 'POST' });
      const waiting = await eventually(async () => {
        const r = await sys.api('/api/deliveries/waiting');
        return r.body.length ? r.body : false;
      });
      waiting.forEach((w: unknown) => check('delivery', 'DispatchRequest', w));
      const delivery = await sys.api('/api/deliveries', { method: 'POST', body: { orderId: 'c1', courierId: 'courier-1' } });
      check('delivery', 'Delivery', delivery.body);
      check('delivery', 'Error', (await sys.api('/api/deliveries', { method: 'POST', body: { orderId: 'zzz', courierId: 'courier-2' } })).body);
    } finally {
      await sys.stopAll();
    }
  });

  test('події, які реально публікують сервіси, відповідають JSON Schema', async () => {
    const ajv = ajvWithContracts();
    const received: any[] = [];
    const sink = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { received.push(JSON.parse(body)); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); });
    });
    await new Promise<void>((r) => sink.listen(0, '127.0.0.1', r));
    const sinkUrl = `http://127.0.0.1:${(sink.address() as AddressInfo).port}/internal/events`;

    const restaurants = await freePort();
    const { createRestaurantsApp } = await import('../services/restaurants/config/app');
    const rest = createRestaurantsApp({ port: restaurants });
    await rest.start();
    const ordersPort = await freePort();
    const orders = createOrdersApp({
      port: ordersPort, restaurantsUrl: `http://127.0.0.1:${restaurants}`, restaurantsTimeoutMs: 500,
      subscribers: [{ type: 'order.confirmed', url: sinkUrl }], retryIntervalMs: 30,
    });
    await orders.start();
    const deliveryPort = await freePort();
    const delivery = createDeliveryApp({ port: deliveryPort, subscribers: [{ type: 'delivery.started', url: sinkUrl }], retryIntervalMs: 30 });
    await delivery.start();
    try {
      const base = `http://127.0.0.1:${ordersPort}`;
      await requestJson(`${base}/orders`, { method: 'POST', body: { id: 'e1', customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ', items: ['Борщ'] }, timeoutMs: 2000 });
      await requestJson(`${base}/orders/e1/confirm`, { method: 'POST', timeoutMs: 2000 });
      const dBase = `http://127.0.0.1:${deliveryPort}`;
      await requestJson(`${dBase}/internal/events`, {
        method: 'POST', timeoutMs: 2000,
        body: { eventId: 'x1', type: 'order.confirmed', version: 1, occurredAt: new Date().toISOString(), producer: 'orders', data: { orderId: 'e1', customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ', items: ['Борщ'] } },
      });
      await requestJson(`${dBase}/deliveries`, { method: 'POST', body: { orderId: 'e1', courierId: 'courier-1' }, timeoutMs: 2000 });
      await eventually(async () => received.length >= 2);

      const confirmed = received.find((e) => e.type === 'order.confirmed');
      const started = received.find((e) => e.type === 'delivery.started');
      expect([ajv.validate('order.confirmed.v1.schema.json', confirmed), ajv.errorsText()]).toEqual([true, 'No errors']);
      expect([ajv.validate('delivery.started.v1.schema.json', started), ajv.errorsText()]).toEqual([true, 'No errors']);
    } finally {
      await Promise.all([rest.stop(), orders.stop(), delivery.stop()]);
      sink.closeAllConnections?.();
      await new Promise((r) => sink.close(r));
    }
  });

  test('схема події відхиляє некоректні дані (негативна перевірка)', () => {
    const ajv = ajvWithContracts();
    const bad = { eventId: 'a', type: 'order.confirmed', version: 1, occurredAt: 't', producer: 'orders', data: { orderId: 'o1' } };
    expect(ajv.validate('order.confirmed.v1.schema.json', bad)).toBe(false);
  });
});
