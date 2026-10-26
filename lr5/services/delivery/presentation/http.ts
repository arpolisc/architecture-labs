import { ListWaitingRequests } from '../application/use-cases/ListWaitingRequests';
import { RegisterConfirmedOrder } from '../application/use-cases/RegisterConfirmedOrder';
import { StartDelivery } from '../application/use-cases/StartDelivery';
import { eventEndpoint, EventEndpointOptions } from '../../../shared/events/inbox';
import { errorResult } from '../../../shared/http/errors';
import { Router } from '../../../shared/http/router';

export interface DeliveryUseCases {
  startDelivery: StartDelivery;
  listWaiting: ListWaitingRequests;
  registerConfirmedOrder: RegisterConfirmedOrder;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function buildRouter(uc: DeliveryUseCases, events: EventEndpointOptions = {}): Router {
  const router = new Router();
  router.add('GET', '/health', async () => ({ status: 200, body: { service: 'delivery', status: 'ok' } }));

  router.add('GET', '/deliveries/waiting', async () => ({ status: 200, body: await uc.listWaiting.execute() }));

  router.add('POST', '/deliveries', async (ctx) => {
    const b = ctx.body as Record<string, unknown> | undefined;
    if (!b || typeof b !== 'object' || !isString(b.orderId) || !isString(b.courierId)) {
      return errorResult(400, 'VALIDATION_FAILED', 'Потрібні поля: orderId, courierId');
    }
    const result = await uc.startDelivery.execute(b.orderId, b.courierId);
    return { status: result.created ? 201 : 200, body: result.delivery };
  });

  // Внутрішній ендпоінт споживача подій; через шлюз не публікується.
  router.add(
    'POST',
    '/internal/events',
    eventEndpoint(
      {
        'order.confirmed.v1': async (envelope) => {
          const data = envelope.data as { orderId: string; restaurantId: string; deliveryAddress: string };
          await uc.registerConfirmedOrder.execute(data);
        },
      },
      events,
    ),
  );
  return router;
}
