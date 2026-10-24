import { createGatewayApp } from './config/app';

const app = createGatewayApp({
  port: Number(process.env.GATEWAY_PORT ?? 3000),
  ordersUrl: process.env.ORDERS_URL ?? 'http://127.0.0.1:3001',
  restaurantsUrl: process.env.RESTAURANTS_URL ?? 'http://127.0.0.1:3002',
  deliveryUrl: process.env.DELIVERY_URL ?? 'http://127.0.0.1:3003',
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 3000),
});

app.start().then((p) => console.log(`[gateway] слухає порт ${p}`));
process.on('SIGINT', () => app.stop().then(() => process.exit(0)));
process.on('SIGTERM', () => app.stop().then(() => process.exit(0)));
