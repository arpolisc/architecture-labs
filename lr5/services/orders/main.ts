import * as path from 'node:path';
import { createOrdersApp } from './config/app';

const port = Number(process.env.ORDERS_PORT ?? 3001);
const restaurantsUrl = process.env.RESTAURANTS_URL ?? 'http://127.0.0.1:3002';
const deliveryUrl = process.env.DELIVERY_URL ?? 'http://127.0.0.1:3003';
const dataDir = process.env.DATA_DIR ?? path.resolve('data');

createOrdersApp({
  port,
  dbFile: path.join(dataDir, 'orders.db'),
  restaurantsUrl,
  restaurantsTimeoutMs: Number(process.env.RESTAURANTS_TIMEOUT_MS ?? 1000),
  restaurantCacheTtlMs: Number(process.env.RESTAURANT_CACHE_TTL_MS ?? 30000),
  subscribers: [{ type: 'order.confirmed', url: `${deliveryUrl}/internal/events` }],
  retryIntervalMs: Number(process.env.OUTBOX_RETRY_MS ?? 500),
  log: (message) => console.log(`[orders] ${message}`),
}).then((app) => {
  app.start().then((p) => console.log(`[orders] слухає порт ${p}, база даних: ${path.join(dataDir, 'orders.db')}`));
  const shutdown = () => app.stop().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});
