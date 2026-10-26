import * as net from 'node:net';
import * as path from 'node:path';
import { createDeliveryApp } from '../../services/delivery/config/app';
import { createGatewayApp } from '../../services/gateway/config/app';
import { createOrdersApp } from '../../services/orders/config/app';
import { createRestaurantsApp } from '../../services/restaurants/config/app';
import { requestJson } from '../../shared/http/client';

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

export async function eventually<T>(fn: () => Promise<T | undefined | false>, timeoutMs = 8000, stepMs = 50): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error(`Умова не виконалась за ${timeoutMs} мс${last ? `: ${String(last)}` : ''}`);
}

type Name = 'orders' | 'restaurants' | 'delivery';

export interface System {
  urls: { gateway: string; orders: string; restaurants: string; delivery: string };
  ports: { gateway: number; orders: number; restaurants: number; delivery: number };
  stop(name: Name): Promise<void>;
  start(name: Name): Promise<void>;
  stopAll(): Promise<void>;
  /** Запущений застосунок сервісу (доступ до його outbox і бази даних у тестах). */
  app(name: Name): any;
  api(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; timeoutMs?: number }): ReturnType<typeof requestJson>;
}

export interface SystemOptions {
  restaurantsTimeoutMs?: number;
  retryIntervalMs?: number;
  /** Каталог для файлів баз даних; без нього кожна база існує лише в пам’яті. */
  dataDir?: string;
  /** Час життя кешу ресторанів у сервісі замовлень; за замовчуванням кеш вимкнено. */
  restaurantCacheTtlMs?: number;
  simulatedLatencyMs?: number;
}

/** Піднімає всі сервіси та шлюз в одному процесі тестів на вільних портах (кожен із власною базою даних). */
export async function startSystem(opts: SystemOptions = {}): Promise<System> {
  const ports = { gateway: await freePort(), orders: await freePort(), restaurants: await freePort(), delivery: await freePort() };
  const urls = {
    gateway: `http://127.0.0.1:${ports.gateway}`,
    orders: `http://127.0.0.1:${ports.orders}`,
    restaurants: `http://127.0.0.1:${ports.restaurants}`,
    delivery: `http://127.0.0.1:${ports.delivery}`,
  };
  const retryIntervalMs = opts.retryIntervalMs ?? 40;
  const dbFile = (name: string) => (opts.dataDir ? path.join(opts.dataDir, `${name}.db`) : undefined);
  const factories = {
    orders: () =>
      createOrdersApp({
        port: ports.orders,
        dbFile: dbFile('orders'),
        restaurantsUrl: urls.restaurants,
        restaurantsTimeoutMs: opts.restaurantsTimeoutMs ?? 300,
        restaurantCacheTtlMs: opts.restaurantCacheTtlMs ?? 0,
        subscribers: [{ type: 'order.confirmed', url: `${urls.delivery}/internal/events` }],
        retryIntervalMs,
      }),
    restaurants: () =>
      createRestaurantsApp({
        port: ports.restaurants,
        dbFile: dbFile('restaurants'),
        subscribers: [{ type: 'restaurant.availability-changed', url: `${urls.orders}/internal/events` }],
        retryIntervalMs,
        simulatedLatencyMs: opts.simulatedLatencyMs,
      }),
    delivery: () =>
      createDeliveryApp({
        port: ports.delivery,
        dbFile: dbFile('delivery'),
        subscribers: [{ type: 'delivery.started', url: `${urls.orders}/internal/events` }],
        retryIntervalMs,
      }),
  };
  const running: Partial<Record<Name, { stop(): Promise<void> }>> = {};
  const gateway = createGatewayApp({
    port: ports.gateway,
    ordersUrl: urls.orders,
    restaurantsUrl: urls.restaurants,
    deliveryUrl: urls.delivery,
    upstreamTimeoutMs: 1500,
  });
  const start = async (name: Name) => {
    const app = await factories[name]();
    await app.start();
    running[name] = app;
  };
  for (const name of ['restaurants', 'delivery', 'orders'] as const) await start(name);
  await gateway.start();

  return {
    urls,
    ports,
    start,
    app: (name) => running[name],
    async stop(name) {
      await running[name]?.stop();
      running[name] = undefined;
    },
    async stopAll() {
      await gateway.stop();
      for (const name of Object.keys(running) as Name[]) await running[name]?.stop();
    },
    api: (path, init = {}) =>
      requestJson(`${urls.gateway}${path}`, { method: init.method, body: init.body, headers: init.headers, timeoutMs: init.timeoutMs ?? 3000 }),
  };
}
