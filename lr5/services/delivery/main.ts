import * as path from 'node:path';
import { createDeliveryApp } from './config/app';

const ordersUrl = process.env.ORDERS_URL ?? 'http://127.0.0.1:3001';
const dataDir = process.env.DATA_DIR ?? path.resolve('data');

createDeliveryApp({
  port: Number(process.env.DELIVERY_PORT ?? 3003),
  dbFile: path.join(dataDir, 'delivery.db'),
  subscribers: [{ type: 'delivery.started', url: `${ordersUrl}/internal/events` }],
  retryIntervalMs: Number(process.env.OUTBOX_RETRY_MS ?? 500),
  log: (message) => console.log(`[delivery] ${message}`),
}).then((app) => {
  app.start().then((p) => console.log(`[delivery] слухає порт ${p}, база даних: ${path.join(dataDir, 'delivery.db')}`));
  const shutdown = () => app.stop().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});
