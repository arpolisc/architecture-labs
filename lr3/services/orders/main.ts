import { createOrdersApp } from './config/app';

const port = Number(process.env.ORDERS_PORT ?? 3001);
const restaurantsUrl = process.env.RESTAURANTS_URL ?? 'http://127.0.0.1:3002';
const deliveryUrl = process.env.DELIVERY_URL ?? 'http://127.0.0.1:3003';

const app = createOrdersApp({
  port,
  restaurantsUrl,
  restaurantsTimeoutMs: Number(process.env.RESTAURANTS_TIMEOUT_MS ?? 1000),
  subscribers: [{ type: 'order.confirmed', url: `${deliveryUrl}/internal/events` }],
  retryIntervalMs: Number(process.env.OUTBOX_RETRY_MS ?? 500),
  log: (message) => console.log(`[orders] ${message}`),
});

app.start().then((p) => console.log(`[orders] слухає порт ${p}`));
process.on('SIGINT', () => app.stop().then(() => process.exit(0)));
process.on('SIGTERM', () => app.stop().then(() => process.exit(0)));
