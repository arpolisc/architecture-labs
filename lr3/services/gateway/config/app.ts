import { buildGatewayRouter, Upstream } from '../presentation/proxy';
import { errorResult } from '../../../shared/http/errors';
import { close, createJsonServer, listen } from '../../../shared/http/router';

export interface GatewayOptions {
  port: number;
  ordersUrl: string;
  restaurantsUrl: string;
  deliveryUrl: string;
  upstreamTimeoutMs: number;
}

/** Шлюз: зовнішній клієнт знає лише про /api/*, але не про внутрішній поділ на сервіси. */
export function createGatewayApp(options: GatewayOptions) {
  const upstreams: Upstream[] = [
    { name: 'orders', prefix: '/api/orders', internalPrefix: '/orders', baseUrl: options.ordersUrl },
    { name: 'restaurants', prefix: '/api/restaurants', internalPrefix: '/restaurants', baseUrl: options.restaurantsUrl },
    { name: 'delivery', prefix: '/api/deliveries', internalPrefix: '/deliveries', baseUrl: options.deliveryUrl },
  ];
  const router = buildGatewayRouter(upstreams, options.upstreamTimeoutMs);
  const server = createJsonServer(
    router,
    () => errorResult(500, 'INTERNAL_ERROR', 'Внутрішня помилка шлюзу'),
    errorResult(404, 'NOT_FOUND', 'Маршрут не знайдено'),
  );
  return {
    name: 'gateway',
    start: () => listen(server, options.port),
    stop: () => close(server),
  };
}
