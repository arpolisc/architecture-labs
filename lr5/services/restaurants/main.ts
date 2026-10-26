import * as path from 'node:path';
import { createRestaurantsApp } from './config/app';

const ordersUrl = process.env.ORDERS_URL ?? 'http://127.0.0.1:3001';
const dataDir = process.env.DATA_DIR ?? path.resolve('data');

createRestaurantsApp({
  port: Number(process.env.RESTAURANTS_PORT ?? 3002),
  dbFile: path.join(dataDir, 'restaurants.db'),
  subscribers: [{ type: 'restaurant.availability-changed', url: `${ordersUrl}/internal/events` }],
  retryIntervalMs: Number(process.env.OUTBOX_RETRY_MS ?? 500),
  simulatedLatencyMs: Number(process.env.RESTAURANTS_SIMULATED_LATENCY_MS ?? 0),
  log: (message) => console.log(`[restaurants] ${message}`),
}).then((app) => {
  app.start().then((p) => console.log(`[restaurants] слухає порт ${p}, база даних: ${path.join(dataDir, 'restaurants.db')}`));
  const shutdown = () => app.stop().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});
