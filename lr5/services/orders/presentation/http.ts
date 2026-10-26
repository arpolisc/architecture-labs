import { CreateOrder } from '../application/use-cases/CreateOrder';
import { ConfirmOrder } from '../application/use-cases/ConfirmOrder';
import { GetOrder } from '../application/use-cases/GetOrder';
import { GetCacheStats } from '../application/use-cases/GetCacheStats';
import { HandleDeliveryStarted } from '../application/use-cases/HandleDeliveryStarted';
import { InvalidateRestaurantCache } from '../application/use-cases/InvalidateRestaurantCache';
import { eventEndpoint, EventEndpointOptions } from '../../../shared/events/inbox';
import { errorResult } from '../../../shared/http/errors';
import { Router } from '../../../shared/http/router';

export interface OrdersUseCases {
  createOrder: CreateOrder;
  confirmOrder: ConfirmOrder;
  getOrder: GetOrder;
  handleDeliveryStarted: HandleDeliveryStarted;
  invalidateRestaurantCache: InvalidateRestaurantCache;
  getCacheStats: GetCacheStats;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Шар подання сервісу замовлень: розбір запиту, виклик сценарію, формування відповіді. Бізнес-правил немає. */
export function buildRouter(uc: OrdersUseCases, events: EventEndpointOptions = {}): Router {
  const router = new Router();

  router.add('GET', '/health', async () => ({ status: 200, body: { service: 'orders', status: 'ok' } }));

  router.add('POST', '/orders', async (ctx) => {
    const b = ctx.body as Record<string, unknown> | undefined;
    if (
      !b || typeof b !== 'object' ||
      !isString(b.id) || !isString(b.customerId) || !isString(b.restaurantId) ||
      !isString(b.deliveryAddress) || !Array.isArray(b.items) || !b.items.every(isString)
    ) {
      return errorResult(400, 'VALIDATION_FAILED', 'Потрібні поля: id, customerId, restaurantId, deliveryAddress, items[]');
    }
    const result = await uc.createOrder.execute({
      id: b.id,
      customerId: b.customerId,
      restaurantId: b.restaurantId,
      deliveryAddress: b.deliveryAddress,
      items: b.items as string[],
    });
    return { status: result.created ? 201 : 200, body: result.order };
  });

  router.add('POST', '/orders/:id/confirm', async (ctx) => ({
    status: 200,
    body: await uc.confirmOrder.execute(ctx.params.id),
  }));

  router.add('GET', '/orders/:id', async (ctx) => ({
    status: 200,
    body: await uc.getOrder.execute(ctx.params.id),
  }));

  // Внутрішній ендпоінт споживача подій; через шлюз не публікується.
  router.add(
    'POST',
    '/internal/events',
    eventEndpoint(
      {
        'delivery.started.v1': async (envelope) => {
          const data = envelope.data as { deliveryId: string; orderId: string; courierId: string };
          await uc.handleDeliveryStarted.execute(data);
        },
        'restaurant.availability-changed.v1': async (envelope) => {
          const data = envelope.data as { restaurantId: string };
          await uc.invalidateRestaurantCache.execute(data);
        },
      },
      events,
    ),
  );

  // Службова статистика кешу (через шлюз не публікується).
  router.add('GET', '/internal/cache', async () => ({ status: 200, body: await uc.getCacheStats.execute() }));

  return router;
}
