import { createDeliveryApp } from './config/app';

const ordersUrl = process.env.ORDERS_URL ?? 'http://127.0.0.1:3001';

const app = createDeliveryApp({
  port: Number(process.env.DELIVERY_PORT ?? 3003),
  subscribers: [{ type: 'delivery.started', url: `${ordersUrl}/internal/events` }],
  retryIntervalMs: Number(process.env.OUTBOX_RETRY_MS ?? 500),
  log: (message) => console.log(`[delivery] ${message}`),
});

app.start().then((p) => console.log(`[delivery] слухає порт ${p}`));
process.on('SIGINT', () => app.stop().then(() => process.exit(0)));
process.on('SIGTERM', () => app.stop().then(() => process.exit(0)));
