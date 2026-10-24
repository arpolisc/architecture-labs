import * as net from 'node:net';
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

export interface System {
  urls: { gateway: string; orders: string; restaurants: string; delivery: string };
  ports: { gateway: number; orders: number; restaurants: number; delivery: number };
  stop(name: 'orders' | 'restaurants' | 'delivery'): Promise<void>;
  start(name: 'orders' | 'restaurants' | 'delivery'): Promise<void>;
  stopAll(): Promise<void>;
  api(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; timeoutMs?: number }): ReturnType<typeof requestJson>;
}

/** Піднімає всі сервіси та шлюз в одному процесі тестів на вільних портах (кожен із власним сховищем). */
export async function startSystem(opts: { restaurantsTimeoutMs?: number; retryIntervalMs?: number } = {}): Promise<System> {
  const ports = { gateway: await freePort(), orders: await freePort(), restaurants: await freePort(), delivery: await freePort() };
  const urls = {
    gateway: `http://127.0.0.1:${ports.gateway}`,
    orders: `http://127.0.0.1:${ports.orders}`,
    restaurants: `http://127.0.0.1:${ports.restaurants}`,
    delivery: `http://127.0.0.1:${ports.delivery}`,
  };
  const retryIntervalMs = opts.retryIntervalMs ?? 40;
  const factories = {
    orders: () =>
      createOrdersApp({
        port: ports.orders,
        restaurantsUrl: urls.restaurants,
        restaurantsTimeoutMs: opts.restaurantsTimeoutMs ?? 300,
        subscribers: [{ type: 'order.confirmed', url: `${urls.delivery}/internal/events` }],
        retryIntervalMs,
      }),
    restaurants: () => createRestaurantsApp({ port: ports.restaurants }),
    delivery: () =>
      createDeliveryApp({
        port: ports.delivery,
        subscribers: [{ type: 'delivery.started', url: `${urls.orders}/internal/events` }],
        retryIntervalMs,
      }),
  };
  const running: Record<string, { stop(): Promise<void> } | undefined> = {};
  const gateway = createGatewayApp({
    port: ports.gateway,
    ordersUrl: urls.orders,
    restaurantsUrl: urls.restaurants,
    deliveryUrl: urls.delivery,
    upstreamTimeoutMs: 1500,
  });
  const start = async (name: 'orders' | 'restaurants' | 'delivery') => {
    const app = factories[name]();
    await app.start();
    running[name] = app;
  };
  for (const name of ['restaurants', 'delivery', 'orders'] as const) await start(name);
  await gateway.start();

  return {
    urls,
    ports,
    start,
    async stop(name) {
      await running[name]?.stop();
      running[name] = undefined;
    },
    async stopAll() {
      await gateway.stop();
      for (const name of Object.keys(running)) await running[name]?.stop();
    },
    api: (path, init = {}) =>
      requestJson(`${urls.gateway}${path}`, { method: init.method, body: init.body, headers: init.headers, timeoutMs: init.timeoutMs ?? 3000 }),
  };
}
